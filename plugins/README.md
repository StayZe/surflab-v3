# Plugins Surf des serveurs CS2 dynamiques

Ce dossier sauvegarde le stack installe dans `/home/steam/cs2_data`, partage
par les conteneurs `cs2-surf-<port>` crees par le backend.

## Contenu

- Metamod:Source 2.0.0-dev+1406 ;
- CounterStrikeSharp 1.0.371 ;
- SharpTimer 0.4.0 pour le timer, les records et le classement ;
- cs2-tags et MovementUnlocker ;
- configurations SharpTimer et Surf ;
- `pre.sh`, qui retablit Metamod apres une mise a jour CS2 ;
- `install.sh`, qui reinstalle le stack apres un wipe de `cs2_data`.

Les binaires volumineux de `addons/` sont volontairement ignores par Git mais
sont presents dans l'archive de deploiement incrementale.

## Base du timer

SharpTimer utilise la base SQLite partagee :

`/home/steam/cs2_data/game/csgo/cfg/SharpTimer/database.db`

Les tables importantes sont `PlayerStats`, `PlayerRecords` et
`PlayerStageTimes`. Le premier joueur `yxmmy` a ete enregistre avec succes le
15 juillet 2026. Aucun record ne sera present avant la fin d'un premier run.

## Correctif SharpTimer 0.4.0

Le binaire officiel contient une requete SQLite avec 15 colonnes mais seulement
14 valeurs lors de la creation du premier joueur. Le symptome est :

`SQLite Error 1: '14 values for 15 columns'`

Le script `patches/patch_sharptimer_040_sqlite.py` applique un correctif binaire
strict et reproductible. Il refuse tout DLL inattendu ou deja ambigu.

- SHA-256 du DLL officiel :
  `0b1f89b817575ce387234fe5ec337e1e556a2c71d40ff270b97a3118fe09b458`
- SHA-256 du DLL corrige et deploye :
  `850c96f0ef50af0588e4962d83e6d8403aad53c3d3264711f0d93622d0b6d834`

`libe_sqlite3.so` a egalement ete remplacee par la bibliotheque SQLite systeme,
compatible avec la glibc de l'image joedwards32/cs2.

## Configuration Surf

`cfg/SharpTimer/MapData/MapExecs/surf_.cfg` fixe notamment :

- `mp_timelimit 0` ;
- absence de vote de prochaine map et de changement automatique ;
- `sv_allow_votes false` ;
- `nextlevel` vide ;
- `bot_quota 0`.

Le backend reapplique aussi ces valeurs par RCON apres le chargement Workshop.
Cela evite un retour vers Inferno/Dust2 meme si CS2 refuse certaines commandes
provenant d'un fichier de configuration Workshop.

## Plugins conserves mais desactives

- STFixes : signatures incompatibles avec le build actuel ;
- CS2Fixes-RampBugFix 5-1 : ne charge pas avec le build CS2 24209309.

MovementUnlocker reste actif. Ne pas reactiver les deux plugins ci-dessus sans
version amont compatible.

## Exploitation

Ne jamais redemarrer plusieurs serveurs dynamiques en meme temps : ils partagent
l'installation Steam et des lancements SteamCMD concurrents peuvent saturer la
machine. Les redemarrages de maintenance doivent rester sequentiels.

Les messages `DISALLOWED WORKSHOP COMMANDS` et
`stfixes-metamod is not installed; disabling globalapi` sont attendus dans cette
configuration. Les valeurs critiques sont reappliquees par le backend.

Pour reinstaller le stack apres un wipe :

```bash
cd /home/surflab-v3/plugins
./install.sh
```

Redemarrer ensuite les serveurs un par un.
