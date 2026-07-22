# Résultats détaillés — CVE & scores CVSS

**Source :** rapports Trivy (`trivy/*.json`) · **Base de scores :** CVSS v3 (NVD en priorité)
**Date :** 22 juillet 2026

> Les tableaux « Top CVE » listent les vulnérabilités **triées par score CVSS décroissant**.
> Le score CVSS (0–10) mesure la gravité technique ; ≥ 9,0 = *Critical*, 7,0–8,9 = *High*.
> Colonne **Fix** : version corrigée si disponible (`—` = pas encore de correctif amont).

## Synthèse par image

| Image | Base OS | Critical | High | Medium | Low | Total | CVSS max |
|---|---|--:|--:|--:|--:|--:|--:|
| `surflab-v3-backend:latest` | debian 12.13 | 76 | 878 | 2524 | 1397 | 4906 | 9.8 |
| `joedwards32/cs2:latest` | debian 11.11 | 24 | 555 | 2336 | 550 | 3484 | 9.8 |
| `caddy:2` | alpine 3.22.3 | 6 | 63 | 60 | 25 | 158 | 10.0 |
| `monitoring-frontend:latest` | debian 12.15 | 6 | 22 | 64 | 69 | 170 | 9.8 |
| `monitoring-api:latest` | debian 13.6 | 4 | 41 | 76 | 114 | 263 | 9.8 |

### surflab-v3-backend:latest

*76 Critical · 878 High · 2819 CVE uniques. Top 15 (Critical/High) :*

