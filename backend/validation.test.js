const test = require('node:test');
const assert = require('node:assert/strict');
const { parseInteger, pickAvailablePort, validateCreatePayload } = require('./validation');

test('parseInteger accepte un entier ou une chaine numerique', () => {
    assert.equal(parseInteger(12), 12);
    assert.equal(parseInteger(' 32 '), 32);
    assert.equal(parseInteger('12.5'), null);
    assert.equal(parseInteger('abc'), null);
});

test('le payload historique reste compatible sans duree explicite', () => {
    const result = validateCreatePayload({
        serverName: 'SurfLab Test',
        maxPlayers: 12,
        mapId: '3133346713',
        ownerId: 'user-42',
    });
    assert.deepEqual(result.value, {
        serverName: 'SurfLab Test',
        maxPlayers: 12,
        mapId: '3133346713',
        ownerId: 'user-42',
        durationMinutes: 60,
    });
});

test('les valeurs dangereuses ou hors limites sont refusees', () => {
    assert.match(validateCreatePayload({ serverName: 'x', maxPlayers: 10 }).error, /serverName/);
    assert.match(validateCreatePayload({ serverName: 'Surf; quit', maxPlayers: 10 }).error, /serverName/);
    assert.match(validateCreatePayload({ serverName: 'SurfLab', maxPlayers: 0 }).error, /maxPlayers/);
    assert.match(validateCreatePayload({ serverName: 'SurfLab', maxPlayers: 10, mapId: '+quit' }).error, /mapId/);
    assert.match(validateCreatePayload({ serverName: 'SurfLab', maxPlayers: 10, durationMinutes: 600 }).error, /durationMinutes/);
});

test('la creation SaaS exige une map et un proprietaire', () => {
    const options = { requireMapId: true, requireOwnerId: true, maxPlayers: 16 };
    assert.match(
        validateCreatePayload({ serverName: 'SurfLab', maxPlayers: 10, ownerId: 'user-42' }, options).error,
        /mapId/
    );
    assert.match(
        validateCreatePayload({ serverName: 'SurfLab', maxPlayers: 10, mapId: '3133346713' }, options).error,
        /ownerId/
    );
    assert.equal(
        validateCreatePayload({
            serverName: 'SurfLab',
            maxPlayers: 10,
            mapId: '3133346713',
            ownerId: 'user-42',
        }, options).error,
        undefined
    );
    assert.match(
        validateCreatePayload({
            serverName: 'SurfLab',
            maxPlayers: 32,
            mapId: '3133346713',
            ownerId: 'user-42',
        }, options).error,
        /maxPlayers/
    );
});

test('le premier port libre est reutilise sans collision', () => {
    assert.equal(pickAvailablePort(new Set([27026, 27028]), 27026, 4), 27027);
    assert.equal(pickAvailablePort(new Set([27026, 27027]), 27026, 2), null);
});
