# API SurfLab v3

Base actuelle : `http://10.255.0.26:3000/api`

Les routes publiques sont `/health`, `/maps` et `/stats/*`. Toutes les routes
`/servers/*` sont reservees au backend du site et exigent :

```http
Authorization: Bearer <SURFLAB_API_KEY>
```

La cle ne doit jamais etre placee dans le JavaScript du navigateur. Le flux
attendu est `navigateur -> backend du site -> API SurfLab`. Les origines CORS
sont limitees par `CORS_ORIGINS`. Toutes les reponses contiennent
`success: true` ou `success: false`.

## Creer un serveur

`POST /servers/create`

```json
{
  "serverName": "SurfLab - Boreas",
  "maxPlayers": 12,
  "mapId": "3133346713",
  "ownerId": "user-42",
  "autoDelete": true
}
```

- `serverName` : 3 a 64 caracteres ;
- `maxPlayers` : entier de 1 a 16 par defaut ;
- `mapId` : ID Workshop numerique obligatoire et present dans le catalogue ;
- `ownerId` : identifiant du user obligatoire ;
- `autoDelete` : booleen optionnel, `true` par defaut.

Il n'y a pas de duree de vie fixe : un serveur ne s'arrete jamais tout seul
apres un delai. Seuls deux mecanismes peuvent y mettre fin :

1. **Inactivite** : si `autoDelete` est `true` (par defaut) et que le serveur
   reste a 0 joueur pendant plus de `INACTIVITY_TIMEOUT_MINUTES` (10 minutes
   par defaut), il est automatiquement arrete, son conteneur supprime, et la
   ligne retiree de la base (pas de statut `expired` conserve dans ce cas).
2. **Suppression manuelle** : `DELETE /servers/delete/:id`.

Passer `"autoDelete": false` a la creation desactive completement le point 1 :
le serveur tourne indefiniment tant que personne ne le supprime explicitement,
meme s'il reste vide.

Les serveurs crees avant l'introduction de ce flag n'ont pas de valeur
`autoDelete` en base ; ils sont traites comme `true` (comportement historique
inchange).

Les limites de production par defaut sont de 8 serveurs actifs au total et 2
par utilisateur. Chaque nouveau conteneur est limite a 4 Gio de memoire, 2 CPU,
1024 processus et trois fichiers de logs de 20 Mio.

Reponse :

```json
{
  "success": true,
  "id": 14,
  "port": 27030,
  "containerId": "...",
  "status": "starting",
  "joinUrl": "steam://connect/10.255.0.26:27030",
  "autoDelete": true
}
```

La creation est mise en file d'attente cote backend : deux requetes simultanees
ne peuvent plus choisir le meme port ni lancer deux operations Steam en meme
temps.

Pour une map Workshop, `starting` signifie que le conteneur existe mais que la
map n'est pas encore prete. Le backend attend la connexion Steam, charge la map
par RCON, verifie son vrai `Spawn Server`, reapplique les reglages Surf, puis
passe seulement le serveur a `running`. Le frontend doit donc interroger
`GET /servers/:id` avant d'afficher l'adresse comme prete a rejoindre.

## Gestion des serveurs

| Methode | Route | Description |
|---|---|---|
| GET | `/servers?page=1&limit=20` | Liste des serveurs |
| GET | `/servers/:id` | Detail et URL `steam://connect` |
| GET | `/servers/user/:ownerId` | Serveurs d'un utilisateur |
| GET | `/servers/sync` | Resynchronise tous les statuts avec Docker |
| GET | `/servers/:id/sync` | Resynchronise un serveur |
| POST | `/servers/:id/stop` | Arrete un serveur ; body `{"ownerId":"..."}` |
| POST | `/servers/:id/restart` | Redemarre un serveur ; body `{"ownerId":"..."}` |
| DELETE | `/servers/delete/:id` | Supprime le conteneur et la ligne ; body `{"ownerId":"..."}` |
| GET | `/maps` | Catalogue des maps Workshop |
| GET | `/health` | Etat simple du backend |

Statuts possibles : `starting`, `running`, `stopped`, `expired`, `missing`,
`timeout`, `error`, `error_steam_auth`.

Pour une ligne `expired`, `connection.port` affiche le dernier port utilise a
titre historique. `connection.released: true` indique qu'il peut deja etre
attribue a un autre serveur.

## Timer, records et classement

Les donnees viennent de SharpTimer dans
`/home/steam/cs2_data/game/csgo/cfg/SharpTimer/database.db`. Cette base est
partagee par les conteneurs dynamiques et lue en lecture seule par le backend.

| Route | Contenu |
|---|---|
| `GET /stats/leaderboard?limit=50` | Classement global aux points |
| `GET /stats/maps/:mapName/records?limit=50&style=0` | Meilleurs temps d'une map |
| `GET /stats/records/recent?limit=20` | Records recents |
| `GET /stats/players/:steamid` | Profil, rang et records d'un joueur |
| `GET /stats/summary` | Compteurs et meilleur temps de chaque map |

`available: false` signifie simplement que SharpTimer n'a pas encore cree la
base ou qu'aucun record n'est disponible.

## Monitoring separe

Le dashboard existant reste sur le port 80, sous `/api/monitoring` :
`players`, `containers`, `system`, `build` et `updates`.
