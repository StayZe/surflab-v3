#!/usr/bin/env bash
# Met a jour l'installation CS2 partagee par les conteneurs dynamiques SurfLab.
# Les conteneurs sont toujours arretes et redemarres un par un.
set -Eeuo pipefail

CS2_DIR="${CS2_DIR:-/home/steam/cs2_data}"
SURFLAB_DIR="${SURFLAB_DIR:-/home/surflab-v3}"
STEAMCMD="${STEAMCMD:-/usr/games/steamcmd}"
LOG_FILE="${LOG_FILE:-/var/log/cs2-update.log}"
LOCK_FILE="${LOCK_FILE:-/tmp/surflab-cs2-update.lock}"
MANAGER_CONTAINER="${MANAGER_CONTAINER:-cs2-manager-api}"
BOOT_WAIT_SECONDS="${BOOT_WAIT_SECONDS:-1200}"
APP_ID=730
VALIDATE=0
FORCE=0

for argument in "$@"; do
  case "$argument" in
    --force) FORCE=1 ;;
    --validate) VALIDATE=1; FORCE=1 ;;
    *) echo "Usage: sudo $0 [--force] [--validate]"; exit 2 ;;
  esac
done

mkdir -p "$(dirname "$LOG_FILE")"
touch "$LOG_FILE" || {
  echo "ERREUR : impossible d'ecrire dans $LOG_FILE (lancer avec sudo)."
  exit 1
}

log() {
  printf '[%s] %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*" | tee -a "$LOG_FILE"
}

for command in docker flock stat; do
  command -v "$command" >/dev/null || { log "ERREUR commande absente: $command"; exit 1; }
done
[[ -x "$STEAMCMD" ]] || { log "ERREUR SteamCMD introuvable: $STEAMCMD"; exit 1; }
[[ -d "$CS2_DIR" ]] || { log "ERREUR dossier CS2 introuvable: $CS2_DIR"; exit 1; }

exec 9>"$LOCK_FILE"
flock -n 9 || { log "ERREUR une mise a jour est deja en cours"; exit 1; }

read_build() {
  local manifest="$CS2_DIR/steamapps/appmanifest_${APP_ID}.acf"
  [[ -f "$manifest" ]] || { printf 'inconnu'; return; }
  sed -nE 's/^[[:space:]]*"buildid"[[:space:]]*"([0-9]+)".*/\1/p' "$manifest" | head -n 1
}

read_remote_build() {
  local response
  command -v curl >/dev/null || return 1
  command -v python3 >/dev/null || return 1
  response="$(curl -fsS --max-time 30 "https://api.steamcmd.net/v1/info/$APP_ID")" || return 1
  printf '%s' "$response" | python3 -c \
    "import json,sys; print(json.load(sys.stdin)['data'][str($APP_ID)]['depots']['branches']['public']['buildid'])" \
    2>/dev/null
}

backup_runtime_data() {
  local stamp backup_dir source
  stamp="$(date -u +'%Y%m%dT%H%M%SZ')"
  backup_dir="$SURFLAB_DIR/backups/runtime/$stamp"
  mkdir -p "$backup_dir"
  for source in \
    "$SURFLAB_DIR/backend/database.sqlite" \
    "$CS2_DIR/game/csgo/cfg/SharpTimer/database.db"; do
    if [[ -f "$source" ]]; then
      cp -a "$source" "$backup_dir/"
    fi
  done
  log "Sauvegarde runtime: $backup_dir"
}

wait_until_ready() {
  local name="$1" since="$2" deadline logs
  deadline=$(( $(date +%s) + BOOT_WAIT_SECONDS ))
  while (( $(date +%s) < deadline )); do
    if [[ "$(docker inspect -f '{{.State.Running}}' "$name" 2>/dev/null || true)" != "true" ]]; then
      log "ERREUR $name s'est arrete pendant le demarrage"
      return 1
    fi
    logs="$(docker logs --since "$since" "$name" 2>&1 || true)"
    if grep -q 'GameServerSteamAPIActivated()' <<<"$logs"; then
      log "$name est pret"
      return 0
    fi
    sleep 10
  done
  log "ERREUR timeout au demarrage de $name (${BOOT_WAIT_SECONDS}s)"
  return 1
}

restore_services() {
  local rc=0 name started
  RESTORE_ATTEMPTED=1
  for name in "${GAME_CONTAINERS[@]}"; do
    log "Redemarrage sequentiel: $name"
    started="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
    if ! docker start "$name" >/dev/null; then
      log "ERREUR impossible de redemarrer $name"
      rc=1
      break
    fi
    if ! wait_until_ready "$name" "$started"; then
      rc=1
      break
    fi
  done
  if (( MANAGER_WAS_RUNNING == 1 )); then
    docker start "$MANAGER_CONTAINER" >/dev/null || {
      log "ERREUR impossible de redemarrer $MANAGER_CONTAINER"
      rc=1
    }
  fi
  return "$rc"
}

