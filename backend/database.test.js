const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { setupDb } = require('./database');

test('une expiration conserve le port historique tout en le liberant', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'surflab-db-'));
    const filename = path.join(directory, 'database.sqlite');
    let db;
    try {
        db = await setupDb(filename);
        await db.run(
            `INSERT INTO servers
                (name, maxPlayers, mapId, port, containerId, status, ownerId, durationMinutes, expiresAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
            ['Expired test', 4, '3133346713', 27030, 'removed', 'expired', 'test-owner', 15]
        );
        await db.close();

        db = await setupDb(filename);
        const expired = await db.get(
            'SELECT port, lastPort FROM servers WHERE name = ?',
            ['Expired test']
        );
        assert.equal(expired.port, null);
        assert.equal(expired.lastPort, 27030);

        await assert.doesNotReject(() => db.run(
            `INSERT INTO servers (name, port, status) VALUES (?, ?, ?)`,
            ['Reused port', 27030, 'starting']
        ));
    } finally {
        if (db) await db.close().catch(() => {});
        await fs.rm(directory, { recursive: true, force: true });
    }
});
