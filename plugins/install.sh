#!/bin/bash
# ============================================================================
# install.sh — (Ré)installe les plugins surf dans les données CS2 partagées
#               (/home/steam/cs2_data, montées par tous les cs2-surf-<port>)
#
# À utiliser si cs2_data a été wipe/recréé. Idempotent (écrase proprement).
# Passe par docker cp -> pas besoin de sudo, juste le groupe docker.
#
# APRÈS l'install : redémarrer les serveurs UN PAR UN (jamais simultanément,
# ils partagent le même install CS2 -> steamcmd concurrent = reconstruction
# du dépôt ~67 Go et serveur HS 30 min).
# ============================================================================
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"

C=$(docker ps --format '{{.Names}}' | grep '^cs2-surf-' | head -1)
if [ -z "$C" ]; then
  echo "ERREUR : aucun conteneur cs2-surf-* en cours. Démarres-en un d'abord."
  exit 1
fi
echo "[i] Installation via le conteneur $C ..."

docker cp "$DIR/addons/." "$C:/home/steam/cs2-dedicated/game/csgo/addons/"
docker cp "$DIR/cfg/SharpTimer/." "$C:/home/steam/cs2-dedicated/game/csgo/cfg/SharpTimer/"
docker cp "$DIR/pre.sh" "$C:/home/steam/cs2-dedicated/pre.sh"
docker exec -u root "$C" chown -R steam:steam \
  /home/steam/cs2-dedicated/game/csgo/addons \
  /home/steam/cs2-dedicated/game/csgo/cfg/SharpTimer \
  /home/steam/cs2-dedicated/pre.sh
docker exec -u root "$C" chmod 755 \
  /home/steam/cs2-dedicated/game/csgo/addons/counterstrikesharp/dotnet/dotnet

echo "[i] OK. Redémarre maintenant les serveurs UN PAR UN :"
echo "    docker restart cs2-surf-27026   # attendre qu'il soit up (~10 min)"
echo "    docker restart cs2-surf-27027   # puis celui-ci, etc."
