const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const DEFAULT_MAPS = [
    { id: '3133346713', name: 'Boreas',  slug: 'surf_boreas', difficulty: 'T1'  },
    { id: '3076153623', name: 'Kitsune',   slug: 'surf_kitsune', difficulty: 'T2'   },
    { id: '3073875025', name: 'Utopia NJV',  slug: 'surf_utopia_njv', difficulty: 'T1'  },
    { id: '3605899620', name: 'Who Knows 2',   slug: 'surf_whoknows2', difficulty: 'T1'   },
    { id: '3581092479', name: 'Frosty',  slug: 'surf_frosty', difficulty: 'T2'  },
    { id: '3617159277', name: 'Inside-Out',   slug: 'surf_insideout', difficulty: 'T3'   },
];

async function setupDb() {
    const db = await open({
        filename: './database.sqlite',
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS servers (
            id          INTEGER  PRIMARY KEY AUTOINCREMENT,
            name        TEXT,
            maxPlayers  INTEGER,
            mapId       TEXT,
            port        INTEGER  UNIQUE,
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
            difficulty TEXT NOT NULL 
        )
    `);

    // Migration douce : ownerId
    const cols = await db.all("PRAGMA table_info(servers)");
    if (!cols.find(c => c.name === 'ownerId')) {
        await db.exec("ALTER TABLE servers ADD COLUMN ownerId TEXT");
    }

    for (const map of DEFAULT_MAPS) {
        await db.run(
            `INSERT OR IGNORE INTO maps (id, name, slug, difficulty) VALUES (?, ?, ?, ?)`,
            [map.id, map.name, map.slug, map.difficulty]
        );
    }

    return db;

}

module.exports = { setupDb };