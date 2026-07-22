# Outils de sécurité & commandes — SurfLab v3

**Date de l'audit :** 22 juillet 2026
**Cible :** hôte `10.255.0.26` + les 5 images Docker de la stack
**Principe :** tout est lancé **en conteneur**, sans installation système (rien n'est laissé sur l'hôte).

> Toutes les commandes ci-dessous sont **rejouables**. Les résultats sont écrits dans
> les sous-dossiers `trivy/`, `reseau/`, `hote/`, `config/`.

---

## Vue d'ensemble des outils

| Outil | Rôle | Cible | Mode | Rapport |
|---|---|---|---|---|
| **Trivy** | CVE + secrets + misconfig des images | 5 images Docker | conteneur | `trivy/` |
| **nmap** | Cartographie de la surface réseau | hôte `10.255.0.26` | conteneur | `reseau/` |
| **Lynis** | Durcissement / conformité de l'hôte | OS Linux | script (sans install) | `hote/` |
| **Inspection Docker/OS** | Socket Docker, permissions secrets, pare-feu, git, SSH | hôte | natif (lecture) | `config/`, `hote/` |
| **OpenVAS/GVM** | Scan de vulnérabilités réseau (équivalent Nessus) | hôte | conteneur | *(préparé, non lancé)* |

---

## 0. Reconnaissance — quels scanners sont déjà présents ?

```bash
# Chercher les scanners installés sur la machine
for t in nessuscli nessusd nessus openvas gvm nmap nikto trivy grype lynis; do
  p=$(command -v "$t" 2>/dev/null) && echo "TROUVÉ: $t -> $p" || echo "absent: $t"
done

# Services de scan actifs ?
systemctl list-units --type=service | grep -iE 'nessus|openvas|gvm'
```

> Résultat : **aucun scanner installé** → on passe par des conteneurs (Trivy, nmap) et
> un script autonome (Lynis).

---

## 1. Trivy — vulnérabilités des images Docker

**Rôle :** détecte les CVE (OS + dépendances), les secrets et les mauvaises configurations
dans une image Docker. C'est l'outil le plus rentable ici car toute la stack est conteneurisée.

```bash
# Récupérer l'outil
docker pull aquasec/trivy:latest

# Scan d'UNE image — rapport lisible (HIGH/CRITICAL uniquement)
docker run --rm \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v trivy-cache:/root/.cache/ \
  aquasec/trivy image \
    --scanners vuln,secret,misconfig \
    --severity HIGH,CRITICAL \
    --no-progress \
    surflab-v3-backend:latest

# Même image — rapport JSON complet (toutes sévérités), pour archivage
docker run --rm \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v trivy-cache:/root/.cache/ \
  aquasec/trivy image \
    --scanners vuln,secret,misconfig \
    --format json --no-progress \
    surflab-v3-backend:latest > trivy/backend.json
```

**Boucle sur les 5 images de la stack :**

```bash
for img in surflab-v3-backend:latest monitoring-api:latest \
           monitoring-frontend:latest caddy:2 joedwards32/cs2:latest; do
  safe=$(echo "$img" | tr '/:' '__')
  docker run --rm \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v trivy-cache:/root/.cache/ \
    aquasec/trivy image --scanners vuln,secret,misconfig \
      --severity HIGH,CRITICAL --no-progress "$img" > "trivy/${safe}.txt" 2>&1
done
```

- `-v /var/run/docker.sock` : permet à Trivy de lire les images locales.
- `-v trivy-cache:...` : cache la base de CVE (évite de la re-télécharger à chaque image).
- Le script complet utilisé : `../scratchpad/run_trivy.sh`.

---

## 2. nmap — surface réseau de l'hôte

**Rôle :** liste les ports réellement ouverts/atteignables et identifie les services + versions.
Confirme ce qui est exposé au réseau (au-delà de ce que `ss` montre en local).

```bash
# Récupérer l'outil
docker pull instrumentisto/nmap:latest

# Scan RAPIDE — top 1000 ports + détection de version
docker run --rm --network host instrumentisto/nmap \
  -sV -T4 --open 10.255.0.26 > reseau/nmap-quick-10.255.0.26.txt

# Scan COMPLET — les 65535 ports TCP (plus long, ~2 min)
docker run --rm --network host instrumentisto/nmap \
  -sV -p- --open -T4 10.255.0.26 > reseau/nmap-full-10.255.0.26.txt
```

- `--network host` : le conteneur partage la pile réseau de l'hôte pour un scan fidèle.
- `-sV` : détection de version des services · `-p-` : tous les ports · `--open` : n'affiche que l'ouvert · `-T4` : rapide.

**Voir en complément les ports en écoute côté hôte (natif) :**

```bash
ss -tlnp        # sockets TCP en écoute (ou: netstat -tlnp)
```

---

## 3. Lynis — durcissement de l'hôte

**Rôle :** audite la configuration de sécurité de l'OS (SSH, montages, PAM, kernel, permissions…)
et produit un « hardening index ». Rejouable sans installation système.

