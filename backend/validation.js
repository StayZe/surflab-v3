const SERVER_NAME_PATTERN = /^[\p{L}\p{N} _.'\-\[\]()#]+$/u;

function parseInteger(value) {
    if (typeof value === 'number' && Number.isInteger(value)) return value;
    if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return null;
    return Number.parseInt(value, 10);
}

function validateCreatePayload(payload, options = {}) {
    const minDuration = options.minDuration ?? 15;
    const maxDuration = options.maxDuration ?? 480;
    const defaultDuration = options.defaultDuration ?? 60;
    const requireMapId = options.requireMapId ?? false;
    const requireOwnerId = options.requireOwnerId ?? false;
    const maxPlayersLimit = options.maxPlayers ?? 64;

    const serverName = typeof payload.serverName === 'string'
        ? payload.serverName.trim()
        : '';
    if (serverName.length < 3 || serverName.length > 64 || !SERVER_NAME_PATTERN.test(serverName)) {
        return { error: 'serverName doit contenir entre 3 et 64 caracteres valides.' };
    }

    const maxPlayers = parseInteger(payload.maxPlayers);
    if (maxPlayers === null || maxPlayers < 1 || maxPlayers > maxPlayersLimit) {
        return { error: `maxPlayers doit etre un entier compris entre 1 et ${maxPlayersLimit}.` };
    }

    let mapId = null;
    if (payload.mapId !== undefined && payload.mapId !== null && String(payload.mapId).trim() !== '') {
        mapId = String(payload.mapId).trim();
        if (!/^\d{7,12}$/.test(mapId)) {
            return { error: 'mapId doit etre un identifiant Workshop numerique valide.' };
        }
    }
    if (requireMapId && !mapId) {
        return { error: 'mapId est obligatoire pour creer un serveur Surf.' };
    }

    let ownerId = null;
    if (payload.ownerId !== undefined && payload.ownerId !== null && String(payload.ownerId).trim() !== '') {
        ownerId = String(payload.ownerId).trim();
        if (ownerId.length > 128 || !/^[^\s\x00-\x1F\x7F]+$/u.test(ownerId)) {
            return { error: 'ownerId est invalide.' };
        }
    }
    if (requireOwnerId && !ownerId) {
        return { error: 'ownerId est obligatoire.' };
    }

    const rawDuration = payload.durationMinutes ?? defaultDuration;
    const durationMinutes = parseInteger(rawDuration);
    if (durationMinutes === null || durationMinutes < minDuration || durationMinutes > maxDuration) {
        return { error: `durationMinutes doit etre compris entre ${minDuration} et ${maxDuration}.` };
    }

    return { value: { serverName, maxPlayers, mapId, ownerId, durationMinutes } };
}

function pickAvailablePort(usedPorts, basePort, rangeSize) {
    const used = usedPorts instanceof Set ? usedPorts : new Set(usedPorts);
    for (let port = basePort; port < basePort + rangeSize; port += 1) {
        if (!used.has(port)) return port;
    }
    return null;
}

module.exports = { parseInteger, pickAvailablePort, validateCreatePayload };
