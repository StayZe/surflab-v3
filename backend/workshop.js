function escapeHostname(value) {
    return String(value || 'SurfLab')
        .replace(/[\r\n;]/g, ' ')
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"');
}

function buildSurfSettingsCommand(serverName) {
    return [
        `hostname "${escapeHostname(serverName)}"`,
        'mp_timelimit 0',
        'mp_maxrounds 0',
        'mp_match_can_clinch 0',
        'mp_ignore_round_win_conditions 1',
        'mp_endmatch_votenextmap 0',
        'mp_match_end_changelevel 0',
        'mp_match_end_restart 0',
        'sv_allow_votes 0',
        'bot_quota 0',
        'nextlevel ""',
    ].join('; ');
}

function parseCurrentMap(statusResponse) {
    const match = String(statusResponse || '').match(
        /loaded spawngroup\(\s*1\)\s*:\s*SV:\s*\[1:\s*([^|\]]+?)\s*\|/i
    );
    return match ? match[1].trim() : null;
}

module.exports = { buildSurfSettingsCommand, parseCurrentMap };