```bash
# Récupérer Lynis (script shell, aucune compilation)
wget -q https://github.com/CISOfy/lynis/archive/refs/heads/master.tar.gz -O lynis.tar.gz
tar xzf lynis.tar.gz && cd lynis-master

# Audit rapide, sans couleurs (facile à archiver)
./lynis audit system --quick --no-colors | tee ../hote/lynis-full.txt

# ⚠️ Pour un audit COMPLET, lancer en root (sinon tests root-only ignorés) :
sudo ./lynis audit system --quick --no-colors
```

> Dans cet audit, Lynis a tourné **sans root** (pas de sudo non-interactif) → résultat partiel,
> indice **63/100**. Relancer avec `sudo` pour couvrir les tests privilégiés.

---

## 4. Inspection config / secrets / pare-feu (natif, lecture seule)

**Rôle :** vérifications ciblées qu'aucun scanner ne fait aussi bien : exposition du socket
Docker, permissions des secrets, secrets dans git, règles de pare-feu, config SSH.

```bash
# --- Socket Docker monté dans les conteneurs (risque d'évasion si RW) ---
for c in cs2-manager-api monitoring-api-1 monitoring-caddy-1 monitoring-frontend-1 cs2-surf-27027; do
  echo "== $c =="
  docker inspect "$c" --format \
    '{{range .Mounts}}{{.Source}}->{{.Destination}} ({{if .RW}}RW{{else}}RO{{end}})
{{end}}' | grep -i docker.sock
done

# --- Permissions des fichiers de secrets ---
for f in /home/surflab-v3/backend/.env /home/surflab-v3/frontend/.env \
         /home/surflab/.git-credentials /home/surflab/.claude/.credentials.json; do
  stat -c '%A %U:%G %n' "$f" 2>/dev/null || echo "absent: $f"
done

# --- Aucun secret suivi par git ? ---
cd /home/surflab-v3
git ls-files | grep -iE '\.env$|credential|secret|\.pem$|\.key$' || echo "aucun secret suivi (OK)"
grep -iE 'env|secret|credential' .gitignore   # .gitignore couvre-t-il .env ?

# --- Pare-feu (nécessite root pour le détail) ---
sudo ufw status verbose
sudo iptables -S
sudo nft list ruleset

# --- Config SSH pertinente ---
grep -iE '^(PermitRootLogin|PasswordAuthentication|PubkeyAuthentication|PermitEmptyPasswords|X11Forwarding|Port|KbdInteractiveAuthentication)' \
  /etc/ssh/sshd_config
cat /etc/ssh/sshd_config.d/*.conf     # overrides cloud-init (souvent root-only)
```

---

## 5. OpenVAS / GVM — équivalent Nessus (préparé, non lancé)

**Rôle :** scan de vulnérabilités réseau approfondi, alternative open source à Nessus.
Non exécuté ici (synchro des feeds = 30 min à quelques heures). Script prêt à l'emploi.

```bash
# Volume persistant pour ne pas re-télécharger les feeds
docker volume create openvas-data

# Démarrage — interface web bloquée sur 127.0.0.1 (rien d'exposé à Internet)
docker run -d --name openvas --restart unless-stopped \
  -p 127.0.0.1:9392:9392 \
  -e PASSWORD='ChangeMoi_SurfLab_2026' \
  -e HTTPS=true \
  -v openvas-data:/data \
  immauss/openvas:latest

# Suivre la synchro des feeds au 1er démarrage
docker logs -f openvas

# Accès via tunnel SSH depuis le poste perso, puis https://127.0.0.1:9392
ssh -L 9392:127.0.0.1:9392 surflab@10.255.0.26
```

> Le scan se lance ensuite depuis l'UI (Scans > Tasks > Task Wizard, cible `10.255.0.26`).
> Script complet : `../scratchpad/openvas-setup.sh`.

---

## Nettoyage (retirer les outils conteneurisés)

```bash
# Images de scan
docker rmi aquasec/trivy:latest instrumentisto/nmap:latest

# Caches / volumes créés
docker volume rm trivy-cache

# OpenVAS (si déployé)
docker stop openvas && docker rm openvas
docker volume rm openvas-data
docker rmi immauss/openvas:latest
```

---

## Récapitulatif des sévérités trouvées (Trivy)

| Image | Base OS | CRITICAL | HIGH |
|---|---|---|---|
| `surflab-v3-backend` | Debian 12.13 | 76 | 878 |
| `joedwards32/cs2` | Debian 11.11 | 24 | 555 |
| `caddy:2` | Alpine 3.22.3 | 6 | 63 |
| `monitoring-frontend` | Debian 12.15 | 6 | 22 |
| `monitoring-api` | Debian 13.6 | 4 | 41 |

**Surface réseau (nmap) :** 2 ports ouverts sur 65535 → `22/tcp` (SSH) et `27027/tcp` (jeu).
**Durcissement hôte (Lynis) :** indice 63/100 · **Secrets dans les images :** 0.

> Analyse détaillée et recommandations : voir `README.md` dans ce même dossier.