| CVSS | Gravité | CVE | Paquet(s) | Installé | Fix | Résumé |
|--:|---|---|---|---|---|---|
| **9.8** | 🔴 Critical | [CVE-2026-25971](https://avd.aquasec.com/nvd/cve-2026-25971) | `imagemagick` +12 | 8:6.9.11.60+dfsg-1.6+deb12u8 | 8:6.9.11.60+dfsg-1.6+deb12u9 | ImageMagick: ImageMagick: Denial of Service via circular references in MSL files |
| **9.8** | 🔴 Critical | [CVE-2023-6879](https://avd.aquasec.com/nvd/cve-2023-6879) | `libaom3` | 3.6.0-1+deb12u2 | — | aom: heap-buffer-overflow on frame size change |
| **9.8** | 🔴 Critical | [CVE-2026-42010](https://avd.aquasec.com/nvd/cve-2026-42010) | `libgnutls30` | 3.7.9-2+deb12u6 | 3.7.9-2+deb12u7 | gnutls: gnutls: Authentication Bypass via NUL Character in Username |
| **9.8** | 🔴 Critical | [CVE-2026-49261](https://avd.aquasec.com/nvd/cve-2026-49261) | `libmariadb-dev` +3 | 1:10.11.14-0+deb12u2 | 1:10.11.18-0+deb12u1 | mariadb: MariaDB Server: Arbitrary code execution via wsrep_notify_cmd |
| **9.8** | 🔴 Critical | [CVE-2026-42217](https://avd.aquasec.com/nvd/cve-2026-42217) | `libopenexr-3-1-30` +1 | 3.1.5-5 | — | OpenEXR: OpenEXR: Information disclosure via malformed EXR image file processing |
| **9.8** | 🔴 Critical | [CVE-2026-8376](https://avd.aquasec.com/nvd/cve-2026-8376) | `libperl5.36` +3 | 5.36.0-7+deb12u3 | — | perl: Perl: Heap buffer overflow when compiling regular expressions on 32-bit bu |
| **9.8** | 🔴 Critical | [CVE-2026-6653](https://avd.aquasec.com/nvd/cve-2026-6653) | `libxml2` +1 | 2.9.14+dfsg-1.3~deb12u5 | — | libxml2: mingw-libxml2: libxml2: Denial of Service via crafted XML input due to  |
| **9.8** | 🔴 Critical | [CVE-2023-45853](https://avd.aquasec.com/nvd/cve-2023-45853) | `zlib1g` +1 | 1:1.2.13.dfsg-1 | — | zlib: integer overflow and resultant heap-based buffer overflow in zipOpenNewFil |
| **9.4** | 🔴 Critical | [CVE-2026-60002](https://avd.aquasec.com/nvd/cve-2026-60002) | `openssh-client` | 1:9.2p1-2+deb12u9 | — | openssh: OpenSSH: Use-after-free vulnerability during host key re-exchange on th |
| **9.1** | 🔴 Critical | [CVE-2026-56367](https://avd.aquasec.com/nvd/cve-2026-56367) | `imagemagick` +12 | 8:6.9.11.60+dfsg-1.6+deb12u8 | 8:6.9.11.60+dfsg-1.6+deb12u12 | Magick.NET-Q16-AnyCPU: Magick.NET-Q16-HDRI-AnyCPU: Magick.NET-Q16-HDRI-OpenMP-ar |
| **9.1** | 🔴 Critical | [CVE-2026-58016](https://avd.aquasec.com/nvd/cve-2026-58016) | `libglib2.0-0` +4 | 2.74.6-2+deb12u8 | — | glib: integer underflow in gio/gdbusintrospection.c via "g_dbus_node_info_new_fo |
| **9.1** | 🔴 Critical | [CVE-2026-33845](https://avd.aquasec.com/nvd/cve-2026-33845) | `libgnutls30` | 3.7.9-2+deb12u6 | 3.7.9-2+deb12u7 | gnutls: GnuTLS: Denial of Service via DTLS zero-length fragment |
| **9.1** | 🔴 Critical | [CVE-2026-44172](https://avd.aquasec.com/nvd/cve-2026-44172) | `libmariadb-dev` +3 | 1:10.11.14-0+deb12u2 | 1:10.11.18-0+deb12u1 | mariadb: MariaDB server: SQL injection vulnerability via improper handling of bi |
| **9.1** | 🔴 Critical | [CVE-2023-5841](https://avd.aquasec.com/nvd/cve-2023-5841) | `libopenexr-3-1-30` +1 | 3.1.5-5 | — | OpenEXR: Heap Overflow in Scanline Deep Data Parsing |
| **9.1** | 🔴 Critical | [CVE-2026-42216](https://avd.aquasec.com/nvd/cve-2026-42216) | `libopenexr-3-1-30` +1 | 3.1.5-5 | — | OpenEXR: OpenEXR: Information disclosure and denial of service via malformed EXR |

### joedwards32/cs2:latest

*24 Critical · 555 High · 2996 CVE uniques. Top 15 (Critical/High) :*

| CVSS | Gravité | CVE | Paquet(s) | Installé | Fix | Résumé |
|--:|---|---|---|---|---|---|
| **9.8** | 🔴 Critical | [CVE-2023-45853](https://avd.aquasec.com/nvd/cve-2023-45853) | `lib32z1` +1 | 1:1.2.11.dfsg-2+deb11u2 | — | zlib: integer overflow and resultant heap-based buffer overflow in zipOpenNewFil |
| **9.8** | 🔴 Critical | [CVE-2019-8457](https://avd.aquasec.com/nvd/cve-2019-8457) | `libdb5.3` | 5.3.28+dfsg1-0.8 | — | sqlite: heap out-of-bound read in function rtreenode() |
| **9.8** | 🔴 Critical | [CVE-2026-42010](https://avd.aquasec.com/nvd/cve-2026-42010) | `libgnutls30` | 3.7.1-5+deb11u9 | 3.7.1-5+deb11u10 | gnutls: gnutls: Authentication Bypass via NUL Character in Username |
| **9.8** | 🔴 Critical | [CVE-2026-50292](https://avd.aquasec.com/nvd/cve-2026-50292) | `libinput-bin` +1 | 1.16.4-3 | 1.16.4-3+deb11u1 | libinput: local privilege escalation via crafted uinput devices |
| **9.8** | 🔴 Critical | [CVE-2026-2781](https://avd.aquasec.com/nvd/cve-2026-2781) | `libnss3` | 2:3.61-1+deb11u4 | 2:3.61-1+deb11u5 | firefox: thunderbird: Integer overflow in the Libraries component in NSS |
| **9.8** | 🔴 Critical | [CVE-2026-6653](https://avd.aquasec.com/nvd/cve-2026-6653) | `libxml2` | 2.9.10+dfsg-6.7+deb11u9 | — | libxml2: mingw-libxml2: libxml2: Denial of Service via crafted XML input due to  |
| **9.8** | 🔴 Critical | [CVE-2026-23112](https://avd.aquasec.com/nvd/cve-2026-23112) | `linux-libc-dev` | 5.10.251-1 | 5.10.257-1 | kernel: nvmet-tcp: add bounds checks in nvmet_tcp_build_pdu_iovec |
| **9.8** | 🔴 Critical | [CVE-2026-8376](https://avd.aquasec.com/nvd/cve-2026-8376) | `perl-base` | 5.32.1-4+deb11u4 | — | perl: Perl: Heap buffer overflow when compiling regular expressions on 32-bit bu |
| **9.8** | 🔴 Critical | [CVE-2022-45063](https://avd.aquasec.com/nvd/cve-2022-45063) | `xterm` | 366-1+deb11u1 | — | xterm: code execution via OSC 50 input sequences |
| **9.1** | 🔴 Critical | [CVE-2023-23914](https://avd.aquasec.com/nvd/cve-2023-23914) | `curl` +2 | 7.74.0-1.3+steamrt3.2+deb11u16+bsrt3.1 | — | curl: HSTS ignored on multiple requests |
| **9.1** | 🔴 Critical | [CVE-2026-58016](https://avd.aquasec.com/nvd/cve-2026-58016) | `libglib2.0-0` | 2.66.8-1+deb11u8 | — | glib: integer underflow in gio/gdbusintrospection.c via "g_dbus_node_info_new_fo |
| **9.1** | 🔴 Critical | [CVE-2026-33845](https://avd.aquasec.com/nvd/cve-2026-33845) | `libgnutls30` | 3.7.1-5+deb11u9 | 3.7.1-5+deb11u10 | gnutls: GnuTLS: Denial of Service via DTLS zero-length fragment |
| **9.1** | 🔴 Critical | [CVE-2021-4048](https://avd.aquasec.com/nvd/cve-2021-4048) | `libopenblas0-pthread` | 0.3.13+ds-3+deb11u1 | — | lapack: Out-of-bounds read in *larrv |
| **9.1** | 🔴 Critical | [CVE-2026-2369](https://avd.aquasec.com/nvd/cve-2026-2369) | `libsoup2.4-1` | 2.72.0-2+deb11u3 | — | libsoup: libsoup: Buffer overread due to integer underflow when handling zero-le |
| **9.1** | 🔴 Critical | [CVE-2026-13221](https://avd.aquasec.com/nvd/cve-2026-13221) | `perl-base` | 5.32.1-4+deb11u4 | — | Perl versions through 5.43.9 produce silently incorrect regular expres ... |

### caddy:2

*6 Critical · 63 High · 127 CVE uniques. Top 15 (Critical/High) :*

| CVSS | Gravité | CVE | Paquet(s) | Installé | Fix | Résumé |
|--:|---|---|---|---|---|---|
| **10.0** | 🔴 Critical | [CVE-2025-44005](https://avd.aquasec.com/nvd/cve-2025-44005) | `github.com/smallstep/certificates` | v0.28.4 | 0.29.0 | github.com/smallstep/certificates: github.com/smallstep/certificates: Authorizat |
| **10.0** | 🔴 Critical | [CVE-2026-30836](https://avd.aquasec.com/nvd/cve-2026-30836) | `github.com/smallstep/certificates` | v0.28.4 | 0.30.0 | github.com/smallstep/certificates: Step CA: Unauthenticated certificate issuance |
| **10.0** | 🔴 Critical | [CVE-2025-68121](https://avd.aquasec.com/nvd/cve-2025-68121) | `stdlib` | v1.25.0 | 1.24.13, 1.25.7, 1.26.0-rc.3 | crypto/tls: crypto/tls: Incorrect certificate validation during TLS session resu |
| **9.8** | 🔴 Critical | [CVE-2026-31789](https://avd.aquasec.com/nvd/cve-2026-31789) | `libcrypto3` +1 | 3.5.5-r0 | 3.5.6-r0 | openssl: OpenSSL: Heap buffer overflow on 32-bit systems from large X.509 certif |
| **9.1** | 🔴 Critical | [CVE-2026-33186](https://avd.aquasec.com/nvd/cve-2026-33186) | `google.golang.org/grpc` | v1.73.0 | 1.79.3 | google.golang.org/grpc/grpc-go: google.golang.org/grpc/authz: gRPC-Go: Authoriza |
| **9.8** | 🟠 High | [CVE-2026-27590](https://avd.aquasec.com/nvd/cve-2026-27590) | `github.com/caddyserver/caddy/v2` | v2.10.2 | 2.11.1 | Caddy is an extensible server platform that uses TLS by default. Prior ... |
| **9.1** | 🟠 High | [CVE-2026-27586](https://avd.aquasec.com/nvd/cve-2026-27586) | `github.com/caddyserver/caddy/v2` | v2.10.2 | 2.11.1 | Caddy is an extensible server platform that uses TLS by default. Prior ... |
| **9.1** | 🟠 High | [CVE-2026-27587](https://avd.aquasec.com/nvd/cve-2026-27587) | `github.com/caddyserver/caddy/v2` | v2.10.2 | 2.11.1 | Caddy is an extensible server platform that uses TLS by default. Prior ... |
| **9.1** | 🟠 High | [CVE-2026-27588](https://avd.aquasec.com/nvd/cve-2026-27588) | `github.com/caddyserver/caddy/v2` | v2.10.2 | 2.11.1 | Caddy is an extensible server platform that uses TLS by default. Prior ... |
| **8.8** | 🟠 High | [CVE-2026-39828](https://avd.aquasec.com/nvd/cve-2026-39828) | `golang.org/x/crypto` | v0.40.0 | 0.52.0 | golang.org/x/crypto/ssh: golang.org/x/crypto/ssh: Unauthorized command execution |
| **8.7** | 🟠 High | [CVE-2026-39832](https://avd.aquasec.com/nvd/cve-2026-39832) | `golang.org/x/crypto` | v0.40.0 | 0.52.0 | golang.org/x/crypto/ssh/agent: golang.org/x/crypto/ssh/agent: Security bypass du |
| **8.2** | 🟠 High | [CVE-2026-39821](https://avd.aquasec.com/nvd/cve-2026-39821) | `golang.org/x/net` | v0.42.0 | 0.55.0 | golang.org/x/net/idna: golang: net/http: golang.org/x/net/idna: Privilege escala |
| **8.1** | 🟠 High | [CVE-2026-28387](https://avd.aquasec.com/nvd/cve-2026-28387) | `libcrypto3` +1 | 3.5.5-r0 | 3.5.6-r0 | openssl: OpenSSL: Arbitrary code execution due to use-after-free in DANE TLSA au |
| **8.1** | 🟠 High | [CVE-2026-45447](https://avd.aquasec.com/nvd/cve-2026-45447) | `libcrypto3` +1 | 3.5.5-r0 | 3.5.7-r0 | openssl: Heap Use-After-Free in OpenSSL PKCS7_verify() |
| **8.1** | 🟠 High | [CVE-2026-45135](https://avd.aquasec.com/nvd/cve-2026-45135) | `github.com/caddyserver/caddy/v2` | v2.10.2 | 2.11.3 | Caddy is an extensible server platform that uses TLS by default. From  ... |

### monitoring-frontend:latest

*6 Critical · 22 High · 87 CVE uniques. Top 15 (Critical/High) :*

| CVSS | Gravité | CVE | Paquet(s) | Installé | Fix | Résumé |
|--:|---|---|---|---|---|---|
| **9.8** | 🔴 Critical | [CVE-2026-8376](https://avd.aquasec.com/nvd/cve-2026-8376) | `perl-base` | 5.36.0-7+deb12u3 | — | perl: Perl: Heap buffer overflow when compiling regular expressions on 32-bit bu |
| **9.8** | 🔴 Critical | [CVE-2023-45853](https://avd.aquasec.com/nvd/cve-2023-45853) | `zlib1g` | 1:1.2.13.dfsg-1 | — | zlib: integer overflow and resultant heap-based buffer overflow in zipOpenNewFil |
| **9.1** | 🔴 Critical | [CVE-2026-13221](https://avd.aquasec.com/nvd/cve-2026-13221) | `perl-base` | 5.36.0-7+deb12u3 | — | Perl versions through 5.43.9 produce silently incorrect regular expres ... |
| **9.1** | 🔴 Critical | [CVE-2026-42496](https://avd.aquasec.com/nvd/cve-2026-42496) | `perl-base` | 5.36.0-7+deb12u3 | — | perl-archive-tar: perl-archive-tar: Path traversal via crafted symlinks allows a |
| **7.5** | 🔴 Critical | [CVE-2026-59873](https://avd.aquasec.com/nvd/cve-2026-59873) | `tar` | 7.5.11 | 7.5.19 | tar: node-tar: Denial of Service via crafted gzip bomb |
| **0.0** | 🔴 Critical | [CVE-2026-57433](https://avd.aquasec.com/nvd/cve-2026-57433) | `perl-base` | 5.36.0-7+deb12u3 | — | Storable versions before 3.41 for Perl have a signed integer overflow  ... |
| **8.4** | 🟠 High | [CVE-2026-57432](https://avd.aquasec.com/nvd/cve-2026-57432) | `perl-base` | 5.36.0-7+deb12u3 | — | Perl versions through 5.43.10 have an integer overflow in S_measure_st ... |
| **7.8** | 🟠 High | [CVE-2025-69720](https://avd.aquasec.com/nvd/cve-2025-69720) | `libtinfo6` +2 | 6.4-4 | — | ncurses: ncurses: Buffer overflow vulnerability may lead to arbitrary code execu |
| **7.8** | 🟠 High | [CVE-2026-48962](https://avd.aquasec.com/nvd/cve-2026-48962) | `perl-base` | 5.36.0-7+deb12u3 | — | perl-IO-Compress: perl-IO-Compress: Arbitrary code execution via attacker-contro |
| **7.5** | 🟠 High | [CVE-2026-41992](https://avd.aquasec.com/nvd/cve-2026-41992) | `gzip` | 1.12-1 | — | GNU gzip contains a global buffer overflow vulnerability in the LZH de ... |
| **7.5** | 🟠 High | [CVE-2026-42497](https://avd.aquasec.com/nvd/cve-2026-42497) | `perl-base` | 5.36.0-7+deb12u3 | — | perl-Archive-Tar: perl-Archive-Tar: Arbitrary file modification via crafted hard |
| **7.5** | 🟠 High | [CVE-2026-9538](https://avd.aquasec.com/nvd/cve-2026-9538) | `perl-base` | 5.36.0-7+deb12u3 | — | perl-Archive-Tar: perl-Archive-Tar: Denial of Service via crafted tar header wit |
| **7.5** | 🟠 High | [CVE-2026-13149](https://avd.aquasec.com/nvd/cve-2026-13149) | `brace-expansion` | 2.0.2 | 5.0.7, 1.1.16, 2.1.2 | brace-expansion: Brace-expansion: Denial of Service due to exponential-time comp |
| **7.5** | 🟠 High | [CVE-2026-33671](https://avd.aquasec.com/nvd/cve-2026-33671) | `picomatch` | 4.0.3 | 4.0.4, 3.0.2, 2.3.2 | picomatch: Picomatch: Regular Expression Denial of Service via crafted extglob p |
| **7.5** | 🟠 High | [CVE-2026-48815](https://avd.aquasec.com/nvd/cve-2026-48815) | `sigstore` | 3.1.0 | 4.1.1 | sigstore: Sigstore: Unauthorized certificates accepted due to ignored `certifica |

### monitoring-api:latest

*4 Critical · 41 High · 109 CVE uniques. Top 15 (Critical/High) :*

| CVSS | Gravité | CVE | Paquet(s) | Installé | Fix | Résumé |
|--:|---|---|---|---|---|---|
| **9.8** | 🔴 Critical | [CVE-2026-8376](https://avd.aquasec.com/nvd/cve-2026-8376) | `perl-base` | 5.40.1-6 | — | perl: Perl: Heap buffer overflow when compiling regular expressions on 32-bit bu |
| **9.1** | 🔴 Critical | [CVE-2026-13221](https://avd.aquasec.com/nvd/cve-2026-13221) | `perl-base` | 5.40.1-6 | — | Perl versions through 5.43.9 produce silently incorrect regular expres ... |
| **9.1** | 🔴 Critical | [CVE-2026-42496](https://avd.aquasec.com/nvd/cve-2026-42496) | `perl-base` | 5.40.1-6 | — | perl-archive-tar: perl-archive-tar: Path traversal via crafted symlinks allows a |
| **0.0** | 🔴 Critical | [CVE-2026-57433](https://avd.aquasec.com/nvd/cve-2026-57433) | `perl-base` | 5.40.1-6 | — | Storable versions before 3.41 for Perl have a signed integer overflow  ... |
| **8.4** | 🟠 High | [CVE-2026-57432](https://avd.aquasec.com/nvd/cve-2026-57432) | `perl-base` | 5.40.1-6 | — | Perl versions through 5.43.10 have an integer overflow in S_measure_st ... |
| **8.1** | 🟠 High | [CVE-2026-8286](https://avd.aquasec.com/nvd/cve-2026-8286) | `curl` +1 | 8.14.1-2+deb13u4 | — | curl: curl: Insecure connection establishment due to TLS configuration mismatch |
| **7.8** | 🟠 High | [CVE-2026-24882](https://avd.aquasec.com/nvd/cve-2026-24882) | `dirmngr` +6 | 2.4.7-21+deb13u1+b4 | — | GnuPG: GnuPG: Stack-based buffer overflow in tpm2daemon allows arbitrary code ex |
| **7.8** | 🟠 High | [CVE-2025-69720](https://avd.aquasec.com/nvd/cve-2025-69720) | `libncursesw6` +3 | 6.5+20250216-2 | — | ncurses: ncurses: Buffer overflow vulnerability may lead to arbitrary code execu |
| **7.8** | 🟠 High | [CVE-2026-48962](https://avd.aquasec.com/nvd/cve-2026-48962) | `perl-base` | 5.40.1-6 | — | perl-IO-Compress: perl-IO-Compress: Arbitrary code execution via attacker-contro |
| **7.8** | 🟠 High | [CVE-2026-39822](https://avd.aquasec.com/nvd/cve-2026-39822) | `stdlib` | v1.26.4 | 1.25.12, 1.26.5, 1.27.0-rc.2 | os: golang: Go os.Root: Symlink following vulnerability allows directory travers |
| **7.5** | 🟠 High | [CVE-2026-12064](https://avd.aquasec.com/nvd/cve-2026-12064) | `curl` +1 | 8.14.1-2+deb13u4 | — | curl: curl: SSH host verification bypass when using schemeless URLs with SFTP/SC |
| **7.5** | 🟠 High | [CVE-2026-8927](https://avd.aquasec.com/nvd/cve-2026-8927) | `curl` +1 | 8.14.1-2+deb13u4 | — | curl: Information disclosure due to uncleared proxy authentication state |
| **7.5** | 🟠 High | [CVE-2026-8932](https://avd.aquasec.com/nvd/cve-2026-8932) | `curl` +1 | 8.14.1-2+deb13u4 | — | libcurl: libcurl: Security feature bypass due to improper mTLS connection reuse |
| **7.5** | 🟠 High | [CVE-2026-9079](https://avd.aquasec.com/nvd/cve-2026-9079) | `curl` +1 | 8.14.1-2+deb13u4 | — | libcurl: libcurl: Information disclosure due to failure to clear proxy authentic |
| **7.5** | 🟠 High | [CVE-2026-9545](https://avd.aquasec.com/nvd/cve-2026-9545) | `curl` +1 | 8.14.1-2+deb13u4 | — | libcurl: libcurl: Information disclosure via cached SSL session and early data |

## CVE Critical avec correctif disponible (à traiter en priorité)

*Gravité Critical (distro) **et** correctif amont existant — le meilleur rapport risque/effort.*

| CVSS | CVE | Image | Paquet | Installé → Fix | Résumé |
|--:|---|---|---|---|---|
| **10.0** | [CVE-2025-44005](https://avd.aquasec.com/nvd/cve-2025-44005) | `caddy` | `github.com/smallstep/certificates` | v0.28.4 → 0.29.0 | github.com/smallstep/certificates: github.com/smallstep/certificates: Authorizat |
| **10.0** | [CVE-2026-30836](https://avd.aquasec.com/nvd/cve-2026-30836) | `caddy` | `github.com/smallstep/certificates` | v0.28.4 → 0.30.0 | github.com/smallstep/certificates: Step CA: Unauthenticated certificate issuance |
| **10.0** | [CVE-2025-68121](https://avd.aquasec.com/nvd/cve-2025-68121) | `caddy` | `stdlib` | v1.25.0 → 1.24.13, 1.25.7, 1.26.0-rc.3 | crypto/tls: crypto/tls: Incorrect certificate validation during TLS session resu |
| **9.8** | [CVE-2026-25971](https://avd.aquasec.com/nvd/cve-2026-25971) | `surflab-v3-backend` | `imagemagick` | 8:6.9.11.60+dfsg-1.6+deb12u8 → 8:6.9.11.60+dfsg-1.6+deb12u9 | ImageMagick: ImageMagick: Denial of Service via circular references in MSL files |
| **9.8** | [CVE-2026-42010](https://avd.aquasec.com/nvd/cve-2026-42010) | `surflab-v3-backend` | `libgnutls30` | 3.7.9-2+deb12u6 → 3.7.9-2+deb12u7 | gnutls: gnutls: Authentication Bypass via NUL Character in Username |
| **9.8** | [CVE-2026-49261](https://avd.aquasec.com/nvd/cve-2026-49261) | `surflab-v3-backend` | `libmariadb-dev` | 1:10.11.14-0+deb12u2 → 1:10.11.18-0+deb12u1 | mariadb: MariaDB Server: Arbitrary code execution via wsrep_notify_cmd |
| **9.8** | [CVE-2026-42010](https://avd.aquasec.com/nvd/cve-2026-42010) | `joedwards32/cs2` | `libgnutls30` | 3.7.1-5+deb11u9 → 3.7.1-5+deb11u10 | gnutls: gnutls: Authentication Bypass via NUL Character in Username |
| **9.8** | [CVE-2026-50292](https://avd.aquasec.com/nvd/cve-2026-50292) | `joedwards32/cs2` | `libinput-bin` | 1.16.4-3 → 1.16.4-3+deb11u1 | libinput: local privilege escalation via crafted uinput devices |
| **9.8** | [CVE-2026-2781](https://avd.aquasec.com/nvd/cve-2026-2781) | `joedwards32/cs2` | `libnss3` | 2:3.61-1+deb11u4 → 2:3.61-1+deb11u5 | firefox: thunderbird: Integer overflow in the Libraries component in NSS |
| **9.8** | [CVE-2026-23112](https://avd.aquasec.com/nvd/cve-2026-23112) | `joedwards32/cs2` | `linux-libc-dev` | 5.10.251-1 → 5.10.257-1 | kernel: nvmet-tcp: add bounds checks in nvmet_tcp_build_pdu_iovec |
| **9.8** | [CVE-2026-31789](https://avd.aquasec.com/nvd/cve-2026-31789) | `caddy` | `libcrypto3` | 3.5.5-r0 → 3.5.6-r0 | openssl: OpenSSL: Heap buffer overflow on 32-bit systems from large X.509 certif |
| **9.1** | [CVE-2026-56367](https://avd.aquasec.com/nvd/cve-2026-56367) | `surflab-v3-backend` | `imagemagick` | 8:6.9.11.60+dfsg-1.6+deb12u8 → 8:6.9.11.60+dfsg-1.6+deb12u12 | Magick.NET-Q16-AnyCPU: Magick.NET-Q16-HDRI-AnyCPU: Magick.NET-Q16-HDRI-OpenMP-ar |
| **9.1** | [CVE-2026-33845](https://avd.aquasec.com/nvd/cve-2026-33845) | `surflab-v3-backend` | `libgnutls30` | 3.7.9-2+deb12u6 → 3.7.9-2+deb12u7 | gnutls: GnuTLS: Denial of Service via DTLS zero-length fragment |
| **9.1** | [CVE-2026-44172](https://avd.aquasec.com/nvd/cve-2026-44172) | `surflab-v3-backend` | `libmariadb-dev` | 1:10.11.14-0+deb12u2 → 1:10.11.18-0+deb12u1 | mariadb: MariaDB server: SQL injection vulnerability via improper handling of bi |
| **9.1** | [CVE-2026-33845](https://avd.aquasec.com/nvd/cve-2026-33845) | `joedwards32/cs2` | `libgnutls30` | 3.7.1-5+deb11u9 → 3.7.1-5+deb11u10 | gnutls: GnuTLS: Denial of Service via DTLS zero-length fragment |
| **9.1** | [CVE-2026-33186](https://avd.aquasec.com/nvd/cve-2026-33186) | `caddy` | `google.golang.org/grpc` | v1.73.0 → 1.79.3 | google.golang.org/grpc/grpc-go: google.golang.org/grpc/authz: gRPC-Go: Authoriza |
| **8.8** | [CVE-2026-43037](https://avd.aquasec.com/nvd/cve-2026-43037) | `surflab-v3-backend` | `linux-libc-dev` | 6.1.164-1 → 6.1.170-1 | kernel: ip6_tunnel: clear skb2->cb[] in ip4ip6_err() |
| **8.8** | [CVE-2026-43037](https://avd.aquasec.com/nvd/cve-2026-43037) | `joedwards32/cs2` | `linux-libc-dev` | 5.10.251-1 → 5.10.257-1 | kernel: ip6_tunnel: clear skb2->cb[] in ip4ip6_err() |
| **7.5** | [CVE-2026-59873](https://avd.aquasec.com/nvd/cve-2026-59873) | `surflab-v3-backend` | `tar` | 6.2.1 → 7.5.19 | tar: node-tar: Denial of Service via crafted gzip bomb |
| **7.5** | [CVE-2026-59873](https://avd.aquasec.com/nvd/cve-2026-59873) | `monitoring-frontend` | `tar` | 7.5.11 → 7.5.19 | tar: node-tar: Denial of Service via crafted gzip bomb |
| **0.0** | [CVE-2026-43011](https://avd.aquasec.com/nvd/cve-2026-43011) | `surflab-v3-backend` | `linux-libc-dev` | 6.1.164-1 → 6.1.170-1 | kernel: net/x25: Fix potential double free of skb |
| **0.0** | [CVE-2026-53215](https://avd.aquasec.com/nvd/cve-2026-53215) | `surflab-v3-backend` | `linux-libc-dev` | 6.1.164-1 → 6.1.176-1 | kernel: net: mvpp2: refill RX buffers before XDP or skb use |
| **0.0** | [CVE-2026-43011](https://avd.aquasec.com/nvd/cve-2026-43011) | `joedwards32/cs2` | `linux-libc-dev` | 5.10.251-1 → 5.10.257-1 | kernel: net/x25: Fix potential double free of skb |

---

## Comment lire un score CVSS

- **9,0 – 10,0 · Critical** — exploitation à distance souvent triviale, impact majeur.
- **7,0 – 8,9 · High** — vulnérabilité sérieuse, à corriger en priorité.
- **4,0 – 6,9 · Medium** — impact modéré ou exploitation conditionnée.
- **0,1 – 3,9 · Low** — impact limité.

Le **vecteur CVSS** (ex. `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H`) détaille les conditions : `AV:N` = attaquable par le réseau, `PR:N` = sans privilège, `UI:N` = sans interaction utilisateur → ce sont les CVE les plus dangereuses.

**Score NVD vs gravité distro :** certaines CVE affichent un CVSS NVD élevé (ex. 9,8) mais une gravité *Low* — c'est normal : Debian/Ubuntu réévaluent la gravité selon leur contexte (option non compilée, exploitation non applicable au paquet livré). La colonne **Gravité** reflète l'avis de la distribution, la colonne **CVSS** le score NVD brut.

> ⚠️ **Contexte SurfLab :** la majorité de ces CVE proviennent des **paquets de base**
> des images (Debian/Alpine) et non du code applicatif. Beaucoup ne sont exploitables
> que localement ou nécessitent un service exposé — or seuls SSH et le port de jeu le sont
> (voir `README.md`). Le score CVSS mesure la gravité *intrinsèque*, pas le risque réel
> compte tenu de l'exposition. Priorité = celles avec **Fix ✅** + vecteur réseau (`AV:N`).