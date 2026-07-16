# SurfLab v3

Ce dossier est la base SurfLab v3 existante, conservee et fiabilisee. Il ne
s'agit pas d'une reecriture du projet.

SurfLab permet au site d'envoyer au backend une map, un nombre de joueurs, un
nom et une duree. Le backend cree alors un conteneur `cs2-surf-<port>` qui
utilise l'installation CS2 partagee dans `/home/steam/cs2_data`, puis renvoie
le port et l'adresse de connexion au client.

Le service est entierement gratuit. Il n'y a ni facturation, ni abonnement, ni
logique de paiement dans ce projet.

## Organisation retenue

```text
/home/
├── steam/
│   └── cs2_data/             installation du jeu et donnees runtime
└── surflab-v3/
    ├── backend/              API et base SQLite de gestion
    ├── frontend/             emplacement reserve au futur frontend
    ├── plugins/              Metamod, CounterStrikeSharp, SharpTimer, configs
    ├── scripts/              mise a jour de CS2 et exploitation
    ├── monitoring/           dashboard systeme existant
    ├── API.md
    ├── AUDIT.md
    └── docker-compose.yml
```

`/home/steam/cs2_data` reste volontairement hors du projet : ses 65+ Go ne
doivent jamais etre recopies dans le depot.

## Elements conserves

- routes et formats principaux de l'API existante ;
- base `backend/database.sqlite` et son historique ;
- meme GSLT et meme cle Steam conserves dans `backend/.env` ;
- image `joedwards32/cs2`, reseau host et noms `cs2-surf-*` ;
- monitoring existant ;
- SharpTimer et sa base SQLite partagee pour timer, records et classement.

Les serveurs generes sur le reseau local utilisent `DYNAMIC_CS2_LAN=1` et ne
presentent pas le GSLT a Steam. La cle Workshop reste reutilisee. Cette
separation evite le code Steam `5005`, car un GSLT unique ne peut pas etre
utilise par plusieurs serveurs publics simultanes.

## Securite de l'API

Les routes `/api/servers/*` sont reservees au backend du site et protegees par
`SURFLAB_API_KEY`. Cette cle doit etre transmise avec
`Authorization: Bearer <cle>` et ne doit jamais etre exposee dans le navigateur.
Les routes de sante, de maps et de classement restent publiques.

Les nouvelles creations exigent une map du catalogue et un `ownerId`. Des
quotas globaux, des quotas par utilisateur et des limites CPU/memoire sont
appliques aux nouveaux conteneurs. Les details sont dans `API.md` et
`backend/.env.example`.

## Demarrage du backend

```bash
cd /home/surflab-v3
docker compose up -d --build backend
curl http://127.0.0.1:3000/api/health
```

Ne jamais remplacer ni supprimer `backend/database.sqlite` pendant un
deploiement. `backend/.env` reste local au serveur et ne doit pas etre suivi par
Git. Les instructions de migration sont dans `DEPLOYMENT.md`.
