# Audit de sécurité — SurfLab v3

**Date :** 22 juillet 2026
**Périmètre :** hôte `10.255.0.26` + les 5 images Docker de la stack
**Nature :** audit défensif de la propre infrastructure (non intrusif hors réseau interne)
**Outils :** Trivy (CVE images), nmap (surface réseau), Lynis (durcissement hôte), inspection config/secrets

> Tous les scans ont été lancés en conteneur, sans installation système.
> Rapports bruts dans les sous-dossiers `trivy/`, `reseau/`, `hote/`, `config/`.

---

## 1. Synthèse (pour présentation)

| Domaine | Verdict | Détail |
|---|---|---|
| **Surface réseau** | 🟢 Très bon | 2 ports ouverts sur 65535 : SSH + jeu. Tout le reste filtré par pare-feu. |
| **Gestion des secrets** | 🟢 Très bon | `.env` en `600`, rien dans git, **0 secret dans les images**. |
| **Durcissement conteneurs** | 🟢 Bon | `no-new-privileges`, limites CPU/RAM/PID, réseau privé. |
| **Socket Docker (backend)** | 🟠 À surveiller | Monté en **RW** → prise de contrôle de l'hôte si l'API est compromise. |
| **CVE des images** | 🔴 À traiter | Bases OS non patchées : ~940 CVE sur le backend, ~580 sur l'image CS2. |
| **Durcissement hôte** | 🟠 Moyen | Indice Lynis **63/100**. Options de montage + SSH à durcir. |

**Message clé :** le *périmètre* est excellent (rien d'inutile n'est exposé, secrets bien gérés),
la dette se situe dans les **images Docker vieillissantes** (à reconstruire) et le **socket Docker du backend**.

---

## 2. Surface réseau (nmap)

Scan complet des 65535 ports TCP depuis le réseau (`reseau/nmap-full-10.255.0.26.txt`) :

| Port | Service | Exposition |
|---|---|---|
| **22/tcp** | OpenSSH 9.6p1 (Ubuntu) | ouvert |
| **27027/tcp** | serveur CS2 (jeu) | ouvert |
| 80 / 3000 / 8080 | monitoring / API / backend | **filtrés** (pare-feu) |

➡️ Les services web ne sont **pas atteignables depuis le réseau** malgré le bind sur `10.255.0.26` :
un pare-feu ne laisse passer que SSH et le port de jeu. Excellent cloisonnement.

---

## 3. Vulnérabilités des images Docker (Trivy)

Sévérités HIGH / CRITICAL. Rapports détaillés : `trivy/*.txt` (lisible), `trivy/*.json` (complet).

| Image | Base OS | CRITICAL | HIGH | Origine principale |
|---|---|---|---|---|
| `surflab-v3-backend` | Debian 12.13 | **76** | **878** | Base OS (75/864) — code Node : seulement 1/14 |
| `joedwards32/cs2` | Debian 11.11 | 24 | 555 | Image upstream (Debian 11 vieillissante) |
| `caddy:2` | Alpine 3.22.3 | 6 | 63 | Binaire/libs Go |
| `monitoring-frontend` | Debian 12.15 | 6 | 22 | Base OS |
| `monitoring-api` | Debian 13.6 | 4 | 41 | Base OS |

**Lecture importante :** sur le backend, **98 % des CVE viennent de la base Debian non patchée**,
pas du code applicatif (15 CVE seulement côté Node.js). Un simple `apt-get upgrade` au build,
une base plus récente/minimale (`-slim`, distroless) et des rebuilds réguliers éliminent l'essentiel.

**Secrets dans les images :** ✅ **aucun** (scan secret de Trivy = 0 sur les 5 images).

---

## 4. Configuration & secrets (`config/config-audit.txt`)

- ✅ `backend/.env`, `frontend/.env` : permissions `600` (rw pour le propriétaire seul).
- ✅ Aucun fichier sensible suivi par git ; `.gitignore` couvre explicitement `.env*`.
- ✅ `.git-credentials` et credentials Claude en `600`.
- 🟠 **Socket Docker** : `cs2-manager-api` (backend) le monte en **RW**, `monitoring-api` en **RO**.
  Le RW est nécessaire (le backend orchestre les conteneurs de jeu) mais signifie qu'une
  compromission de l'API = contrôle total de l'hôte. C'est le principal chemin d'attaque interne.

---

## 5. Durcissement de l'hôte (Lynis — indice 63/100)

Rapport complet : `hote/lynis-full.txt`. Suggestions principales :

- **SSH** : `X11Forwarding yes` → passer à `no` ; confirmer `PasswordAuthentication no`
  et `PermitRootLogin no` (fichier `50-cloud-init.conf` non lisible sans root — à vérifier).
- **Options de montage** : ajouter `noexec,nosuid,nodev` sur `/tmp`, `/var/tmp`, `/home` si possible.
- **/proc** : monter avec `hidepid=2` pour masquer les process des autres utilisateurs.
- **PAM** : installer `libpam-passwdqc`/`pam_cracklib` (robustesse des mots de passe).
- **GRUB** : mot de passe bootloader (empêche le mode single-user sans authentification).
- **login.defs** : configurer l'âge min/max des mots de passe et les rounds de hachage.

---

## 6. Recommandations priorisées

| # | Priorité | Action | Effort |
|---|---|---|---|
| 1 | 🔴 Élevée | **Reconstruire l'image backend** sur une base à jour + `apt-get upgrade`, puis rebuilds périodiques. Élimine ~940 CVE. | Moyen |
| 2 | 🟠 Élevée | **Restreindre le socket Docker** du backend : passer par un `docker-socket-proxy` filtrant les API autorisées. | Moyen |
| 3 | 🟠 Moyenne | **Durcir SSH** : `X11Forwarding no`, confirmer clés-only + pas de root. | Faible |
| 4 | 🟠 Moyenne | Surveiller l'**image CS2 upstream** (Debian 11) ; déjà isolée réseau, garder à jour à chaque release amont. | Faible |
| 5 | 🟢 Faible | Appliquer les durcissements **Lynis** (montages, hidepid, PAM, GRUB) pour monter l'indice > 75. | Moyen |

---

## 7. Points forts à valoriser

- 🟢 **Surface d'attaque minimale** : 2 ports exposés, pare-feu strict, services internes cloisonnés.
- 🟢 **Hygiène des secrets exemplaire** : hors git, hors images, permissions restrictives.
- 🟢 **Conteneurs déjà durcis** : `no-new-privileges`, quotas CPU/RAM/PID, réseau dédié.

---

## Arborescence du dossier

```
securite/
├── README.md                     ← ce rapport de synthèse (analyse + recommandations)
├── RESULTATS-CVE.md              ← CVE détaillées avec scores CVSS, triées par gravité
├── OUTILS-ET-COMMANDES.md        ← méthodologie : outils utilisés + commandes exactes
├── trivy/                        ← CVE par image (.txt lisible + .json complet)
│   ├── _resume.txt
│   └── <image>.txt / <image>.json
├── reseau/                       ← scans nmap (rapide + complet)
├── hote/                         ← Lynis + config SSH
└── config/                       ← audit pare-feu, socket Docker, permissions secrets
```
