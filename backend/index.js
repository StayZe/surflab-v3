require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const Docker       = require('dockerode');
const crypto       = require('crypto');
const { PassThrough } = require('stream');
const { setupDb }  = require('./database');
const { pickAvailablePort, validateCreatePayload } = require('./validation');
const { sendRconCommand, sendRconWithRetry } = require('./rcon');
const { buildSurfSettingsCommand, parseCurrentMap, parsePlayerCount } = require('./workshop');
const {
    createApiKeyMiddleware,
    createCorsOptions,
    createFixedWindowRateLimiter,
    securityHeaders,
} = require('./security');
const sqlite3      = require('sqlite3');
const { open }     = require('sqlite');

const app    = express();
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

function readIntegerEnv(name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
    const value = Number.parseInt(process.env[name] || '', 10);
    return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

function readFloatEnv(name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
    const value = Number.parseFloat(process.env[name] || '');
    return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}

const SERVER_IP = process.env.SERVER_IP || '10.255.0.26';
const PAGE_LIMIT = 20;
const PORT = readIntegerEnv('PORT', 3000, { min: 1, max: 65535 });
const BIND_ADDRESS = process.env.BIND_ADDRESS || '0.0.0.0';
const BASE_PORT = readIntegerEnv('BASE_PORT', 27026, { min: 1024, max: 65535 });
const PORT_RANGE_SIZE = readIntegerEnv('PORT_RANGE_SIZE', 100, { min: 1, max: 1000 });
const CS2_IMAGE = process.env.CS2_IMAGE || 'joedwards32/cs2';
const CS2_DATA_PATH = process.env.CS2_DATA_PATH || '/home/steam/cs2_data';
const DEFAULT_DURATION_MINUTES = readIntegerEnv('DEFAULT_SERVER_DURATION_MINUTES', 60, { min: 15, max: 480 });
const MIN_DURATION_MINUTES = readIntegerEnv('MIN_SERVER_DURATION_MINUTES', 15, { min: 5, max: 480 });
const MAX_DURATION_MINUTES = readIntegerEnv('MAX_SERVER_DURATION_MINUTES', 480, { min: 15, max: 1440 });
const MAX_ACTIVE_SERVERS = readIntegerEnv('MAX_ACTIVE_SERVERS', 8, { min: 1, max: 64 });
const MAX_ACTIVE_PER_OWNER = readIntegerEnv('MAX_ACTIVE_PER_OWNER', 2, { min: 1, max: 8 });
const MAX_PLAYERS_PER_SERVER = readIntegerEnv('MAX_PLAYERS_PER_SERVER', 16, { min: 1, max: 64 });
const CREATE_RATE_LIMIT_PER_MINUTE = readIntegerEnv('CREATE_RATE_LIMIT_PER_MINUTE', 10, { min: 1, max: 120 });
const CONTAINER_MEMORY_MB = readIntegerEnv('CONTAINER_MEMORY_MB', 4096, { min: 1024, max: 16384 });
const CONTAINER_CPU_LIMIT = readFloatEnv('CONTAINER_CPU_LIMIT', 2, { min: 0.5, max: 8 });
const CONTAINER_PIDS_LIMIT = readIntegerEnv('CONTAINER_PIDS_LIMIT', 1024, { min: 128, max: 4096 });
const BOOT_TIMEOUT_MS = readIntegerEnv('BOOT_TIMEOUT_MS', 900000, { min: 60000, max: 1800000 });
const WORKSHOP_ENFORCEMENT_INTERVAL_MS = readIntegerEnv(
    'WORKSHOP_ENFORCEMENT_INTERVAL_SECONDS',
    60,
    { min: 30, max: 600 }
) * 1000;
const INACTIVITY_TIMEOUT_MINUTES = readIntegerEnv(
    'INACTIVITY_TIMEOUT_MINUTES',
    10,
    { min: 1, max: 1440 }
);
const RCON_HOST = process.env.RCON_HOST || SERVER_IP;
const DYNAMIC_CS2_LAN = process.env.DYNAMIC_CS2_LAN === '0' ? '0' : '1';
const ALLOW_UNLISTED_MAPS = process.env.ALLOW_UNLISTED_MAPS === 'true';
const SURFLAB_API_KEY = process.env.SURFLAB_API_KEY || '';

// Base SQLite de SharpTimer (leaderboard) — lue via le montage existant
// /home/steam/cs2_data -> /app/cs2_data (ouverte en LECTURE SEULE, les
// serveurs de jeu y écrivent les records)
const STATS_DB_PATH = process.env.STATS_DB_PATH
    || '/app/cs2_data/game/csgo/cfg/SharpTimer/database.db';

let db;
let createQueue = Promise.resolve();
let httpServer = null;
let shuttingDown = false;
let lastWorkshopEnforcementAt = 0;
const activeBootMonitors = new Set();
// serverId -> { count, updatedAt } — rafraichi par enforceWorkshopServers()
// a chaque interrogation RCON du serveur, pas de colonne DB pour une donnee
// aussi volatile.
const playerCountCache = new Map();
const requireApiKey = createApiKeyMiddleware(SURFLAB_API_KEY);
const createRateLimit = createFixedWindowRateLimiter({
    max: CREATE_RATE_LIMIT_PER_MINUTE,
    windowMs: 60_000,
});

app.disable('x-powered-by');
app.use(securityHeaders);
app.use(cors(createCorsOptions(process.env.CORS_ORIGINS || '')));
app.use(express.json({ limit: '16kb' }));
app.use('/api/servers', requireApiKey);
app.use('/api/users', requireApiKey);

// ── Helpers ────────────────────────────────────────────────────────────────

function formatServer(server) {
    const displayPort = server.port ?? server.lastPort ?? null;
    return {
        id:         server.id,
        name:       server.name,
        status:     server.status,
        ownerId:    server.ownerId ?? null,
        connection: {
            port:    displayPort,
            joinUrl: displayPort ? `steam://connect/${SERVER_IP}:${displayPort}` : null,
            released: server.port === null || server.port === undefined,
        },
        gameplay: {
            mapId:      server.mapId || 'de_inferno',
            isWorkshop: !!server.mapId,
            maxPlayers: server.maxPlayers || 10,
            currentPlayers: server.status === 'running'
                ? (playerCountCache.get(server.id)?.count ?? null)
                : null,
        },
        system: {
            containerId: server.containerId,
            createdAt:   server.createdAt,
            updatedAt:   server.updatedAt,
            durationMinutes: server.durationMinutes ?? null,
            expiresAt:   server.expiresAt ?? null,
            stoppedAt:   server.stoppedAt ?? null,
            failureReason: server.failureReason ?? null,
        },
    };
}

function paginate(rows, page, limit) {
    const total = rows.length;
    const pages = Math.ceil(total / limit) || 1;
    const offset = (page - 1) * limit;
    return { data: rows.slice(offset, offset + limit), total, page, pages, limit };
}

function normalizeWorkshopId(value) {
    return String(value).replace(/\.0+$/, '');
}

function getContainerEnv(info, name) {
    const prefix = `${name}=`;
    const entry = (info?.Config?.Env || []).find(value => value.startsWith(prefix));
    return entry ? entry.slice(prefix.length) : null;
}

async function monitorServerBoot(container, serverId, port, workshop = null) {
    if (activeBootMonitors.has(serverId)) return;
    activeBootMonitors.add(serverId);
    try {
        const logStream = await container.logs({
            follow: true,
            stdout: true,
            stderr: true,
            since: Math.floor(Date.now() / 1000),
        });

        const stdout = new PassThrough();
        const stderr = new PassThrough();
        docker.modem.demuxStream(logStream, stdout, stderr);

        let settled = false;
        let buffer = '';
        let timeoutHandle = null;
        let steamAuthRejected = false;
        let workshopRequestStarted = false;
        let workshopFinalizeStarted = false;
        let resolvedWorkshopMap = workshop?.mapSlug || null;

        const finish = async (status, reason = null) => {
            if (settled) return;
            settled = true;
            if (timeoutHandle) clearTimeout(timeoutHandle);
            try {
                await db.run(
                    "UPDATE servers SET status = ?, failureReason = ?, updatedAt = datetime('now') WHERE id = ?",
                    [status, reason, serverId]
                );
            } finally {
                activeBootMonitors.delete(serverId);
                logStream.destroy();
            }
        };

        const requestWorkshopMap = async () => {
            if (!workshop || workshopRequestStarted || settled) return;
            workshopRequestStarted = true;
            try {
                await sendRconWithRetry({
                    host: RCON_HOST,
                    port,
                    password: workshop.rconPassword,
                    command: `host_workshop_map ${workshop.mapId}`,
                    timeoutMs: 10_000,
                });
                console.log(`[WORKSHOP] Serveur ${serverId}: chargement de ${workshop.mapId} demande`);
            } catch (error) {
                await finish('error', `Workshop map load failed: ${error.message}`);
            }
        };

        const finalizeWorkshopMap = async () => {
            if (!workshop || workshopFinalizeStarted || settled) return;
            workshopFinalizeStarted = true;
            try {
                await sendRconWithRetry({
                    host: RCON_HOST,
                    port,
                    password: workshop.rconPassword,
                    command: buildSurfSettingsCommand(workshop.serverName),
                    timeoutMs: 10_000,
                });
                console.log(`[OK] Serveur ${serverId} (port ${port}) sur ${resolvedWorkshopMap}`);
                await finish('running');
            } catch (error) {
                await finish('error', `Workshop finalization failed: ${error.message}`);
            }
        };

        const onData = (chunk) => {
            if (settled) return;
            buffer = (buffer + chunk.toString('utf8')).slice(-8192);
            const steamReady = buffer.includes('GameServerSteamAPIActivated()')
                || buffer.includes('Gameserver logged on to Steam, assigned identity')
                || buffer.includes('CNetworkGameServerBase::SetServerState (ss_loading -> ss_active)');
            if (workshop && !resolvedWorkshopMap) {
                const escapedId = String(workshop.mapId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const match = buffer.match(
                    new RegExp(`addons\\(${escapedId}\\).*desc\\(Changelevel \\(([^)]+)\\)\\)`)
                );
                if (match) resolvedWorkshopMap = match[1];
            }

            if (workshop && resolvedWorkshopMap
                && buffer.includes(`Spawn Server: ${resolvedWorkshopMap}`)) {
                finalizeWorkshopMap().catch(err =>
                    console.error(`[WORKSHOP] Finalisation serveur ${serverId}:`, err)
                );
            } else if (steamReady && workshop) {
                requestWorkshopMap().catch(err =>
                    console.error(`[WORKSHOP] Serveur ${serverId}:`, err)
                );
            } else if (steamReady) {
                console.log(`[OK] Serveur ${serverId} (port ${port}) en ligne`);
                finish('running').catch(err =>
                    console.error(`[MONITOR] Mise a jour serveur ${serverId}:`, err)
                );
            } else if (buffer.includes('reason code 5005') && !steamAuthRejected) {
                steamAuthRejected = true;
                console.log(`[WARN] Serveur ${serverId}: code Steam 5005, attente de l'activation`);
            }
        };

        stdout.on('data', onData);
        stderr.on('data', onData);
        logStream.on('error', err => {
            if (!settled) console.warn(`[MONITOR] Logs serveur ${serverId}:`, err.message);
        });

        timeoutHandle = setTimeout(() => {
            if (!settled) {
                console.log(`[TIMEOUT] Serveur ${serverId}`);
                const status = steamAuthRejected ? 'error_steam_auth' : 'timeout';
                const reason = steamAuthRejected
                    ? 'Steam authentication rejected (5005) and boot timed out'
                    : 'Boot timeout';
                finish(status, reason).catch(err =>
                    console.error(`[MONITOR] Mise a jour serveur ${serverId}:`, err)
                );
            }
        }, BOOT_TIMEOUT_MS);

        if (workshop?.requestImmediately) {
            requestWorkshopMap().catch(err =>
                console.error(`[WORKSHOP] Recuperation serveur ${serverId}:`, err)
            );
        }

    } catch (err) {
        activeBootMonitors.delete(serverId);
        console.error(`Monitoring error serveur ${serverId}:`, err);
    }
}

function httpError(message, statusCode) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function assertOwnerAccess(server, ownerId) {
    if (!ownerId) {
        throw httpError('ownerId est obligatoire pour gerer ce serveur.', 400);
    }
    if (!server.ownerId || String(server.ownerId) !== String(ownerId)) {
        throw httpError('Ce serveur n’appartient pas a cet utilisateur.', 403);
    }
}

function enqueueCreate(task) {
    const queued = createQueue.then(task, task);
    createQueue = queued.catch(() => {});
    return queued;
}

async function assertCapacity(ownerId) {
    const activeStatuses = "('starting', 'running')";
    if (MAX_ACTIVE_SERVERS > 0) {
        const total = await db.get(`SELECT COUNT(*) AS n FROM servers WHERE status IN ${activeStatuses}`);
        if ((total?.n ?? 0) >= MAX_ACTIVE_SERVERS) {
            throw httpError('Capacite maximale de serveurs actifs atteinte.', 409);
        }
    }
    if (ownerId && MAX_ACTIVE_PER_OWNER > 0) {
        const owned = await db.get(
            `SELECT COUNT(*) AS n FROM servers WHERE ownerId = ? AND status IN ${activeStatuses}`,
            [ownerId]
        );
        if ((owned?.n ?? 0) >= MAX_ACTIVE_PER_OWNER) {
            throw httpError('Cet utilisateur a atteint sa limite de serveurs actifs.', 409);
        }
    }
}

async function findAvailablePort() {
    const used = new Set();
    const activeRows = await db.all('SELECT port FROM servers WHERE port IS NOT NULL');
    activeRows.forEach(row => used.add(Number(row.port)));

    const containers = await docker.listContainers({ all: true });
    for (const container of containers) {
        for (const name of container.Names || []) {
            const match = name.match(/^\/cs2-surf-(\d+)$/);
            if (match) used.add(Number(match[1]));
        }
    }

    const port = pickAvailablePort(used, BASE_PORT, PORT_RANGE_SIZE);
    if (port !== null) return port;
    throw httpError('Aucun port CS2 disponible dans la plage configuree.', 409);
}

async function createGameServer(payload) {
    if (!process.env.STEAM_WEBAPI_KEY) {
        throw httpError('Cle Steam Workshop absente dans backend/.env.', 500);
    }
    if (DYNAMIC_CS2_LAN === '0' && !process.env.STEAM_GSLT_TOKEN) {
        throw httpError('GSLT Steam absent pour le mode public.', 500);
    }

    await assertCapacity(payload.ownerId);
    const nextPort = await findAvailablePort();
    let workshopMapSlug = null;
    const workshopMapId = normalizeWorkshopId(payload.mapId);

    const mapRow = await db.get('SELECT * FROM maps WHERE id = ?', [payload.mapId]);
    if (!mapRow && !ALLOW_UNLISTED_MAPS) {
        throw httpError('Cette map ne fait pas partie du catalogue SurfLab.', 400);
    }
    const mapLabel = mapRow
        ? `${mapRow.name} (${mapRow.slug}) - Workshop ID ${workshopMapId}`
        : `Workshop ID ${workshopMapId}`;
    workshopMapSlug = mapRow?.slug || null;

    // La prise en charge Workshop native de l'image est experimentale et peut
    // rester sur <empty>. On demarre donc sur une map locale, puis le moniteur
    // demande la map Workshop par RCON une fois Steam reellement active.
    let args = `+hostname "${payload.serverName}" +sv_airaccelerate 150 +sv_cheats 0 -authkey ${process.env.STEAM_WEBAPI_KEY}`;
    const rconPassword = crypto.randomBytes(24).toString('base64url');

    const envVars = [
        // Un GSLT ne peut pas etre utilise par plusieurs serveurs publics en
        // parallele. En mode local, Steam se connecte anonymement et la cle
        // WebAPI reste disponible pour les maps Workshop.
        `SRCDS_TOKEN=${DYNAMIC_CS2_LAN === '1' ? '' : process.env.STEAM_GSLT_TOKEN}`,
        `CS2_SERVERNAME=${payload.serverName}`,
        `CS2_MAXPLAYERS=${payload.maxPlayers}`,
        `CS2_PORT=${nextPort}`,
        'CS2_IP=0.0.0.0',
        `CS2_LAN=${DYNAMIC_CS2_LAN}`,
        'CS2_SERVER_HIBERNATE=0',
        `CS2_RCONPW=${rconPassword}`,
        'STEAMAPPVALIDATE=0',
        `CS2_ADDITIONAL_ARGS=${args}`,
        'CS2_STARTMAP=de_inferno',
    ];

    console.log(`[CREATE] Serveur "${payload.serverName}" | Port ${nextPort} | Map : ${mapLabel}`);

    const container = await docker.createContainer({
        Image: CS2_IMAGE,
        name: `cs2-surf-${nextPort}`,
        HostConfig: {
            NetworkMode: 'host',
            Binds: [`${CS2_DATA_PATH}:/home/steam/cs2-dedicated/`],
            RestartPolicy: { Name: 'unless-stopped' },
            Memory: CONTAINER_MEMORY_MB * 1024 * 1024,
            NanoCpus: Math.round(CONTAINER_CPU_LIMIT * 1_000_000_000),
            PidsLimit: CONTAINER_PIDS_LIMIT,
            Init: true,
            LogConfig: {
                Type: 'json-file',
                Config: {
                    'max-size': '20m',
                    'max-file': '3',
                },
            },
        },
        Env: envVars,
        Labels: {
            'surflab.managed': 'true',
            'surflab.owner': payload.ownerId || '',
        },
    });

    const expiresAt = new Date(Date.now() + payload.durationMinutes * 60_000).toISOString();
    let serverId = null;
    try {
        const result = await db.run(
            `INSERT INTO servers
                (name, maxPlayers, mapId, port, containerId, status, ownerId, durationMinutes, expiresAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [payload.serverName, payload.maxPlayers, payload.mapId, nextPort, container.id,
                'starting', payload.ownerId, payload.durationMinutes, expiresAt]
        );
        serverId = result.lastID;
        await container.start();
        monitorServerBoot(container, serverId, nextPort, {
            mapId: workshopMapId,
            mapSlug: workshopMapSlug,
            rconPassword,
            serverName: payload.serverName,
        });
    } catch (err) {
        try { await container.remove({ force: true }); } catch (_) {}
        if (serverId) {
            await db.run(
                "UPDATE servers SET status = 'error', failureReason = ?, updatedAt = datetime('now') WHERE id = ?",
                [err.message, serverId]
            );
        }
        throw err;
    }

    return {
        success: true,
        id: serverId,
        port: nextPort,
        containerId: container.id,
        status: 'starting',
        joinUrl: `steam://connect/${SERVER_IP}:${nextPort}`,
        durationMinutes: payload.durationMinutes,
        expiresAt,
    };
}

// ── CREATE ─────────────────────────────────────────────────────────────────

app.post('/api/servers/create', createRateLimit, async (req, res) => {
    const validated = validateCreatePayload(req.body || {}, {
        defaultDuration: DEFAULT_DURATION_MINUTES,
        minDuration: MIN_DURATION_MINUTES,
        maxDuration: MAX_DURATION_MINUTES,
        maxPlayers: MAX_PLAYERS_PER_SERVER,
        requireMapId: true,
        requireOwnerId: true,
    });
    if (validated.error) {
        return res.status(400).json({ success: false, error: validated.error });
    }
    try {
        const result = await enqueueCreate(() => createGameServer(validated.value));
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
});

// ── READ : tous les serveurs ───────────────────────────────────────────────

app.get('/api/servers', async (req, res) => {
    try {
        const page  = Math.max(1, parseInt(req.query.page)  || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || PAGE_LIMIT));

        // "expired" est conserve en base pour l'historique (voir API.md) mais
        // n'a pas de sens dans la liste publique des serveurs a rejoindre.
        const rows   = await db.all("SELECT * FROM servers WHERE status != 'expired' ORDER BY createdAt DESC");
        const paged  = paginate(rows, page, limit);

        res.json({
            success:       true,
            totalServers:  paged.total,
            activeServers: rows.filter(s => s.status === 'running').length,
            page:          paged.page,
            pages:         paged.pages,
            limit:         paged.limit,
            data:          paged.data.map(formatServer),
        });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── READ : serveurs d'un owner ─────────────────────────────────────────────

app.get('/api/servers/user/:ownerId', async (req, res) => {
    try {
        const page  = Math.max(1, parseInt(req.query.page)  || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || PAGE_LIMIT));

        const rows  = await db.all(
            'SELECT * FROM servers WHERE ownerId = ? ORDER BY createdAt DESC',
            [req.params.ownerId]
        );
        const paged = paginate(rows, page, limit);

        res.json({
            success: true,
            ownerId: req.params.ownerId,
            total:   paged.total,
            page:    paged.page,
            pages:   paged.pages,
            limit:   paged.limit,
            data:    paged.data.map(formatServer),
        });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── SYNC : statuts de tous les serveurs ────────────────────────────────────

async function resolveContainer(server) {
    const candidates = [
        server.containerId,
        server.port ? `cs2-surf-${server.port}` : null,
    ].filter(Boolean);
    for (const id of [...new Set(candidates)]) {
        try {
            const container = docker.getContainer(id);
            const info = await container.inspect();
            return { container, info };
        } catch (err) {
            if (err.statusCode !== 404) throw err;
        }
    }
    return null;
}

async function syncServerStatus(server) {
    const isSimulated = String(server.containerId || '').startsWith('simulated');
    const resolved = isSimulated ? null : await resolveContainer(server);

    if (!resolved && !isSimulated) {
        // Statut "expired" : conserve volontairement en base pour l'historique
        // (voir API.md), on ne le touche pas.
        if (server.status === 'expired') {
            return { id: String(server.id), status: 'expired' };
        }
        // Deja constate "missing" au cycle precedent : le conteneur reste
        // introuvable, ce n'est pas un hoquet transitoire de Docker. On
        // supprime la ligne pour ne plus jamais la montrer au front.
        if (server.status === 'missing') {
            await db.run('DELETE FROM servers WHERE id = ?', [server.id]);
            playerCountCache.delete(server.id);
            console.log(`[MONITOR] Serveur ${server.id} supprime (conteneur absent de facon persistante).`);
            return { id: String(server.id), status: 'deleted' };
        }
        // Premiere detection : on laisse une chance (jusqu'au prochain cycle
        // de reconciliation) avant de supprimer, pour absorber un faux positif.
        await db.run(
            "UPDATE servers SET status = 'missing', updatedAt = datetime('now') WHERE id = ?",
            [server.id]
        );
        return { id: String(server.id), status: 'missing' };
    }

    let status = server.status;
    let containerId = server.containerId;
    let failureReason = server.failureReason;

    if (resolved) {
        containerId = resolved.info.Id;
        if (server.status === 'expired') {
            status = 'expired';
        } else if (resolved.info.State.Status === 'exited' || resolved.info.State.Status === 'dead') {
            status = 'stopped';
        } else if (resolved.info.State.Running && server.status !== 'starting') {
            status = 'running';
            failureReason = null;
        }
    }

    if (status !== server.status || containerId !== server.containerId || failureReason !== server.failureReason) {
        await db.run(
            "UPDATE servers SET status = ?, containerId = ?, failureReason = ?, updatedAt = datetime('now') WHERE id = ?",
            [status, containerId, failureReason, server.id]
        );
    }
    return { id: String(server.id), status };
}

app.get('/api/servers/sync', async (req, res) => {
    try {
        const servers = await db.all('SELECT * FROM servers');
        const synced = await Promise.all(servers.map(syncServerStatus));

        res.json({ success: true, data: synced });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});


// ── SYNC : statut d'un serveur spécifique ──────────────────────────────────

app.get('/api/servers/:id/sync', async (req, res) => {
    try {
        const server = await db.get('SELECT * FROM servers WHERE id = ?', [req.params.id]);
        if (!server) return res.status(404).json({ success: false, message: 'Serveur introuvable.' });

        const synced = await syncServerStatus(server);
        res.json({ success: true, data: synced });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});


// ── READ : un serveur par ID ───────────────────────────────────────────────

app.get('/api/servers/:id', async (req, res) => {
    try {
        const server = await db.get('SELECT * FROM servers WHERE id = ?', [req.params.id]);
        if (!server) return res.status(404).json({ success: false, message: "Serveur introuvable." });

        res.json({ success: true, data: formatServer(server) });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── STOP ───────────────────────────────────────────────────────────────────
app.post('/api/servers/:id/stop', async (req, res) => {
    try {
        const server = await db.get('SELECT * FROM servers WHERE id = ?', [req.params.id]);
        if (!server) return res.status(404).json({ success: false, message: "Serveur introuvable." });
        assertOwnerAccess(server, req.body?.ownerId);

        const resolved = await resolveContainer(server);
        if (resolved?.info.State.Running) {
            await resolved.container.stop({ t: 30 });
        }

        await db.run(
            "UPDATE servers SET status = ?, stoppedAt = datetime('now'), updatedAt = datetime('now') WHERE id = ?",
            ['stopped', server.id]
        );

        res.json({ success: true, message: `Serveur ${server.id} arrêté.` });
    } catch (err) {
        res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
});



// ── RESTART ────────────────────────────────────────────────────────────────
app.post('/api/servers/:id/restart', async (req, res) => {
    try {
        const server = await db.get('SELECT * FROM servers WHERE id = ?', [req.params.id]);
        if (!server) return res.status(404).json({ success: false, message: "Serveur introuvable." });
        assertOwnerAccess(server, req.body?.ownerId);

        if (server.status === 'expired' || (server.expiresAt && Date.parse(server.expiresAt) <= Date.now())) {
            return res.status(409).json({ success: false, message: 'Ce serveur a expire et ne peut plus etre redemarre.' });
        }

        const resolved = await resolveContainer(server);
        if (!resolved) {
            return res.status(409).json({ success: false, message: 'Le conteneur de ce serveur est introuvable.' });
        }
        if (resolved.info.State.Running) {
            await resolved.container.restart({ t: 30 });
        } else {
            await resolved.container.start();
        }

        await db.run(
            "UPDATE servers SET status = ?, containerId = ?, stoppedAt = NULL, failureReason = NULL, emptySince = NULL, updatedAt = datetime('now') WHERE id = ?",
            ['starting', resolved.info.Id, server.id]
        );

        let workshop = null;
        if (server.mapId) {
            const mapRow = await db.get('SELECT slug FROM maps WHERE id = ?', [server.mapId]);
            workshop = {
                mapId: normalizeWorkshopId(server.mapId),
                mapSlug: mapRow?.slug || null,
                rconPassword: getContainerEnv(resolved.info, 'CS2_RCONPW') || 'changeme',
                serverName: server.name,
            };
        }
        monitorServerBoot(resolved.container, server.id, server.port, workshop);

        res.json({ success: true, message: `Serveur ${server.id} en cours de redémarrage.`, status: 'starting' });
    } catch (err) {
        res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
});


// ── DELETE ─────────────────────────────────────────────────────────────────

app.delete('/api/servers/delete/:id', async (req, res) => {
    const ownerId = req.body?.ownerId;
    try {
        const server = await db.get('SELECT * FROM servers WHERE id = ?', [req.params.id]);
        if (!server) return res.status(404).json({ success: false, message: "Serveur non trouvé." });
        assertOwnerAccess(server, ownerId);

        if (!String(server.containerId || '').startsWith('simulated')) {
            const resolved = await resolveContainer(server);
            if (resolved) await resolved.container.remove({ force: true });
        }

        await db.run('DELETE FROM servers WHERE id = ?', [req.params.id]);
        playerCountCache.delete(server.id);
        res.json({ success: true, message: `Serveur ID ${req.params.id} supprimé.` });

    } catch (err) {
        res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
});

// ── READ : toutes les maps ─────────────────────────────────────────────────

app.get('/api/maps', async (req, res) => {
    try {
        const maps = await db.all('SELECT * FROM maps ORDER BY difficulty ASC, name ASC');
        res.json({ success: true, total: maps.length, data: maps });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── USERS (profils Steam des visiteurs, upsertés au login) ──────────────────

app.post('/api/users', async (req, res) => {
    const { steamId, steamName, avatar, profileUrl } = req.body || {};
    if (!steamId) {
        return res.status(400).json({ success: false, error: 'steamId est obligatoire.' });
    }
    try {
        await db.run(
            `INSERT INTO users (steamId, steamName, avatar, profileUrl, updatedAt)
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(steamId) DO UPDATE SET
                steamName  = excluded.steamName,
                avatar     = excluded.avatar,
                profileUrl = excluded.profileUrl,
                updatedAt  = CURRENT_TIMESTAMP`,
            [steamId, steamName || null, avatar || null, profileUrl || null]
        );
        const user = await db.get('SELECT * FROM users WHERE steamId = ?', [steamId]);
        res.json({ success: true, data: user });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Recuperation en masse : /api/users?ids=steamId1,steamId2,...
app.get('/api/users', async (req, res) => {
    const ids = String(req.query.ids || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!ids.length) {
        return res.status(400).json({ success: false, error: 'ids est obligatoire.' });
    }
    try {
        const placeholders = ids.map(() => '?').join(',');
        const users = await db.all(`SELECT * FROM users WHERE steamId IN (${placeholders})`, ids);
        res.json({ success: true, total: users.length, data: users });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/users/:steamId', async (req, res) => {
    try {
        const user = await db.get('SELECT * FROM users WHERE steamId = ?', [req.params.steamId]);
        if (!user) return res.status(404).json({ success: false, error: 'Utilisateur inconnu.' });
        res.json({ success: true, data: user });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── STATS / LEADERBOARD (plugin SharpTimer — base SQLite, lecture seule) ────

let statsDb = null;
async function getStatsDb() {
    if (statsDb) return statsDb;
    if (!require('fs').existsSync(STATS_DB_PATH)) return null;   // pas encore créée par le plugin
    statsDb = await open({
        filename: STATS_DB_PATH,
        driver:   sqlite3.Database,
        mode:     sqlite3.OPEN_READONLY,
    });
    await statsDb.exec('PRAGMA busy_timeout = 3000');  // les serveurs de jeu écrivent en parallèle
    return statsDb;
}

const ticksToSeconds = (ticks) => Math.round((ticks / 64) * 1000) / 1000;

function statsError(res, err) {
    statsDb = null;   // fichier recréé/wipé -> on rouvrira à la prochaine requête
    res.status(500).json({ success: false, error: err.message });
}

// Classement global (points gagnés en finissant les maps)
app.get('/api/stats/leaderboard', async (req, res) => {
    try {
        const sdb = await getStatsDb();
        if (!sdb) return res.json({ success: true, available: false, total: 0, data: [] });
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
        const rows = await sdb.all(
            `SELECT SteamID, PlayerName, GlobalPoints, TimesConnected, LastConnected
               FROM PlayerStats
              ORDER BY GlobalPoints DESC, TimesConnected DESC, PlayerName ASC
              LIMIT ?`, [limit]);
        res.json({
            success: true, available: true, total: rows.length,
            data: rows.map((r, i) => ({
                rank: i + 1,
                steamId: r.SteamID,
                name: r.PlayerName,
                points: r.GlobalPoints,
                timesConnected: r.TimesConnected,
                lastConnected: r.LastConnected,
            })),
        });
    } catch (err) { statsError(res, err); }
});

// Top temps d'une map (records) — ?limit=50&style=0
app.get('/api/stats/maps/:mapName/records', async (req, res) => {
    try {
        const sdb = await getStatsDb();
        if (!sdb) return res.json({ success: true, available: false, total: 0, data: [] });
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
        const style = parseInt(req.query.style) || 0;
        // meilleur temps par joueur (toutes sessions confondues)
        const rows = await sdb.all(
            `SELECT SteamID, PlayerName, MIN(TimerTicks) AS TimerTicks,
                    FormattedTime, UnixStamp, TimesFinished
               FROM PlayerRecords
              WHERE MapName = ? AND Style = ?
              GROUP BY SteamID
              ORDER BY TimerTicks ASC
              LIMIT ?`, [req.params.mapName, style, limit]);
        res.json({
            success: true, available: true, map: req.params.mapName, style, total: rows.length,
            data: rows.map((r, i) => ({
                rank: i + 1,
                steamId: r.SteamID,
                name: r.PlayerName,
                time: r.FormattedTime,
                seconds: ticksToSeconds(r.TimerTicks),
                timerTicks: r.TimerTicks,
                timesFinished: r.TimesFinished,
                date: r.UnixStamp,
            })),
        });
    } catch (err) { statsError(res, err); }
});

// Records récents (tous serveurs/maps) — ?limit=20
app.get('/api/stats/records/recent', async (req, res) => {
    try {
        const sdb = await getStatsDb();
        if (!sdb) return res.json({ success: true, available: false, total: 0, data: [] });
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        const rows = await sdb.all(
            `SELECT MapName, SteamID, PlayerName, TimerTicks, FormattedTime, UnixStamp
               FROM PlayerRecords
              ORDER BY UnixStamp DESC
              LIMIT ?`, [limit]);
        res.json({
            success: true, available: true, total: rows.length,
            data: rows.map(r => ({
                map: r.MapName,
                steamId: r.SteamID,
                name: r.PlayerName,
                time: r.FormattedTime,
                seconds: ticksToSeconds(r.TimerTicks),
                date: r.UnixStamp,
            })),
        });
    } catch (err) { statsError(res, err); }
});

// Profil d'un joueur : stats globales + ses records par map
app.get('/api/stats/players/:steamid', async (req, res) => {
    try {
        const sdb = await getStatsDb();
        if (!sdb) return res.json({ success: true, available: false, data: null });
        const stats = await sdb.get(
            `SELECT SteamID, PlayerName, GlobalPoints, TimesConnected, LastConnected, IsVip
               FROM PlayerStats WHERE SteamID = ?`, [req.params.steamid]);
        if (!stats) return res.status(404).json({ success: false, error: 'Joueur inconnu.' });
        const records = await sdb.all(
            `SELECT MapName, TimerTicks, FormattedTime, UnixStamp, TimesFinished, Style
               FROM PlayerRecords WHERE SteamID = ?
              ORDER BY MapName ASC, Style ASC`, [req.params.steamid]);
        const better = await sdb.get(
            `SELECT COUNT(*) AS n FROM PlayerStats WHERE GlobalPoints > ?`, [stats.GlobalPoints]);
        res.json({
            success: true, available: true,
            data: {
                steamId: stats.SteamID,
                name: stats.PlayerName,
                points: stats.GlobalPoints,
                rank: (better?.n ?? 0) + 1,
                timesConnected: stats.TimesConnected,
                lastConnected: stats.LastConnected,
                isVip: !!stats.IsVip,
                records: records.map(r => ({
                    map: r.MapName,
                    time: r.FormattedTime,
                    seconds: ticksToSeconds(r.TimerTicks),
                    timesFinished: r.TimesFinished,
                    style: r.Style,
                    date: r.UnixStamp,
                })),
            },
        });
    } catch (err) { statsError(res, err); }
});

// Résumé global (pour la home du site) : compteurs + record par map
app.get('/api/stats/summary', async (req, res) => {
    try {
        const sdb = await getStatsDb();
        if (!sdb) return res.json({ success: true, available: false, data: null });
        const players = await sdb.get(`SELECT COUNT(*) AS n FROM PlayerStats`);
        const records = await sdb.get(`SELECT COUNT(*) AS n FROM PlayerRecords`);
        const maps = await sdb.all(
            `SELECT MapName, COUNT(DISTINCT SteamID) AS players,
                    MIN(TimerTicks) AS best, FormattedTime AS bestTime, PlayerName AS bestBy
               FROM PlayerRecords
              WHERE Style = 0
              GROUP BY MapName
              ORDER BY MapName ASC`);
        res.json({
            success: true, available: true,
            data: {
                totalPlayers: players?.n ?? 0,
                totalRecords: records?.n ?? 0,
                maps: maps.map(m => ({
                    map: m.MapName,
                    players: m.players,
                    bestTime: m.bestTime,
                    bestSeconds: ticksToSeconds(m.best),
                    bestBy: m.bestBy,
                })),
            },
        });
    } catch (err) { statsError(res, err); }
});


// ── MONITORING PÉRIODIQUE ───────────────────────────────────────────────────
async function reconcileAllServers() {
    try {
        const servers = await db.all('SELECT * FROM servers');
        for (const server of servers) {
            try {
                const synced = await syncServerStatus(server);
                if (synced.status !== server.status) {
                    console.log(`[MONITOR] Serveur ${server.id} : ${server.status} -> ${synced.status}`);
                }
            } catch (err) {
                console.warn(`[MONITOR] Serveur ${server.id}:`, err.message);
            }
        }
    } catch (err) {
        console.warn('[MONITOR] reconcile:', err.message);
    }
}

// Supprime un serveur reste vide (0 joueur) plus de INACTIVITY_TIMEOUT_MINUTES.
// Les stats (PlayerRecords) sont indexees par map, pas par serveur : la
// suppression n'affecte donc aucun classement/record existant.
async function pruneInactiveServer(server) {
    try {
        const resolved = await resolveContainer(server);
        if (resolved) await resolved.container.remove({ force: true });
        await db.run('DELETE FROM servers WHERE id = ?', [server.id]);
        playerCountCache.delete(server.id);
        console.log(`[INACTIVITY] Serveur ${server.id} supprime (0 joueur depuis plus de ${INACTIVITY_TIMEOUT_MINUTES} min).`);
    } catch (err) {
        console.warn(`[INACTIVITY] Suppression serveur ${server.id}:`, err.message);
    }
}

async function enforceWorkshopServers() {
    const now = Date.now();
    if (now - lastWorkshopEnforcementAt < WORKSHOP_ENFORCEMENT_INTERVAL_MS) return;
    lastWorkshopEnforcementAt = now;

    const servers = await db.all(`
        SELECT * FROM servers
         WHERE mapId IS NOT NULL
           AND port IS NOT NULL
           AND status IN ('starting', 'running')
    `);

    for (const server of servers) {
        if (activeBootMonitors.has(server.id)) continue;
        try {
            const resolved = await resolveContainer(server);
            if (!resolved?.info.State.Running) continue;

            const mapRow = await db.get('SELECT slug FROM maps WHERE id = ?', [server.mapId]);
            if (!mapRow?.slug) {
                console.warn(`[WORKSHOP] Serveur ${server.id}: slug inconnu pour ${server.mapId}`);
                continue;
            }

            const rconPassword = getContainerEnv(resolved.info, 'CS2_RCONPW');
            if (!rconPassword) {
                console.warn(`[WORKSHOP] Serveur ${server.id}: mot de passe RCON introuvable`);
                continue;
            }

            const status = await sendRconCommand({
                host: RCON_HOST,
                port: server.port,
                password: rconPassword,
                command: 'status',
                timeoutMs: 5_000,
            });
            const playerCount = parsePlayerCount(status);
            if (playerCount !== null) {
                playerCountCache.set(server.id, { count: playerCount, updatedAt: Date.now() });

                if (playerCount > 0) {
                    if (server.emptySince) {
                        await db.run('UPDATE servers SET emptySince = NULL WHERE id = ?', [server.id]);
                    }
                } else {
                    if (!server.emptySince) {
                        server.emptySince = new Date().toISOString();
                        await db.run(
                            'UPDATE servers SET emptySince = ? WHERE id = ?',
                            [server.emptySince, server.id]
                        );
                    }
                    const emptyMinutes = (Date.now() - Date.parse(server.emptySince)) / 60_000;
                    if (emptyMinutes >= INACTIVITY_TIMEOUT_MINUTES) {
                        await pruneInactiveServer(server);
                        continue;
                    }
                }
            }

            const currentMap = parseCurrentMap(status);
            if (!currentMap) {
                console.warn(`[WORKSHOP] Serveur ${server.id}: map courante illisible`);
                continue;
            }

            if (currentMap !== mapRow.slug) {
                console.warn(
                    `[WORKSHOP] Serveur ${server.id}: derive ${currentMap} -> ${mapRow.slug}, recuperation`
                );
                await db.run(
                    "UPDATE servers SET status = 'starting', failureReason = NULL, updatedAt = datetime('now') WHERE id = ?",
                    [server.id]
                );
                await monitorServerBoot(resolved.container, server.id, server.port, {
                    mapId: normalizeWorkshopId(server.mapId),
                    mapSlug: mapRow.slug,
                    rconPassword,
                    serverName: server.name,
                    requestImmediately: true,
                });
                continue;
            }

            await sendRconCommand({
                host: RCON_HOST,
                port: server.port,
                password: rconPassword,
                command: buildSurfSettingsCommand(server.name),
                timeoutMs: 5_000,
            });
            if (server.status !== 'running') {
                await db.run(
                    "UPDATE servers SET status = 'running', failureReason = NULL, updatedAt = datetime('now') WHERE id = ?",
                    [server.id]
                );
            }
        } catch (err) {
            console.warn(`[WORKSHOP] Controle serveur ${server.id}:`, err.message);
        }
    }
}

async function expireServers() {
    const expired = await db.all(
        `SELECT * FROM servers
          WHERE expiresAt IS NOT NULL
            AND datetime(expiresAt) <= datetime('now')
            AND status IN ('starting', 'running', 'stopped', 'missing', 'timeout', 'error', 'error_steam_auth')`
    );
    for (const server of expired) {
        try {
            const resolved = await resolveContainer(server);
            if (resolved?.info.State.Running) {
                await resolved.container.stop({ t: 30 });
            }
            if (resolved) await resolved.container.remove({ force: true });
            await db.run(
                `UPDATE servers
                    SET status = 'expired', stoppedAt = datetime('now'),
                        lastPort = port, port = NULL,
                        failureReason = NULL, updatedAt = datetime('now')
                  WHERE id = ?`,
                [server.id]
            );
            playerCountCache.delete(server.id);
            console.log(`[EXPIRE] Serveur ${server.id} supprime apres expiration.`);
        } catch (err) {
            await db.run(
                "UPDATE servers SET failureReason = ?, updatedAt = datetime('now') WHERE id = ?",
                [`Expiration cleanup: ${err.message}`, server.id]
            );
            console.warn(`[EXPIRE] Serveur ${server.id}:`, err.message);
        }
    }
}

let maintenanceRunning = false;
async function runMaintenance() {
    if (maintenanceRunning) return;
    maintenanceRunning = true;
    try {
        await expireServers();
        await reconcileAllServers();
        await enforceWorkshopServers();
    } finally {
        maintenanceRunning = false;
    }
}

app.get('/api/health', async (req, res) => {
    try {
        await db.get('SELECT 1 AS ok');
        await docker.ping();
        const apiAuthentication = !!SURFLAB_API_KEY;
        res.status(apiAuthentication ? 200 : 503).json({
            success: apiAuthentication,
            service: 'surflab-v3',
            database: true,
            docker: true,
            apiAuthentication,
        });
    } catch (err) {
        res.status(503).json({
            success: false,
            service: 'surflab-v3',
            database: !!db,
            docker: false,
            apiAuthentication: !!SURFLAB_API_KEY,
            error: err.message,
        });
    }
});

app.use((err, req, res, next) => {
    if (err?.type === 'entity.parse.failed') {
        return res.status(400).json({ success: false, error: 'Corps JSON invalide.' });
    }
    console.error('[HTTP]', err);
    res.status(500).json({ success: false, error: 'Erreur interne.' });
});

async function start() {
    db = await setupDb();
    console.log('Base de donnees SQLite prete.');
    await runMaintenance();
    setInterval(runMaintenance, 30000).unref();
    httpServer = app.listen(PORT, BIND_ADDRESS, () =>
        console.log(`Backend sur ${BIND_ADDRESS}:${PORT}`)
    );
}

start().catch((err) => {
    console.error('[STARTUP] Echec du backend:', err);
    process.exitCode = 1;
});

async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[SHUTDOWN] ${signal}`);
    const forceExit = setTimeout(() => process.exit(1), 15000);
    forceExit.unref();
    if (httpServer) {
        await new Promise(resolve => httpServer.close(resolve));
    }
    if (statsDb) await statsDb.close().catch(() => {});
    if (db) await db.close().catch(() => {});
    clearTimeout(forceExit);
}

process.on('SIGTERM', () => shutdown('SIGTERM').catch(err => {
    console.error('[SHUTDOWN]', err);
    process.exitCode = 1;
}));
process.on('SIGINT', () => shutdown('SIGINT').catch(err => {
    console.error('[SHUTDOWN]', err);
    process.exitCode = 1;
}));
