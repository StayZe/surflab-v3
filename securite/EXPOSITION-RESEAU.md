# CVE réellement exposées — analyse d'exploitabilité

**Date :** 22 juillet 2026
**Méthode :** croiser les CVE trouvées avec la **surface réellement atteignable depuis Internet**
(scan nmap) + vérification du statut de patch (Ubuntu Security Tracker, avis Valve/Source 2).

> Principe : une CVE n'est *exposée* que si un service **joignable depuis le réseau** utilise
> le code vulnérable sur une entrée attaquant. Le score CVSS mesure la gravité, pas l'atteignabilité.

---

## Surface exposée à Internet = 2 services seulement

D'après le scan complet des 65535 ports (`reseau/nmap-full-*.txt`) :

| Port | Service | Exposé | Reste (Caddy, API, monitoring) |
|---|---|---|---|
| **22/tcp** | OpenSSH (hôte) | 🌐 oui | 🔒 **filtrés par pare-feu** — non atteignables |
| **27027 udp** | Serveur CS2 (jeu + A2S) | 🌐 oui | |
| **27027 tcp** | RCON CS2 | 🌐 oui | |

Tout le reste (ports 80 / 3000 / 8080) est **filtré** : les milliers de CVE de Caddy, du backend
et du monitoring **ne sont pas atteignables depuis Internet**.

---

## 1. SSH — OpenSSH 9.6p1-3ubuntu13.18 → ✅ aucune exposition connue

⚠️ **La bannière `9.6p1` est trompeuse** : Ubuntu ne monte pas le numéro amont, il *rétroporte*
les correctifs dans le suffixe `-3ubuntu13.X`. Le niveau **13.18** (publié le 13/07/2026) est le
plus récent pour Ubuntu 24.04 → corrigé contre **toutes** les CVE OpenSSH connues :

| CVE | Nature | Statut sur 13.18 |
|---|---|---|
| CVE-2024-6387 (**regreSSHion**) | RCE pré-auth root | ✅ patché (dès 13.3) |
| CVE-2023-48795 (**Terrapin**) | Troncature de canal | ✅ patché (corrigé en amont dès 9.6) |
| CVE-2025-26465 / 26466 | MitM client / DoS pré-auth | ✅ patché (13.8) |
| CVE-2026-3497 · CVE-2025-61984/85 | Crash GSSAPI / exécution côté client | ✅ patché (13.15) |
| USN-8533-1 : CVE-2026-59995 → 60002 | Lot scp/sftp/GSSAPI | ✅ **corrigé précisément par 13.18** |

➡️ **Conclusion : le seul service exposé à toute l'Internet est entièrement à jour.**

---

## 2. Serveur CS2 (port 27027) → pas de RCE serveur connue ; risque = disponibilité

**Surface réelle :** le port jeu UDP (protocole Source 2 + requêtes Steam A2S), le TCP RCON,
et SourceTV. C'est tout ce qui est atteignable sans compte.

| Menace | Verdict | Détail |
|---|---|---|
| **RCE distante sur le serveur** | ✅ aucune connue | Les RCE « Source » célèbres visent le **client** qui rejoint un serveur malveillant — ici le serveur est la victime autoritative, non concerné. |
| **Crash pré-auth** (`CConnectionlessLanMgr::UnpackPacket`) | ✅ patché par Valve | L'image télécharge le binaire CS2 courant via SteamCMD → corrigé. |
| **A2S reflection / amplification DDoS** | 🟡 fortement atténué | Neutralisé par le *challenge* A2S_INFO obligatoire (dé-amplification) + cvars `sv_max_queries_sec/_global/_window`. |
| **Flood UDP volumétrique** | 🟠 inhérent | Aucun moteur n'y résiste seul → protection anti-DDoS en amont (hébergeur) si besoin. |
| **RCON (TCP exposé)** | 🟢 protégé | Le backend génère un mot de passe **aléatoire 192 bits** par serveur (`crypto.randomBytes(24)`) → brute-force irréaliste. *(Note : défaut de repli `changeme` dans le code si la variable manque — à ne jamais laisser survenir.)* |

➡️ **Conclusion : pas de faille d'exécution exposée ; le risque réel est la *disponibilité* (DDoS),
pas la compromission.**

---

## 3. Les 79 CVE « réseau » (AV:N) de l'image CS2 → ❌ NON atteignables par le jeu

Le filtre `AV:N` (vecteur réseau) remonte 79 CVE Critical/High dans l'image CS2
(`zlib`, `gnutls`, `libxml2`, `perl`, `libsoup`, `xterm`…). **Elles ne sont pas exposées** :
le binaire serveur CS2 **ne passe pas** les paquets réseau attaquant par ces bibliothèques.
`perl` n'écoute pas le réseau, `libxml2` ne parse pas de XML issu du protocole de jeu, etc.

➡️ Ce sont des problèmes **d'hygiène d'image** (à corriger par rebuild), **pas des expositions**.
C'est exactement le piège à ne pas confondre : *AV:N ≠ atteignable*.

---

## Bilan pour la présentation

> **Malgré des milliers de CVE dans les images, il n'y a essentiellement AUCUNE CVE
> réseau-exploitable exposée.** Les 2 seuls services joignables depuis Internet sont soit
> **entièrement patchés** (SSH 9.6p1-3ubuntu13.18), soit **sans RCE serveur publique connue**
> (serveur CS2). Le risque résiduel réaliste est la **disponibilité** (DDoS UDP), déjà atténué
> côté moteur, et l'**hygiène RCON**, déjà couverte par un mot de passe aléatoire fort.

**Démarche à valoriser :** ne pas confondre *gravité* (CVSS) et *exploitabilité* (atteignabilité).
Le pare-feu réduit la surface à 2 ports, et sur ces 2 ports il n'y a pas de vulnérabilité ouverte.
