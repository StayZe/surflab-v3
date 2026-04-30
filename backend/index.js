const express = require('express');
const Docker = require('dockerode');
const { setupDb } = require('./database');
require('dotenv').config();

const app = express();
const docker = new Docker({ socketPath: '/var/run/docker.sock' });
let db;

app.use(express.json());

setupDb().then(database => {
    db = database;
    console.log("Base de données SQLite prête.");
});

// Créer un serveur
app.post('/api/servers/create', async (req, res) => {
    // ⚠️ On demande maintenant "mapName" (ex: "surf_utopia")
    const { mapName, maxPlayers, serverName } = req.body;

    try {
        const lastServer = await db.get('SELECT port FROM servers ORDER BY port DESC LIMIT 1');
        const nextPort = lastServer ? lastServer.port + 1 : 27015;

        // Nettoyage préventif
        try {
            await docker.getContainer(`cs2-surf-${nextPort}`).remove({ force: true });
        } catch (e) { }

        // La map par défaut sera de_inferno si tu n'envoies pas de mapName
        const startMap = mapName || 'de_inferno';

        const envVars = [
            `SRCDS_TOKEN=${process.env.STEAM_GSLT_TOKEN}`,
            `CS2_SERVERNAME=${serverName}`,
            `CS2_MAXPLAYERS=${maxPlayers}`,
            `CS2_PORT=${nextPort}`,
            `CS2_IP=0.0.0.0`,
            `CS2_SERVER_HIBERNATE=0`,
            `CS2_STARTMAP=${startMap}` // La map locale est chargée directement au boot !
        ];

        // On garde juste la config de surf de base
        let additionalArgs = `+hostname "${serverName}" +sv_airaccelerate 150 +sv_cheats 0`;
        envVars.push(`CS2_ADDITIONAL_ARGS=${additionalArgs}`);

        // Création du conteneur allégée (plus besoin des ports RCON)
        const container = await docker.createContainer({
            Image: 'joedwards32/cs2',
            name: `cs2-surf-${nextPort}`,
            ExposedPorts: {
                [`${nextPort}/udp`]: {},
                [`${nextPort}/tcp`]: {}
            },
            HostConfig: {
                PortBindings: {
                    [`${nextPort}/udp`]: [{ HostPort: nextPort.toString() }],
                    [`${nextPort}/tcp`]: [{ HostPort: nextPort.toString() }]
                },
                Binds: [
                    '/home/steam/cs2_data:/home/steam/cs2-dedicated/'
                ]
            },
            Env: envVars
        });

        await container.start();

        await db.run(
            'INSERT INTO servers (name, port, containerId, status) VALUES (?, ?, ?, ?)',
            [serverName, nextPort, container.id, 'running']
        );

        res.json({
            success: true,
            port: nextPort,
            containerId: container.id,
            map: startMap,
            message: `Serveur démarré instantanément sur la map ${startMap}`
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Lister les serveurs
app.get('/api/servers', async (req, res) => {
    try {
        const servers = await db.all('SELECT * FROM servers');
        res.json(servers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Supprimer un serveur
app.delete('/api/servers/delete/:port', async (req, res) => {
    const { port } = req.params;
    try {
        const server = await db.get('SELECT containerId FROM servers WHERE port = ?', [port]);

        if (server) {
            if (!server.containerId.startsWith('simulated')) {
                try {
                    const container = docker.getContainer(server.containerId);
                    await container.remove({ force: true });
                } catch (dockerError) { }
            }
            await db.run('DELETE FROM servers WHERE port = ?', [port]);
            return res.json({ success: true, message: `Serveur port ${port} nettoyé.` });
        }
        res.status(404).json({ success: false, message: "Serveur non trouvé dans la DB." });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(3000, () => console.log("Backend sur port 3000 (Mode Local Maps)"));