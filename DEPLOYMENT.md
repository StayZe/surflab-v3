# Deploiement incremental

Cette procedure remplace uniquement les fichiers de code. Elle ne recree pas
la plateforme et ne touche pas a `/home/steam/cs2_data`.

## Etat actuel

Le deploiement incremental a ete finalise le 16 juillet 2026. Le backend, le
monitoring, la mise a jour CS2 et les plugins ont ete verifies. Un serveur de
test a ete cree sur le port 27030, a charge `surf_boreas`, a redemarre sur la
meme map, a expire, puis le port 27030 a ete reutilise par un second serveur
et supprime proprement via l'API. Le serveur Boreas historique sur 27026 est
conserve comme environnement de recette. Les serveurs 27027 a 27029 ont ete
supprimes proprement et leurs ports sont libres.

Le premier joueur et son record Boreas (`41.828 s`) sont correctement ecrits
dans la base SharpTimer. Le timer, les records et le classement sont donc
valides. `/home/cs2server` peut maintenant entrer dans la phase de retrait,
mais uniquement par etapes et apres accord explicite : arret des conteneurs
fixes, observation, puis suppression des fichiers.

Les serveurs generes utilisent `DYNAMIC_CS2_LAN=1`. C'est necessaire avec
l'unique GSLT existant : Steam refuse son utilisation simultanee par plusieurs
conteneurs. Pour une future exposition publique multi-serveurs, prevoir un
GSLT distinct par serveur avant de passer cette valeur a `0`.

Les quatre conteneurs dynamiques anterieurs ont d'abord ete migres vers ce mode
et valides. Apres la recette, seul 27026 a ete conserve. Les trois autres
serveurs et les quatre conteneurs `-rollback-20260715` ont ete supprimes.

Les trois serveurs fixes et la MariaDB de `/home/cs2server` sont arretes depuis
le 16 juillet 2026 pour une periode d'observation. Les conteneurs, volumes et
fichiers ne sont pas encore supprimes et peuvent donc etre redemarres si un
besoin oublie est detecte.

Les routes de gestion sont protegees par `SURFLAB_API_KEY`. Le port 3000 est
lie a localhost et a l'adresse LAN du serveur, et les quotas
`MAX_ACTIVE_SERVERS` / `MAX_ACTIVE_PER_OWNER` sont actifs. Avant une exposition
Internet, ajouter en plus un pare-feu et limiter l'acces a l'adresse du backend
du site.

## Fichiers a proteger

Avant toute copie, conserver sur le serveur :

- `/home/surflab-v3/backend/.env` ;
- `/home/surflab-v3/backend/database.sqlite` et ses eventuels fichiers WAL ;
- `/home/steam/cs2_data/game/csgo/cfg/SharpTimer/database.db` ;
- `/home/steam/cs2_data` dans son ensemble.

La sauvegarde preproduction du 16 juillet 2026 est stockee dans
`/var/backups/surflab/20260716T1357Z/` et une copie verifiee se trouve sur le
poste local. Elle contient aussi un dump de l'ancienne base MariaDB et les
elements utiles du prototype fixe.

La migration de `database.sqlite` est additive : les colonnes absentes et trois
index sont ajoutes au premier demarrage. Les lignes existantes restent
intactes. Une ligne expiree conserve son dernier port dans `lastPort`, tandis
que `port` est libere pour une nouvelle creation.

## Ordre de recette

1. Copier cette version dans un dossier temporaire, sans ecraser `.env` ni les
   deux bases SQLite.
2. Rendre les scripts executables : `chmod +x scripts/update-cs2.sh plugins/*.sh`.
3. Construire le backend et verifier `/api/health`.
4. Verifier `/api/maps`, puis les anciens serveurs `/api/servers` avec le
   header `Authorization: Bearer <SURFLAB_API_KEY>`.
5. Creer un seul serveur dynamique de test, rejoindre la map et finir un run.
6. Confirmer Metamod, CounterStrikeSharp, SharpTimer, `!top`, `!rank`, puis les
   endpoints `/api/stats/*`.
7. Tester l'arret, le redemarrage et une courte expiration.
8. Tester `scripts/update-cs2.sh` pendant une fenetre de maintenance.
9. Supprimer du crontab `surflab` la ligne
   `*/30 ... /home/cs2server/update-cs2.sh`, puis ajouter dans le crontab root
   `0 */6 * * * /home/surflab-v3/scripts/update-cs2.sh >/dev/null 2>&1`.

Le backend ne passe un serveur Workshop a `running` qu'apres le chargement de
la map attendue. Il reapplique ensuite par RCON le hostname, `mp_timelimit 0`,
la desactivation des votes/rotations et `bot_quota 0`.

La recette est terminee. Ne supprimer `/home/cs2server` qu'apres la periode
d'observation de ses services arretes. La sauvegarde du 16 juillet contient
deja l'archive historique, le dump MariaDB et les fichiers utiles. La
suppression finale devra rester progressive : conteneurs, controle, volumes et
images propres au prototype, controle, puis fichiers.
