from fastapi import FastAPI
from fastapi.responses import JSONResponse
import subprocess
import shutil
import psutil
import re
import os
from datetime import datetime

app = FastAPI()

# ─── Config ──────────────────────────────────────────────────────────────
LOG_FILE = "/var/log/cs2-update.log"
# Manifest CS2 des serveurs dynamiques (monté depuis /home/steam/cs2_data/steamapps)
MANIFEST_PATH = "/data/steamapps/appmanifest_730.acf"
# Les serveurs de jeu sont des conteneurs "cs2-surf-<port>" (créés par le backend surflab-v3)
CS2_SERVER_PREFIX = "cs2-surf-"

# ─── Existing ────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"ok": True, "service": "surflab-api"}

# ─── Docker containers status ────────────────────────────────────────────

@app.get("/monitoring/containers")
def get_containers():
    try:
        result = subprocess.run(
            ["docker", "ps", "--format", "{{.Names}}\t{{.Status}}\t{{.State}}\t{{.Ports}}"],
            capture_output=True, text=True, timeout=10
        )
        containers = []
        for line in result.stdout.strip().split("\n"):
            if not line:
                continue
            parts = line.split("\t")
            name = parts[0] if len(parts) > 0 else "unknown"
            # Conteneurs pertinents : serveurs de jeu (cs2-surf-*) + backend/manager
            if not (name.startswith("cs2") or "manager" in name):
                continue
            containers.append({
                "name": name,
                "status": parts[1] if len(parts) > 1 else "unknown",
                "state": parts[2] if len(parts) > 2 else "unknown",
                "ports": parts[3] if len(parts) > 3 else "",
                "service": ""
            })
        return {"containers": containers}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

# ─── System stats (CPU, RAM, Disk) ───────────────────────────────────────

