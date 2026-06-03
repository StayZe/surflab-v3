const express      = require('express');
const Docker       = require('dockerode');
const { PassThrough } = require('stream');
const { setupDb }  = require('./database');

const app    = express();
const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const SERVER_IP = "10.255.0.26";
const PAGE_LIMIT = 20;

let db;
app.use(express.json());

setupDb().then(async (database) => {
    db = database;
    console.log("Base de données SQLite prête.");
    await pullImageIfNeeded('cm2network/steamcmd').catch(err =>
        console.warn('[STARTUP] Impossible de pull cm2network/steamcmd:', err.message)
    );
});

// ── Helpers ────────────────────────────────────────────────────────────────

function formatServer(server) {
    return {
        id:         server.id,
        name:       server.name,
        status:     server.status,
        ownerId:    server.ownerId ?? null,
        connection: {
            port:    server.port,
            joinUrl: `steam://connect/${SERVER_IP}:${server.port}`,
        },
        gameplay: {
            mapId:      server.mapId || 'de_inferno',
            isWorkshop: !!server.mapId,
            maxPlayers: server.maxPlayers || 10,
        },
        system: {
            containerId: server.containerId,
            createdAt:   server.createdAt,
            updatedAt:   server.updatedAt,
        },
    };
}

function paginate(rows, page, limit) {
    const total = rows.length;
    const pages = Math.ceil(total / limit) || 1;
    const offset = (page - 1) * limit;
    return { data: rows.slice(offset, offset + limit), total, page, pages, limit };
}

async function monitorServerBoot(container, serverId, port) {
    try {
        const logStream = await container.logs({ follow: true, stdout: true, stderr: true });

        const stdout = new PassThrough();
        const stderr = new PassThrough();
        docker.modem.demuxStream(logStream, stdout, stderr);

        const onData = async (chunk) => {
            const log = chunk.toString('utf8');

            if (log.includes('GameServerSteamAPIActivated()')) {
                console.log(`[OK] Serveur ${serverId} (port ${port}) en ligne`);
                await db.run(
                    "UPDATE servers SET status = ?, updatedAt = datetime('now') WHERE id = ?",
                    ['running', serverId]
                );
                logStream.destroy();
            }

            if (log.includes('reason code 5005')) {
                console.log(`[ERR] Serveur ${serverId} rejeté Steam`);
                await db.run(
                    "UPDATE servers SET status = ?, updatedAt = datetime('now') WHERE id = ?",
                    ['error_steam_auth', serverId]
                );
                logStream.destroy();
            }
        };

        stdout.on('data', onData);
        stderr.on('data', onData);

        setTimeout(async () => {
            if (!logStream.destroyed) {
                console.log(`[TIMEOUT] Serveur ${serverId}`);
                await db.run(
                    "UPDATE servers SET status = ?, updatedAt = datetime('now') WHERE id = ?",
                    ['timeout', serverId]
                );
                logStream.destroy();
            }
        }, 300000);

    } catch (err) {
        console.error(`Monitoring error serveur ${serverId}:`, err);
    }
}

async function pullImageIfNeeded(image) {
    try {
        await docker.getImage(image).inspect();
    } catch {
        console.log(`[PRELOAD] Pull image ${image}...`);
        await new Promise((resolve, reject) => {
            docker.pull(image, (err, stream) => {
                if (err) return reject(err);
                docker.modem.followProgress(stream, (err) => err ? reject(err) : resolve());
            });
        });
        console.log(`[PRELOAD] Image ${image} prête.`);
    }
}

