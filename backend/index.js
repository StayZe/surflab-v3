const express = require('express');
const Docker = require('dockerode');
const { setupDb } = require('./database'); // On importe notre DB
const fs = require('fs');
const { Rcon } = require('rcon-client');
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
        const rconPort = nextPort + 10000;

        // Nettoyage préventif
        try {
            await docker.getContainer(`cs2-surf-${nextPort}`).remove({ force: true });
        } catch (e) { }

        // --- Le mot de passe RCON pour notre API ---
        const rconPassword = "superpassword123";

        // --- DÉBUT : La ruse du fichier AutoExec ---
        if (mapId) {
            // On configure juste le surf et le nom ici (le RCON changera la map)
            const cfgContent = `
hostname "${serverName}"
sv_airaccelerate 150
sv_cheats 0
`;
            try {
                fs.writeFileSync(`/app/cs2_data/game/csgo/cfg/auto_${nextPort}.cfg`, cfgContent);
            } catch (fsError) {
                console.error("Impossible d'écrire le auto.cfg, vérifie les volumes Docker :", fsError.message);
            }
        }

        // --- DÉBUT : Construction dynamique ---
        const envVars = [
            `SRCDS_TOKEN=${process.env.STEAM_GSLT_TOKEN}`,
            `CS2_SERVERNAME=${serverName}`,
            `CS2_MAXPLAYERS=${maxPlayers}`,
            `CS2_PORT=${nextPort}`,
            `CS2_IP=0.0.0.0`,
            `CS2_SERVER_HIBERNATE=0`,
            `CS2_STARTMAP=de_inferno`, // On force Inferno au démarrage pour la stabilité
            `CS2_RCONPW=${rconPassword}`, // On injecte le mot de passe RCON
            `CS2_RCON_PORT=${rconPort}`
        ];

        // Exécution de notre fichier auto.cfg au lancement + WebAPI Key
        let additionalArgs = `+exec auto_${nextPort}.cfg -authkey ${process.env.STEAM_WEBAPI_KEY}`;
        envVars.push(`CS2_ADDITIONAL_ARGS=${additionalArgs}`);

        // Création du conteneur
        const container = await docker.createContainer({
            Image: 'joedwards32/cs2',
            name: `cs2-surf-${nextPort}`,
            ExposedPorts: {
                [`${nextPort}/udp`]: {},
                [`${nextPort}/tcp`]: {}, // Le RCON a besoin du TCP
                [`${rconPort}/tcp`]: {}
            },
            HostConfig: {
                NetworkMode: 'surflab-v3_default',
                PortBindings: {
                    [`${nextPort}/udp`]: [{ HostPort: nextPort.toString() }],
                    [`${nextPort}/tcp`]: [{ HostPort: nextPort.toString() }],
                    [`${rconPort}/tcp`]: [{ HostPort: rconPort.toString() }]
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

        // On répond IMMÉDIATEMENT à Postman pour ne pas bloquer la requête
        res.json({
            success: true,
            port: nextPort,
            containerId: container.id,
            message: "Serveur démarré sur Inferno. L'API RCON injectera Utopia dans 15 secondes..."
        });

        // --- DÉBUT : LA MAGIE RCON ---
        if (mapId) {
            console.log(`[RCON] Serveur ${nextPort} lancé. Attente de 15s pour le boot du moteur...`);
            
            // L'API attend 15 secondes en tâche de fond
            setTimeout(async () => {
                try {
                    console.log(`[RCON] Tentative de connexion au port ${nextPort}...`);
                    const rcon = await Rcon.connect({
                        host: `cs2-surf-${nextPort}`,
                        port: rconPort,
                        password: rconPassword,
                        timeout: 5000 // Timeout de 5 sec pour éviter de bloquer Node.js
                    });
                    
                    console.log(`[RCON] Connecté ! Ordre de téléchargement de la map ${mapId}...`);
                    // On envoie la commande fatale
                    const response = await rcon.send(`host_workshop_map ${mapId}`);
                    console.log(`[RCON] Réponse du serveur :`, response);
                    
                    await rcon.end();
                } catch (rconErr) {
                    console.error(`[RCON] Échec du changement de map sur le port ${nextPort} :`, rconErr.message);
                }
            }, 30000); // 30 000 ms = 30 secondes
        }
        // --- FIN : LA MAGIE RCON ---

    } catch (error) {
        console.error(error);
        if (!res.headersSent) {
            res.status(500).json({ success: false, error: error.message });
        }
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
            // Nettoyage du fichier auto.cfg
            try {
                fs.unlinkSync(`/app/cs2_data/game/csgo/cfg/auto_${port}.cfg`);
            } catch(e) {}

            await db.run('DELETE FROM servers WHERE port = ?', [port]);
            return res.json({ success: true, message: `Serveur port ${port} nettoyé.` });
        }
        res.status(404).json({ success: false, message: "Serveur non trouvé dans la DB." });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(3000, () => console.log("Backend sur port 3000 avec support RCON"));