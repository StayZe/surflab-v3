const express = require('express');
const Docker = require('dockerode');
const { setupDb } = require('./database');
// require('dotenv').config(); // <-- On désactive volontairement dotenv pour ce test !

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

        // Nettoyage préventif du conteneur s'il existe déjà
        try {
            await docker.getContainer(`cs2-surf-${nextPort}`).remove({ force: true });
        } catch (e) { }

        // Construction des variables d'environnement de base avec TOKEN EN DUR
        const envVars = [
            `SRCDS_TOKEN=EE580DD18CF3133A44513E67A854C3B3`, // <-- TOKEN EN DUR ICI
            `CS2_SERVERNAME=${serverName}`,
            `CS2_MAXPLAYERS=${maxPlayers}`,
            `CS2_PORT=${nextPort}`,
            `CS2_IP=0.0.0.0`,
            `CS2_SERVER_HIBERNATE=0` // <-- Virgule retirée, fin du bloc de base
        ];

        // 🌟 LA MAGIE WORKSHOP 
        if (mapId) {
            envVars.push(`CS2_HOST_WORKSHOP_MAP=${mapId}`);
        } else {
            envVars.push(`CS2_STARTMAP=de_inferno`);
        }

        // Ajout du WEBAPI KEY EN DUR (-authkey) pour autoriser le téléchargement Workshop
        let additionalArgs = `+hostname "${serverName}" +sv_airaccelerate 150 +sv_cheats 0 -authkey 8D296C16EA9BC9D7629C2D63717B3F6F`;
        envVars.push(`CS2_ADDITIONAL_ARGS=${additionalArgs}`);

        // Création du conteneur
        const container = await docker.createContainer({
            Image: 'joedwards32/cs2', // Image en dur
            name: `cs2-surf-${nextPort}`,
            // ExposedPorts: {
            //     [`${nextPort}/udp`]: {},
            //     [`${nextPort}/tcp`]: {}
            // },
            HostConfig: {
                // Dns: ["8.8.8.8", "8.8.4.4"], 
                // PortBindings: {
                //     [`${nextPort}/udp`]: [{ HostPort: nextPort.toString() }],
                //     [`${nextPort}/tcp`]: [{ HostPort: nextPort.toString() }]
                // },
                NetworkMode: 'host',
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
            mapId: mapId || 'de_inferno',
            message: mapId 
                ? `Serveur démarré ! Le conteneur télécharge actuellement la map Workshop ${mapId}...` 
                : "Serveur démarré sur Inferno par défaut."
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

app.listen(3000, () => console.log("Backend sur port 3000 (Mode Native Workshop TOUT EN DUR)"));