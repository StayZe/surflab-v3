const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const DEFAULT_MAPS = [
    { id: '3133346713', name: 'Boreas',  slug: 'surf_boreas', difficulty: 'T1'  },
    { id: '3076153623', name: 'Kitsune',   slug: 'surf_kitsune', difficulty: 'T2'   },
    { id: '3073875025', name: 'Utopia NJV',  slug: 'surf_utopia_njv', difficulty: 'T1'  },
    { id: '3082548297', name: 'Rookie',  slug: 'surf_rookie', difficulty: 'T1'  },
    { id: '3767399691', name: 'Sulfur',  slug: 'surf_sulfur', difficulty: 'T2'  },
    { id: '3165517928', name: 'Astra',  slug: 'surf_astra', difficulty: 'T2'  },
    { id: '3129698096', name: 'Nyx',  slug: 'surf_nyx', difficulty: 'T1'  },
    { id: '3231028283', name: '1win',  slug: 'surf_1win', difficulty: 'T1'  },
    { id: '3088413071', name: 'Ace',  slug: 'surf_ace', difficulty: 'T2'  },
    { id: '3624041364', name: 'Invert',  slug: 'surf_invert', difficulty: 'T2'  },
    { id: '3746469340', name: 'Quest',  slug: 'surf_quest', difficulty: 'T3'  },
    { id: '3624850101', name: 'Interceptor',  slug: 'surf_interceptor', difficulty: 'T3'  },
    { id: '3655929954', name: 'HappyHands2',  slug: 'surf_happyhands2', difficulty: 'T3'  },
    { id: '3133346713', name: 'SurfBoreas',  slug: 'surf_boreas', difficulty: 'T2'  },

];

async function setupDb(filename = './database.sqlite') {
    const db = await open({
        filename,
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS servers (
            id          INTEGER  PRIMARY KEY AUTOINCREMENT,
            name        TEXT,
            maxPlayers  INTEGER,
            mapId       TEXT,
            port        INTEGER  UNIQUE,
            lastPort    INTEGER,
            containerId TEXT,
            status      TEXT,
            ownerId     TEXT,
            createdAt   DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt   DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS maps (
            id    INTEGER PRIMARY KEY NOT NULL,
            name  TEXT NOT NULL,
            slug  TEXT NOT NULL UNIQUE,
            difficulty TEXT NOT NULL,
            imageUrl TEXT
        )
    `);

    const mapCols = await db.all("PRAGMA table_info(maps)");
    if (!mapCols.find(c => c.name === 'imageUrl')) {
        await db.exec('ALTER TABLE maps ADD COLUMN imageUrl TEXT');
    }

    // Profils Steam des visiteurs du site (distinct des stats SharpTimer,
    // qui vivent dans leur propre base gérée par le plugin de jeu).
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            steamId    TEXT PRIMARY KEY,
            steamName  TEXT,
            avatar     TEXT,
            profileUrl TEXT,
            createdAt  DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt  DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Migration douce : ownerId
    const cols = await db.all("PRAGMA table_info(servers)");
    if (!cols.find(c => c.name === 'ownerId')) {
        await db.exec("ALTER TABLE servers ADD COLUMN ownerId TEXT");
    }

    // Migrations additives uniquement : la base existante et son historique
    // restent en place lors d'une mise a jour du backend.
    const migrations = [
        ['durationMinutes', 'INTEGER'],
        ['expiresAt', 'DATETIME'],
        ['stoppedAt', 'DATETIME'],
        ['failureReason', 'TEXT'],
        ['lastPort', 'INTEGER'],
        ['emptySince', 'DATETIME'],
        ['autoDelete', 'INTEGER'],
    ];
    for (const [name, type] of migrations) {
        if (!cols.find(c => c
            .name === name)) {
            await db.exec(`ALTER TABLE servers ADD COLUMN ${name} ${type}`);
        }
    }

    await db.exec('CREATE INDEX IF NOT EXISTS idx_servers_status ON servers(status)');
    await db.exec('CREATE INDEX IF NOT EXISTS idx_servers_owner ON servers(ownerId)');
    await db.exec('CREATE INDEX IF NOT EXISTS idx_servers_expires ON servers(expiresAt)');

    // Une ligne expiree reste dans l'historique, mais son port doit redevenir
    // disponible. SQLite autorise plusieurs NULL dans une colonne UNIQUE.
    await db.exec(`
        UPDATE servers
           SET lastPort = port,
               port = NULL
         WHERE status = 'expired'
           AND port IS NOT NULL
    `);

    for (const map of DEFAULT_MAPS) {
        await db.run(
            `INSERT OR IGNORE INTO maps (id, name, slug, difficulty) VALUES (?, ?, ?, ?)`,
            [map.id, map.name, map.slug, map.difficulty]
        );
    }

    return db;

}

module.exports = { setupDb };
