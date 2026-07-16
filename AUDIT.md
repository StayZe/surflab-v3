# Audit de l'existant

## Verdict

Oui, `/home/surflab-v3` est bien le projet qui genere les serveurs a la demande.
Son backend recoit les parametres, cree les conteneurs `cs2-surf-<port>` et
monte `/home/steam/cs2_data` dans chaque serveur. `/home/cs2server` correspond
au prototype de serveurs fixes et ne doit pas devenir la base du SaaS.

## Ce qui est deja fonctionnel

- API Express et historique dans une base SQLite ;
- creation, liste, arret, redemarrage et suppression des serveurs ;
- catalogue de maps Workshop ;
- installation CS2 partagee dans `/home/steam/cs2_data` ;
- Metamod, CounterStrikeSharp, SharpTimer 0.4.0, MovementUnlocker et
  cs2-tags ;
- timer, HUD, commandes `!top` et `!rank`, records, temps de stages et points ;
- endpoints backend pour exposer leaderboard, records et profils ;
- monitoring des conteneurs, joueurs, ressources, build et mises a jour.

SharpTimer est installe, charge et configure. Le correctif SQLite du 15 juillet
a permis d'enregistrer le joueur `yxmmy`, puis son premier record Boreas de
`41.828 s`. Les routes publiques de records et de classement renvoient ces
donnees. Les bases manager et SharpTimer repondent toutes les deux
`PRAGMA integrity_check = ok`. Les quelques anciennes donnees MariaDB
appartiennent au prototype fixe de `/home/cs2server` et ne sont pas utilisees
par SurfLab v3.

STFixes est present comme binaire de secours mais volontairement desactive :
son fichier VDF n'est pas charge, car ses signatures sont incompatibles avec
le build CS2 observe. Il ne faut pas le reactiver sans version compatible.

CS2Fixes-RampbugFix est lui aussi conserve mais desactive de facon reversible.
Sa derniere version officielle 5-1 ne charge pas sur le build CS2 24209309.
MovementUnlocker reste actif sur les serveurs dynamiques.

## Problemes corriges dans cette copie

- tokens Steam retires du code et relus depuis le meme `.env` ;
- validation des parametres recus du site ;
- allocation de ports sans collision, a partir de 27026 ;
- creation serialisee pour proteger l'installation CS2 partagee ;
- suppression du `validate` Workshop execute a chaque requete ;
- `STEAMAPPVALIDATE=0` pour les nouveaux conteneurs ;
- chargement Workshop pilote par RCON apres la connexion Steam ;
- statut `running` attribue uniquement apres le vrai `Spawn Server` de la map ;
- verrouillage des maps Surf : pas de limite de temps, vote vanilla, rotation,
  `nextlevel` ni bot ;
- mot de passe RCON aleatoire pour chaque nouveau conteneur ;
- correctif cible du bug SQLite SharpTimer 0.4.0 (`14 values for 15 columns`) ;
- duree et expiration automatique, sans casser les anciennes requetes ;
- liberation du port a l'expiration tout en conservant la ligne historique ;
- statuts `missing` pour les lignes dont le conteneur a disparu ;
- migrations SQLite additives, sans recreation de la base ;
- script de mise a jour adapte aux conteneurs dynamiques.

L'ancien cron de `/home/cs2server` a ete retire. Le crontab root execute
maintenant `/home/surflab-v3/scripts/update-cs2.sh` toutes les 6 heures. Le
script compare les builds avant toute action : aucun conteneur n'est arrete
lorsque CS2 est deja a jour.

## Etat du deploiement au 16 juillet 2026

- backend recree sans remplacer le `.env` ni `database.sqlite` ;
- API saine, 6 maps et un serveur de recette actif sur le port 27026 ;
- creation reelle d'un serveur de test sur le port 27030, demarrage valide,
  chargement confirme de `surf_boreas`, redemarrage et expiration valides ;
- reutilisation reelle du port 27030 par un second serveur, puis suppression
  authentifiee sans laisser de conteneur ni de ligne temporaire ;
