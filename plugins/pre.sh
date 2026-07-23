#!/bin/bash
# =====================================================================
#  SurfLab — PRE HOOK (greffe Metamod/plugins sur l'image joedwards32/cs2)
#
#  entry.sh fait : steamcmd -> source pre.sh -> lance cs2.sh
#  On en profite pour (re)patcher gameinfo.gi APRES steamcmd (au cas ou un
#  app_update aurait restaure le fichier vanilla). Idempotent.
#  Les addons (Metamod + CounterStrikeSharp + SharpTimer...) sont deja
#  presents dans cs2_data (partage par tous les serveurs du backend).
#
#  IMPORTANT : ce fichier est *source* par entry.sh (meme shell). Ne PAS
#  modifier les options du shell (pas de `set -u`/`set -e`) sous peine de
#  faire planter entry.sh sur ses variables optionnelles non definies.
# =====================================================================

GI="${STEAMAPPDIR:-/home/steam/cs2-dedicated}/game/csgo/gameinfo.gi"

if [ -f "$GI" ]; then
  if grep -qF 'csgo/addons/metamod' "$GI"; then
    echo "[SurfLab] gameinfo.gi deja patche (Metamod)"
  else
    echo "[SurfLab] patch de gameinfo.gi pour Metamod..."
    awk '
      /Game_LowViolence.*csgo_lv/ && !done {
        print
        print "\t\t\tGame\tcsgo/addons/metamod"
        done = 1
        next
      }
      { print }
    ' "$GI" > "${GI}.tmp" && mv "${GI}.tmp" "$GI"
    if grep -qF 'csgo/addons/metamod' "$GI"; then
      echo "[SurfLab] gameinfo.gi patche avec succes"
    else
      echo "[SurfLab] ECHEC du patch gameinfo.gi (ancre Game_LowViolence introuvable)"
    fi
  fi
else
  echo "[SurfLab] gameinfo.gi introuvable: $GI"
fi