async function preloadWorkshopMap(mapId) {
    console.log(`[PRELOAD] Début téléchargement map ${mapId}...`);
    try {
        await pullImageIfNeeded('cm2network/steamcmd');
        const [output] = await docker.run(
            'cm2network/steamcmd',
            [
                '+force_install_dir', '/home/steam/cs2_data',
                '+login', 'anonymous',
                '+workshop_download_item', '730', String(mapId),
                'validate',
                '+quit',
            ],
            process.stdout,
            {
                Entrypoint: ['/home/steam/steamcmd/steamcmd.sh'],
                HostConfig: {
                    Binds: ['/home/steam/cs2_data:/home/steam/cs2_data'],
                    AutoRemove: true,
                },
            }
        );
        console.log(`[PRELOAD] Map ${mapId} téléchargée (exit code: ${output.StatusCode})`);
        return output.StatusCode === 0;
    } catch (err) {
        console.warn(`[PRELOAD] Échec téléchargement map ${mapId}:`, err.message);
        return false;
    }
}

// ── CREATE ─────────────────────────────────────────────────────────────────

app.post('/api/servers/create', async (req, res) => {
    const { mapId, maxPlayers, serverName, ownerId } = req.body;

    try {
        const last     = await db.get('SELECT port FROM servers ORDER BY port DESC LIMIT 1');
        const nextPort = last ? last.port + 1 : 27015;

        try { await docker.getContainer(`cs2-surf-${nextPort}`).remove({ force: true }); } catch (_) {}

        const envVars = [
            `SRCDS_TOKEN=448FD82D909B98549B1632E675948E5B`,
            `CS2_SERVERNAME=${serverName}`,
            `CS2_MAXPLAYERS=${maxPlayers}`,
            `CS2_PORT=${nextPort}`,
            `CS2_IP=0.0.0.0`,
            `CS2_SERVER_HIBERNATE=0`,
            ...(!mapId ? [`CS2_STARTMAP=de_inferno`] : []),
        ];

        // ── Résolution de la map ───────────────────────────────────────────
        let mapLabel = 'de_inferno (défaut)';
        let args = `+hostname "${serverName}" +sv_airaccelerate 150 +sv_cheats 0 -authkey 8D296C16EA9BC9D7629C2D63717B3F6F`;

        if (mapId) {
            const mapRow = await db.get('SELECT * FROM maps WHERE id = ?', [mapId]);
            if (mapRow) {
                mapLabel = `${mapRow.name} (${mapRow.slug}) — Workshop ID ${mapId} ✅`;
                console.log(`[MAP] Map workshop trouvée en DB : ${mapLabel}`);
            } else {
                mapLabel = `Workshop ID ${mapId} ⚠️  (non référencée en DB)`;
                console.warn(`[MAP] Map workshop NON trouvée en DB pour l'ID ${mapId} — chargement quand même`);
            }
            args += ` +host_workshop_map ${mapId}`;

            await preloadWorkshopMap(mapId);
        } else {
            console.log(`[MAP] Aucun mapId fourni — map standard : de_inferno`);
            args += ` +map de_inferno`;
        }

        envVars.push(`CS2_ADDITIONAL_ARGS=${args}`);

        console.log(`[CREATE] Serveur "${serverName}" | Port ${nextPort} | Map : ${mapLabel}`);
        console.log(`[CREATE] Args CS2 : ${args}`);

        const container = await docker.createContainer({
            Image: 'joedwards32/cs2',
            name:  `cs2-surf-${nextPort}`,
            HostConfig: {
                NetworkMode: 'host',
                Binds: ['/home/steam/cs2_data:/home/steam/cs2-dedicated/'],
            },
            Env: envVars,
        });

        await container.start();

        const result = await db.run(
            'INSERT INTO servers (name, maxPlayers, mapId, port, containerId, status, ownerId) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [serverName, maxPlayers, mapId, nextPort, container.id, 'starting', ownerId ?? null]
        );

        monitorServerBoot(container, result.lastID, nextPort);

        res.json({
            success:     true,
            id:          result.lastID,
            port:        nextPort,
            containerId: container.id,
            status:      'starting',
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── READ : tous les serveurs ───────────────────────────────────────────────

app.get('/api/servers', async (req, res) => {
    try {
        const page  = Math.max(1, parseInt(req.query.page)  || 1);
        const limit = Math.max(1, parseInt(req.query.limit) || PAGE_LIMIT);

        const rows   = await db.all('SELECT * FROM servers ORDER BY createdAt DESC');
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
        const limit = Math.max(1, parseInt(req.query.limit) || PAGE_LIMIT);

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

app.get('/api/servers/sync', async (req, res) => {
    try {
        const servers = await db.all('SELECT * FROM servers');

        const synced = await Promise.all(servers.map(async (server) => {
            let status = server.status;
            try {
                const info = await docker.getContainer(server.containerId).inspect();
                if (info.State.Running) {
                    status = 'running';
                } else if (info.State.Status === 'exited') {
                    status = 'stopped';
                }
                if (status !== server.status) {
                    await db.run(
                        "UPDATE servers SET status = ?, updatedAt = datetime('now') WHERE id = ?",
                        [status, server.id]
                    );
                }
            } catch {}
            return { id: String(server.id), status };
        }));

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

        let status = server.status;
        try {
            const info = await docker.getContainer(server.containerId).inspect();
            if (info.State.Running) {
                status = 'running';
            } else if (info.State.Status === 'exited') {
                status = 'stopped';
            }
            if (status !== server.status) {
                await db.run(
                    "UPDATE servers SET status = ?, updatedAt = datetime('now') WHERE id = ?",
                    [status, server.id]
                );
            }
        } catch {}

        res.json({ success: true, data: { id: String(server.id), status } });
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

        let stopped = false;
        try {
            await docker.getContainer(server.containerId).stop();
            stopped = true;
        } catch (err) {
            console.warn(`Stop by ID failed (${server.containerId}):`, err.statusCode, err.message);
        }

        if (!stopped) {
            try {
                await docker.getContainer(`cs2-surf-${server.port}`).stop();
                stopped = true;
            } catch (err) {
                console.warn(`Stop by name failed (cs2-surf-${server.port}):`, err.statusCode, err.message);
            }
        }

        if (!stopped) {
            return res.status(500).json({ success: false, error: 'Impossible d\'arrêter le container' });
        }

        await db.run(
            "UPDATE servers SET status = ?, updatedAt = datetime('now') WHERE id = ?",
            ['stopped', server.id]
        );

        res.json({ success: true, message: `Serveur ${server.id} arrêté.` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});



// ── RESTART ────────────────────────────────────────────────────────────────
app.post('/api/servers/:id/restart', async (req, res) => {
    try {
        const server = await db.get('SELECT * FROM servers WHERE id = ?', [req.params.id]);
        if (!server) return res.status(404).json({ success: false, message: "Serveur introuvable." });

        const container = docker.getContainer(server.containerId);
        await container.restart();

        await db.run(
            "UPDATE servers SET status = ?, updatedAt = datetime('now') WHERE id = ?",
            ['starting', server.id]
        );

        monitorServerBoot(container, server.id, server.port);

        res.json({ success: true, message: `Serveur ${server.id} en cours de redémarrage.`, status: 'starting' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});


// ── DELETE ─────────────────────────────────────────────────────────────────

app.delete('/api/servers/delete/:id', async (req, res) => {
    const ownerId = req.body?.ownerId;
    try {
        const server = await db.get('SELECT * FROM servers WHERE id = ?', [req.params.id]);
        if (!server) return res.status(404).json({ success: false, message: "Serveur non trouvé." });
        if (server.ownerId && String(server.ownerId) !== String(ownerId)) {
            return res.status(403).json({ success: false, message: "Non autorisé." });
        }

        if (!server.containerId.startsWith('simulated')) {
            try { await docker.getContainer(server.containerId).remove({ force: true }); } catch (_) {}
        }

        await db.run('DELETE FROM servers WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: `Serveur ID ${req.params.id} supprimé.` });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
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

app.listen(3000, () => console.log("Backend sur port 3000"));
