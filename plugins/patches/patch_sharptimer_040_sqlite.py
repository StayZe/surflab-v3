"""Correctif binaire cible pour le bug SQLite de SharpTimer v0.4.0.

La release officielle construit un REPLACE avec 15 colonnes et seulement
14 valeurs lors de la premiere connexion d'un joueur. Le remplacement garde
exactement la meme taille dans la table de chaines .NET et ajoute le parametre
@HideChatSpeed manquant. Il refuse tout DLL inattendu ou ambigu.
"""

from __future__ import annotations

import hashlib
import os
from pathlib import Path
import sys


OFFICIAL_SHA256 = "0b1f89b817575ce387234fe5ec337e1e556a2c71d40ff270b97a3118fe09b458"

OLD = (
    " (PlayerName, SteamID, TimesConnected, LastConnected, HideTimerHud, "
    "HideKeys, SoundsEnabled, PlayerFov, IsVip, BigGifID, GlobalPoints, "
    "HideWeapon, HidePlayers, Mode, HideChatSpeed) VALUES (@PlayerName, "
    "@SteamID, @TimesConnected, @LastConnected, @HideTimerHud, @HideKeys, "
    "@SoundsEnabled, @PlayerFov, @IsVip, @BigGifID, @GlobalPoints, "
    "@HideWeapon, @HidePlayers, @Mode)"
)

NEW_CORE = (
    "(PlayerName,SteamID,TimesConnected,LastConnected,HideTimerHud,HideKeys,"
    "SoundsEnabled,PlayerFov,IsVip,BigGifID,GlobalPoints,HideWeapon,"
    "HidePlayers,Mode,HideChatSpeed) VALUES(@PlayerName,@SteamID,"
    "@TimesConnected,@LastConnected,@HideTimerHud,@HideKeys,@SoundsEnabled,"
    "@PlayerFov,@IsVip,@BigGifID,@GlobalPoints,@HideWeapon,@HidePlayers,"
    "@Mode,@HideChatSpeed)"
)

if len(NEW_CORE) > len(OLD):
    raise RuntimeError("Le remplacement ne tient pas dans la chaine .NET")

NEW = NEW_CORE + (" " * (len(OLD) - len(NEW_CORE)))
OLD_BYTES = OLD.encode("utf-16le")
NEW_BYTES = NEW.encode("utf-16le")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit(f"Usage: {Path(sys.argv[0]).name} /chemin/SharpTimer.dll")

    dll = Path(sys.argv[1])
    data = dll.read_bytes()
    old_count = data.count(OLD_BYTES)
    new_count = data.count(NEW_BYTES)

    if old_count == 0 and new_count == 1:
        print(f"deja_corrige sha256={sha256(data)}")
        return 0
    if old_count != 1 or new_count != 0:
        raise RuntimeError(
            f"DLL inattendu: old={old_count}, new={new_count}, sha256={sha256(data)}"
        )
    if sha256(data) != OFFICIAL_SHA256:
        raise RuntimeError("Le DLL source ne correspond pas a SharpTimer v0.4.0 officiel")

    patched = data.replace(OLD_BYTES, NEW_BYTES, 1)
    if len(patched) != len(data):
        raise RuntimeError("La taille du DLL a change")

    temporary = dll.with_name(dll.name + ".tmp")
    temporary.write_bytes(patched)
    os.replace(temporary, dll)
    print(f"corrige sha256={sha256(patched)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
