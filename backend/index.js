const express = require('express');
const Docker = require('dockerode');
const { setupDb } = require('./database');

const app = express();
const docker = new Docker({ socketPath: '/var/run/docker.sock' });
let db;

app.use(express.json());

setupDb().then(database => {
    db = database;
    console.log("Base de données SQLite prête.");
});

app.post('/api/servers/create', async (req, res) => {
    const { mapId, maxPlayers, serverName } = req.body;

    try {
        const lastServer = await db.get('SELECT port FROM servers ORDER BY port DESC LIMIT 1');
        const nextPort = lastServer ? lastServer.port + 1 : 27015;

        try {
            await docker.getContainer(`cs2-surf-${nextPort}`).remove({ force: true });
        } catch (e) { }

        // Configuration pour joedwards32/cs2
        const envVars = [
            `SRCDS_TOKEN=448FD82D909B98549B1632E675948E5B`, 
            `CS2_SERVERNAME=${serverName}`,
            `CS2_MAXPLAYERS=${maxPlayers}`,
            `CS2_PORT=${nextPort}`,
            `CS2_IP=0.0.0.0`,
            `CS2_SERVER_HIBERNATE=0`,
            // 🚨 FORCER INFERNO : C'est obligatoire pour éviter le crash <empty>
            `CS2_STARTMAP=de_inferno` 
        ];

        // On gère le Workshop via les arguments additionnels pour que le serveur
        // démarre d'abord proprement, s'authentifie, puis change de map.
        let additionalArgs = `+hostname "${serverName}" +sv_airaccelerate 150 +sv_cheats 0 -authkey 8D296C16EA9BC9D7629C2D63717B3F6F`;
        
        if (mapId) {
            // On demande au serveur d'héberger la map workshop APRES son initialisation
            additionalArgs += ` +host_workshop_map ${mapId}`;
        }
        
        envVars.push(`CS2_ADDITIONAL_ARGS=${additionalArgs}`);

        const container = await docker.createContainer({
            Image: 'joedwards32/cs2',
            name: `cs2-surf-${nextPort}`,
            HostConfig: {
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
            mapId: mapId,
            message: "Serveur démarré (Boot sur Inferno, puis bascule Workshop)."
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ... GET et DELETE ...

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

app.listen(3000, () => console.log("Backend sur port 3000 (Mode joedwards32 + HOST + Nouveau Token)"));