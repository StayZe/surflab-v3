# Scripts d'exploitation

## Mise a jour de CS2

Le script `update-cs2.sh` remplace le script de `/home/cs2server` pour les
serveurs dynamiques. Il travaille uniquement sur `/home/steam/cs2_data`, met
les deux bases SQLite a l'abri, arrete temporairement le backend, puis
redemarre les conteneurs `cs2-surf-*` un par un.

SteamCMD est execute avec l'utilisateur proprietaire de `cs2_data`, le groupe
d'acces de `/home/steam` et un HOME technique isole sous `/var/tmp`. Sa sortie
complete est ajoutee a `/var/log/cs2-update.log`. En cas d'erreur SteamPipe, le
script nettoie les telechargements partiels et retente jusqu'a trois fois sans
supprimer le manifeste installe.

```bash
cd /home/surflab-v3
sudo ./scripts/update-cs2.sh
```

`--validate` ajoute une validation complete SteamCMD. Cette option est a
reserver a une installation corrompue car elle est beaucoup plus longue.

Le journal reste `/var/log/cs2-update.log`, donc le monitoring existant
continue de fonctionner sans changement.

Le redemarrage est considere pret avec les marqueurs CS2 actuels de session GC
ou d'etat `ss_active`. Le backend reprend ensuite la main et recharge par RCON
la map Workshop attendue si le conteneur a d'abord demarre sur une map vanilla.

## Controle automatique toutes les 6 heures

Le script compare d'abord le build installe au build public. Si les deux sont
identiques, il quitte immediatement et ne touche a aucun conteneur. SteamCMD et
les redemarrages ne sont executes que lorsqu'une mise a jour existe.

Sur le serveur, l'ancien cron du compte `surflab` a ete retire et la ligne de
`surflab-crontab.example` est installee dans le crontab root. Le script a
besoin des droits root pour acceder au compte `steam`, sauvegarder les bases
et gerer Docker :

```cron
0 */6 * * * /home/surflab-v3/scripts/update-cs2.sh >/dev/null 2>&1
```

`--force` execute quand meme une mise a jour. `--validate` implique `--force`
et ajoute la validation complete des fichiers.