- plage dynamique corrigee pour commencer a 27026 ;
- installation partagee mise a jour au build CS2 24209309 ;
- Metamod 2.0.0-dev+1406, CounterStrikeSharp 1.0.371 et SharpTimer 0.4.0
  valides sur les conteneurs dynamiques ;
- bases manager et SharpTimer controlees avec `PRAGMA integrity_check = ok` ;
- timer, record Boreas, classement global et endpoints `/api/stats/*` valides ;
- supervision saine et politiques de redemarrage automatique actives ;
- serveur Boreas historique conserve sur 27026 comme environnement de recette ;
- serveurs historiques 27027 a 27029 supprimes proprement via l'API ;
- quatre conteneurs rollback supprimes apres validation de la nouvelle version ;
- conteneurs fixes et MariaDB de `/home/cs2server` arretes de facon reversible
  le 16 juillet ; leurs fichiers et volumes restent presents pendant
  l'observation.

La creation, le chargement Workshop, les reglages anti-vote, le redemarrage,
l'expiration, la reutilisation du port et la suppression ont ete testes. Une
recette humaine a egalement produit le premier record Boreas, maintenant
visible dans les endpoints de statistiques.

## GSLT et mode local

Un meme GSLT utilise simultanement par plusieurs conteneurs provoque le refus
Steam `5005`. Les serveurs dynamiques sont donc lances avec
`DYNAMIC_CS2_LAN=1` et une connexion Steam anonyme, ce qui correspond au
reseau local `10.255.0.26`. La cle WebAPI existante reste utilisee pour les
maps Workshop et le GSLT existant reste conserve dans `.env` pour un eventuel
serveur public unique. Un deploiement public de plusieurs serveurs exigera un
pool de GSLT distincts ; il ne faut pas remettre le meme GSLT sur tous.

Etat courant apres nettoyage :

- `27026` : `surf_boreas` ;
- `27027` a `27029` : libres.

Les quatre rollbacks ont ete supprimes apres la recette joueur et les tests
d'expiration/reutilisation du port.

## Avant une exposition publique

L'API de gestion est maintenant protegee par `SURFLAB_API_KEY`, son CORS est
limite, les maps hors catalogue sont refusees et les quotas par defaut sont de
8 serveurs actifs au total et 2 par utilisateur. Les conteneurs ont aussi des
limites CPU, memoire, processus et journaux.

Les ports 80 et 3000 n'ecoutent que sur localhost et `10.255.0.26`. Avant une
exposition Internet, il reste a installer le domaine/TLS, limiter le pare-feu
aux flux necessaires et restreindre l'API a l'adresse du backend du site. Le
service reste entierement gratuit : ces limites protegent uniquement les
ressources.

## A conserver

- `/home/surflab-v3` ;
- `/home/steam/cs2_data` ;
- `backend/database.sqlite` ;
- la base SharpTimer `cfg/SharpTimer/database.db` ;
- les plugins/configurations et `pre.sh` ;
- le monitoring ;
- le fichier `backend/.env` actuel et ses memes tokens.

## Suppressions possibles, mais seulement apres accord explicite

1. Apres la periode d'observation, les conteneurs fixes arretes et la MariaDB
   de `/home/cs2server`.
2. `/home/cs2server/serverfiles`, doublon de l'installation CS2 (~66 Go).
3. Les images Docker uniquement utilisees par le prototype fixe.
4. L'image `cm2network/steamcmd` si aucun autre service ne l'utilise ; le
   backend n'en a plus besoin pour chaque map.
5. Le reste de `/home/cs2server`, apres avoir deplace son script utile et ses
   sauvegardes.

L'archive distante historique situee sous `/home/cs2server/backups/` est deja
incluse dans la sauvegarde verifiee du 16 juillet, stockee sous
`/var/backups/surflab/20260716T1357Z/` et copiee sur le poste local.

Les lignes historiques/stales de `backend/database.sqlite` ne sont pas
supprimees automatiquement. Le backend les marque `missing`, ce qui permet de
les examiner avant toute purge manuelle.

## Point systeme corrige

Le dossier personnel `/home/surflab` existe maintenant et appartient au compte
`surflab`. Les connexions SSH et les constructions Docker ne dependent plus
d'un home absent ou possede par root.