@app.get("/monitoring/system")
def get_system():
    try:
        cpu_percent = psutil.cpu_percent(interval=1)
        mem = psutil.virtual_memory()
        disk = shutil.disk_usage("/")
        boot = datetime.fromtimestamp(psutil.boot_time())
        uptime = datetime.now() - boot
        load1, load5, load15 = os.getloadavg()

        return {
            "cpu": {
                "percent": cpu_percent,
                "cores": psutil.cpu_count(),
                "load_1m": round(load1, 2),
                "load_5m": round(load5, 2),
                "load_15m": round(load15, 2)
            },
            "memory": {
                "total_gb": round(mem.total / (1024**3), 1),
                "used_gb": round(mem.used / (1024**3), 1),
                "percent": mem.percent
            },
            "disk": {
                "total_gb": round(disk.total / (1024**3), 1),
                "used_gb": round(disk.used / (1024**3), 1),
                "free_gb": round(disk.free / (1024**3), 1),
                "percent": round(disk.used / disk.total * 100, 1)
            },
            "uptime": {
                "days": uptime.days,
                "hours": uptime.seconds // 3600,
                "minutes": (uptime.seconds % 3600) // 60,
                "formatted": f"{uptime.days}j {uptime.seconds // 3600}h {(uptime.seconds % 3600) // 60}m"
            }
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

# ─── CS2 Update logs ────────────────────────────────────────────────────

@app.get("/monitoring/updates")
def get_updates():
    try:
        if not os.path.exists(LOG_FILE):
            return {"updates": [], "last_check": None, "current_build": None}

        with open(LOG_FILE, "r") as f:
            lines = f.readlines()

        updates = []
        last_check = None
        current_build = None

        for line in lines:
            line = line.strip()
            if not line:
                continue

            ts_match = re.match(r"\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]", line)
            timestamp = ts_match.group(1) if ts_match else None

            if "MAJ" in line and "->" in line:
                builds = re.findall(r"(\d+)\s*->\s*(\d+)", line)
                if builds:
                    updates.append({
                        "type": "update",
                        "timestamp": timestamp,
                        "from_build": builds[0][0],
                        "to_build": builds[0][1]
                    })
            elif "jour" in line and "build" in line:
                last_check = timestamp
                build_match = re.search(r"build (\d+)", line)
                if build_match:
                    current_build = build_match.group(1)
            elif "ERREUR" in line:
                updates.append({
                    "type": "error",
                    "timestamp": timestamp,
                    "message": line.split("] ", 1)[-1] if "] " in line else line
                })
            elif "UPDATE OK" in line:
                updates.append({
                    "type": "success",
                    "timestamp": timestamp,
                    "message": line.split("] ", 1)[-1] if "] " in line else line
                })

        return {
            "updates": updates[-20:],
            "last_check": last_check,
            "current_build": current_build,
            "total_updates": len([u for u in updates if u["type"] == "update"]),
            "total_errors": len([u for u in updates if u["type"] == "error"])
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

# ─── CS2 Build info ─────────────────────────────────────────────────────

@app.get("/monitoring/build")
def get_build():
    try:
        manifest = MANIFEST_PATH
        if not os.path.exists(manifest):
            return {"error": "appmanifest_730.acf not found"}

        with open(manifest, "r") as f:
            content = f.read()

        build_match = re.search(r'"buildid"\s+"(\d+)"', content)
        name_match = re.search(r'"name"\s+"([^"]+)"', content)

        return {
            "build_id": build_match.group(1) if build_match else "unknown",
            "app_name": name_match.group(1) if name_match else "CS2",
            "manifest_path": manifest
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

# ─── A2S Query helper ────────────────────────────────────────────────────

def a2s_info(host, port):
    import socket

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(3)
    try:
        query = b"\xFF\xFF\xFF\xFF\x54Source Engine Query\x00"
        sock.sendto(query, (host, port))
        data, _ = sock.recvfrom(4096)

        # Challenge response (0x41)
        if len(data) >= 9 and data[4] == 0x41:
            challenge = data[5:9]
            sock.sendto(query + challenge, (host, port))
            data, _ = sock.recvfrom(4096)

        # Parse A2S_INFO response (0x49)
        if len(data) > 6 and data[4] == 0x49:
            idx = 6
            end = data.index(b"\x00", idx)
            server_name = data[idx:end].decode("utf-8", errors="replace")
            idx = end + 1
            end = data.index(b"\x00", idx)
            current_map = data[idx:end].decode("utf-8", errors="replace")
            idx = end + 1
            end = data.index(b"\x00", idx)
            idx = end + 1
            end = data.index(b"\x00", idx)
            idx = end + 1
            idx += 2
            players = data[idx]
            max_players = data[idx + 1]
            return server_name, current_map, players, max_players
    finally:
        sock.close()
    return None

# ─── CS2 Players endpoint ───────────────────────────────────────────────

def discover_servers():
    """Découvre les serveurs de jeu vivants (conteneurs cs2-surf-<port>)."""
    servers = []
    try:
        result = subprocess.run(
            ["docker", "ps", "--filter", f"name={CS2_SERVER_PREFIX}", "--format", "{{.Names}}"],
            capture_output=True, text=True, timeout=10
        )
        for name in result.stdout.strip().split("\n"):
            name = name.strip()
            if not name:
                continue
            m = re.search(r"(\d+)$", name)
            if not m:
                continue
            servers.append({"name": name, "port": int(m.group(1))})
    except Exception:
        pass
    servers.sort(key=lambda s: s["port"])
    return servers


@app.get("/monitoring/players")
def get_players():
    servers = discover_servers()

    results = []
    for srv in servers:
        try:
            info = a2s_info("host.docker.internal", srv["port"])
            if info:
                server_name, current_map, players, max_players = info
                results.append({
                    "name": srv["name"],
                    "port": srv["port"],
                    "online": True,
                    "players": players,
                    "max_players": max_players,
                    "map": current_map,
                    "server_name": server_name
                })
            else:
                results.append({
                    "name": srv["name"],
                    "port": srv["port"],
                    "online": True,
                    "players": 0,
                    "max_players": 16,
                    "map": "unknown"
                })
        except Exception:
            results.append({
                "name": srv["name"],
                "port": srv["port"],
                "online": False,
                "players": 0,
                "max_players": 16,
                "map": "offline"
            })

    total_players = sum(s["players"] for s in results)
    total_online = sum(1 for s in results if s["online"])

    return {
        "servers": results,
        "total_players": total_players,
        "total_online": f"{total_online}/{len(servers)}"
    }
