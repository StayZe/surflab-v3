const net = require('net');

const AUTH_PACKET_TYPE = 3;
const AUTH_RESPONSE_TYPE = 2;
const COMMAND_PACKET_TYPE = 2;

function encodePacket(id, type, body) {
    const payload = Buffer.from(body, 'utf8');
    const packet = Buffer.alloc(payload.length + 14);
    packet.writeInt32LE(payload.length + 10, 0);
    packet.writeInt32LE(id, 4);
    packet.writeInt32LE(type, 8);
    payload.copy(packet, 12);
    return packet;
}

function sendRconCommand({ host, port, password, command, timeoutMs = 10_000 }) {
    return new Promise((resolve, reject) => {
        const authId = 41;
        const commandId = 42;
        let pending = Buffer.alloc(0);
        let authenticated = false;
        let settled = false;
        const socket = net.createConnection({ host, port });

        const finish = (error, response = '') => {
            if (settled) return;
            settled = true;
            socket.destroy();
            if (error) reject(error);
            else resolve(response);
        };

        socket.setTimeout(timeoutMs);
        socket.on('connect', () => {
            socket.write(encodePacket(authId, AUTH_PACKET_TYPE, password));
        });
        socket.on('timeout', () => finish(new Error('RCON timeout')));
        socket.on('error', finish);
        socket.on('data', chunk => {
            pending = Buffer.concat([pending, chunk]);
            while (pending.length >= 4) {
                const size = pending.readInt32LE(0);
                if (size < 10 || size > 1024 * 1024) {
                    finish(new Error(`Invalid RCON packet size: ${size}`));
                    return;
                }
                if (pending.length < size + 4) return;

                const packet = pending.subarray(0, size + 4);
                pending = pending.subarray(size + 4);
                const id = packet.readInt32LE(4);
                const type = packet.readInt32LE(8);
                const body = packet.subarray(12, size + 2).toString('utf8');

                if (id === -1) {
                    finish(new Error('RCON authentication rejected'));
                    return;
                }
                if (!authenticated && id === authId && type === AUTH_RESPONSE_TYPE) {
                    authenticated = true;
                    socket.write(encodePacket(commandId, COMMAND_PACKET_TYPE, command));
                } else if (authenticated && id === commandId) {
                    finish(null, body);
                    return;
                }
            }
        });
    });
}

function wait(delayMs) {
    return new Promise(resolve => setTimeout(resolve, delayMs));
}

async function sendRconWithRetry(options, { attempts = 20, delayMs = 2_000 } = {}) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            return await sendRconCommand(options);
        } catch (error) {
            lastError = error;
            if (attempt < attempts) await wait(delayMs);
        }
    }
    throw lastError || new Error('RCON command failed');
}

module.exports = { encodePacket, sendRconCommand, sendRconWithRetry };