on_exit() {
  local rc=$?
  trap - EXIT INT TERM
  set +e
  if (( RESTORE_ATTEMPTED == 0 )); then
    log "Restauration des services apres interruption (code $rc)"
    restore_services
  fi
  exit "$rc"
}

BEFORE_BUILD="$(read_build)"
log "CHECK build $BEFORE_BUILD"
if [[ "$BEFORE_BUILD" == "inconnu" || -z "$BEFORE_BUILD" ]]; then
  log "ERREUR manifest CS2 absent ou build local illisible"
  exit 1
fi

REMOTE_BUILD=""
if ! REMOTE_BUILD="$(read_remote_build)" || [[ -z "$REMOTE_BUILD" ]]; then
  if (( FORCE == 0 )); then
    log "ERREUR impossible de recuperer le build CS2 distant; aucun service ne sera arrete"
    exit 1
  fi
  REMOTE_BUILD="inconnu"
  log "WARN build distant indisponible, execution forcee"
else
  log "Build distant: $REMOTE_BUILD"
fi

if [[ "$BEFORE_BUILD" == "$REMOTE_BUILD" ]] && (( FORCE == 0 )); then
  log "OK deja a jour (build $BEFORE_BUILD); aucun redemarrage"
  exit 0
fi
log "UPDATE DISPONIBLE: $BEFORE_BUILD -> $REMOTE_BUILD"

mapfile -t GAME_CONTAINERS < <(
  docker ps --format '{{.Names}}' | grep -E '^cs2-surf-[0-9]+$' | sort -V || true
)
MANAGER_WAS_RUNNING=0
if [[ "$(docker inspect -f '{{.State.Running}}' "$MANAGER_CONTAINER" 2>/dev/null || true)" == "true" ]]; then
  MANAGER_WAS_RUNNING=1
fi
RESTORE_ATTEMPTED=0
trap on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if (( MANAGER_WAS_RUNNING == 1 )); then
  log "Arret temporaire: $MANAGER_CONTAINER"
  docker stop --time 30 "$MANAGER_CONTAINER" >/dev/null
fi
for name in "${GAME_CONTAINERS[@]}"; do
  log "Arret: $name"
  docker stop --time 60 "$name" >/dev/null
done

backup_runtime_data

STEAM_ARGS=(
  +force_install_dir "$CS2_DIR"
  +login anonymous
  +app_update 730
)
if (( VALIDATE == 1 )); then
  STEAM_ARGS+=(validate)
  log "Validation complete demandee (operation longue)"
fi
STEAM_ARGS+=(+quit)

CS2_OWNER="$(stat -c '%U' "$CS2_DIR")"
CS2_OWNER_GROUP="$(id -gn "$CS2_OWNER")"
CS2_ACCESS_GROUP="${CS2_ACCESS_GROUP:-$(stat -c '%G' "$(dirname "$CS2_DIR")")}"
STEAMCMD_HOME="${STEAMCMD_HOME:-/var/tmp/surflab-steamcmd-$CS2_OWNER}"
log "Mise a jour de $CS2_DIR avec SteamCMD (utilisateur $CS2_OWNER, groupe $CS2_ACCESS_GROUP)"
if [[ "$CS2_OWNER" != "root" ]] && command -v runuser >/dev/null; then
  install -d -m 700 -o "$CS2_OWNER" -g "$CS2_OWNER_GROUP" "$STEAMCMD_HOME"
  if ! runuser -u "$CS2_OWNER" -g "$CS2_ACCESS_GROUP" -- \
    env HOME="$STEAMCMD_HOME" "$STEAMCMD" "${STEAM_ARGS[@]}"; then
    log "ERREUR SteamCMD a echoue"
    exit 1
  fi
else
  if ! "$STEAMCMD" "${STEAM_ARGS[@]}"; then
    log "ERREUR SteamCMD a echoue"
    exit 1
  fi
fi

AFTER_BUILD="$(read_build)"
if [[ "$BEFORE_BUILD" != "$AFTER_BUILD" ]]; then
  log "MAJ $BEFORE_BUILD -> $AFTER_BUILD"
else
  log "CHECK build $AFTER_BUILD (deja a jour)"
fi

if ! restore_services; then
  log "ERREUR redemarrage incomplet; aucun autre serveur n'a ete lance en parallele"
  exit 1
fi

log "UPDATE OK build $AFTER_BUILD"
trap - EXIT INT TERM
