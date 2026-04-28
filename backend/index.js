const express = require('express');
const Docker = require('dockerode');
const { setupDb } = require('./database'); // On importe notre DB
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
    const { mapId, maxPlayers, serverName } = req.body;

    try {
        const lastServer = await db.get('SELECT port FROM servers ORDER BY port DESC LIMIT 1');
        const nextPort = lastServer ? lastServer.port + 1 : 27015;

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
                    '/home/surflab/cs2_data:/home/surflab/cs2-dedicated/'
                ] 
            },
            Env: [
                `SRCDS_TOKEN=${process.env.STEAM_GSLT_TOKEN}`,
                `CS2_SERVERNAME=${serverName}`,
                `CS2_MAXPLAYERS=${maxPlayers}`,
                `CS2_PORT=${nextPort}`,
                `CS2_IP=0.0.0.0`,
                // La doc dit que pour le Workshop, on utilise cette variable précise :
                `CS2_HOST_WORKSHOP_MAP=${mapId}`,
                // Pour le surf, on ajoute les commandes dans ADDITIONAL_ARGS
                `CS2_ADDITIONAL_ARGS=+sv_airaccelerate 150 +sv_cheats 0`,
                // Optionnel : Désactiver l'hibernation pour éviter les crashs cités dans la doc
                `CS2_SERVER_HIBERNATE=0`
            ]
        });

        await container.start();

        await db.run(
            'INSERT INTO servers (name, port, containerId, status) VALUES (?, ?, ?, ?)',
            [serverName, nextPort, container.id, 'running']
        );
        res.json({
            success: true,
            port: nextPort,
            containerId: container.id
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
                } catch (dockerError) {
                    console.log(`Note: Le conteneur ${server.containerId} n'existait déjà plus dans Docker.`);
                }
            }
            await db.run('DELETE FROM servers WHERE port = ?', [port]);
            return res.json({ success: true, message: `Serveur port ${port} nettoyé.` });
        }
        res.status(404).json({ success: false, message: "Serveur non trouvé dans la DB." });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(3000, () => console.log("Backend sur port 3000"));