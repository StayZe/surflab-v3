const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSurfSettingsCommand, parseCurrentMap } = require('./workshop');

test('parseCurrentMap lit la map principale dans la reponse RCON status', () => {
    const response = `
----- Status -----
loaded spawngroup(  1)  : SV:  [1: surf_boreas | main lump | mapload]
loaded spawngroup(  2)  : SV:  [2: maps/prefabs/example | main lump]
`;
    assert.equal(parseCurrentMap(response), 'surf_boreas');
});

test('parseCurrentMap refuse une reponse incomplete', () => {
    assert.equal(parseCurrentMap('Server: Running'), null);
});

test('buildSurfSettingsCommand verrouille la rotation et neutralise les bots', () => {
    const command = buildSurfSettingsCommand('SurfLab Boreas');
    assert.match(command, /mp_endmatch_votenextmap 0/);
    assert.match(command, /mp_match_end_changelevel 0/);
    assert.match(command, /mp_match_end_restart 0/);
    assert.match(command, /mp_ignore_round_win_conditions 1/);
    assert.match(command, /bot_quota 0/);
});

test('buildSurfSettingsCommand neutralise les separateurs du hostname', () => {
    const command = buildSurfSettingsCommand('Surf; quit\nServer');
    assert.doesNotMatch(command, /Surf; quit/);
    assert.match(command, /^hostname "Surf  quit Server";/);
});
