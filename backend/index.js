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

// 🛠️ NOUVELLE FONCTION : Surveille les logs pour un statut dynamique
async function monitorServerBoot(container, serverId, port) {
    try {
        const stream = await container.logs({ follow: true, stdout: true, stderr: true });
        
        stream.on('data', async (chunk) => {
            const logLine = chunk.toString('utf8');
            
            if (logLine.includes('GameServerSteamAPIActivated()')) {
                console.log(`[SUCCÈS] Serveur ${serverId} sur le port ${port} est en ligne !`);
                // On met à jour le statut ET la date de dernière modification
                await db.run("UPDATE servers SET status = ?, updatedAt = datetime('now') WHERE id = ?", ['running', serverId]);
                stream.destroy(); 
            }
            
            if (logLine.includes('reason code 5005')) {
                console.log(`[ERREUR] Serveur ${serverId} (Port ${port}) rejeté par Steam.`);
                await db.run("UPDATE servers SET status = ?, updatedAt = datetime('now') WHERE id = ?", ['error_steam_auth', serverId]);
                stream.destroy();
            }
        });

        setTimeout(async () => {
            if (!stream.destroyed) {
                console.log(`[TIMEOUT] Le serveur ${serverId} prend trop de temps à démarrer.`);
                await db.run("UPDATE servers SET status = ?, updatedAt = datetime('now') WHERE id = ?", ['timeout', serverId]);
                stream.destroy();
            }
        }, 300000);

    } catch (error) {
        console.error(`Erreur de monitoring pour le serveur ${serverId}:`, error);
    }
}

app.post('/api/servers/create', async (req, res) => {
    const { mapId, maxPlayers, serverName } = req.body;

    try {
        const lastServer = await db.get('SELECT port FROM servers ORDER BY port DESC LIMIT 1');
        const nextPort = lastServer ? lastServer.port + 1 : 27015;

        try {
            await docker.getContainer(`cs2-surf-${nextPort}`).remove({ force: true });
        } catch (e) { }

        const envVars = [
            `SRCDS_TOKEN=448FD82D909B98549B1632E675948E5B`, 
            `CS2_SERVERNAME=${serverName}`,
            `CS2_MAXPLAYERS=${maxPlayers}`,
            `CS2_PORT=${nextPort}`,
            `CS2_IP=0.0.0.0`,
            `CS2_SERVER_HIBERNATE=0`,
            `CS2_STARTMAP=de_inferno` 
        ];

        let additionalArgs = `+hostname "${serverName}" +sv_airaccelerate 150 +sv_cheats 0 -authkey 8D296C16EA9BC9D7629C2D63717B3F6F`;
        if (mapId) {
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

        // 🚨 MODIFICATION ICI : On l'insère en statut 'starting' (démarrage en cours)
        const result = await db.run(
            'INSERT INTO servers (name, maxPlayers, mapId, port, containerId, status) VALUES (?, ?, ?, ?, ?, ?)',
            [serverName, maxPlayers, mapId, nextPort, container.id, 'starting']
        );
        
        // On récupère l'ID généré par SQLite pour ce nouveau serveur
        const newServerId = result.lastID;

        // On lance la fonction qui lit les logs en arrière-plan sans bloquer la réponse API
        monitorServerBoot(container, newServerId, nextPort);

        // On répond immédiatement au front-end
        res.json({
            success: true,
            id: newServerId,
            port: nextPort,
            containerId: container.id,
            status: 'starting', // Le front-end sait qu'il doit afficher un spinner/chargement
            message: "Serveur en cours de démarrage et de téléchargement..."
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ... GET et DELETE restent identiques ...
// Lister les serveurs (API très complète pour le Front-end)
app.get('/api/servers', async (req, res) => {
    try {
        // On récupère tout, trié par le plus récent d'abord
        const servers = await db.all('SELECT * FROM servers ORDER BY createdAt DESC');

        // L'IP publique de ta machine (à remplacer par ton vrai domaine ou IP si besoin)
        const SERVER_IP = "10.255.0.26"; // ex: "192.168.1.50" ou "surf.monsite.com"

        // On formate chaque serveur pour rendre la vie du front-end ultra facile
        const formattedServers = servers.map(server => ({
            id: server.id,
            name: server.name,
            status: server.status, // 'starting', 'running', 'error_steam_auth', 'timeout'
            
            // Catégorie : Informations de connexion
            connection: {
                port: server.port,
                // Lien magique : si le front met ça dans un <a href>, ça lance CS2 direct !
                joinUrl: `steam://connect/${SERVER_IP}:${server.port}` 
            },
            
            // Catégorie : Détails du jeu
            gameplay: {
                mapId: server.mapId || 'de_inferno',
                isWorkshop: !!server.mapId, // Renvoie true si c'est une map workshop
                maxPlayers: server.maxPlayers || 10
            },
            
            // Catégorie : Système / Technique
            system: {
                containerId: server.containerId,
                createdAt: server.createdAt,
                updatedAt: server.updatedAt
            }
        }));

        // On renvoie un objet global propre
        res.json({
            success: true,
            totalServers: formattedServers.length,
            activeServers: formattedServers.filter(s => s.status === 'running').length,
            data: formattedServers
        });

    } catch (error) {
        console.error("Erreur GET /api/servers :", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/servers/delete/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const server = await db.get('SELECT containerId, port FROM servers WHERE id = ?', [id]);
        if (server) {
            if (!server.containerId.startsWith('simulated')) {
                try {
                    const container = docker.getContainer(server.containerId);
                    await container.remove({ force: true });
                } catch (dockerError) { }
            }
            await db.run('DELETE FROM servers WHERE id = ?', [id]);
            return res.json({ success: true, message: `Serveur ID ${id} nettoyé.` });
        }
        res.status(404).json({ success: false, message: "Serveur non trouvé." });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(3000, () => console.log("Backend sur port 3000 (Monitoring Dynamique des Logs)"));