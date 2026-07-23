const assert = require('node:assert/strict');
const net = require('node:net');
const test = require('node:test');
const { encodePacket, sendRconCommand } = require('./rcon');

function decodePacket(packet) {
    const size = packet.readInt32LE(0);
    return {
        id: packet.readInt32LE(4),
        type: packet.readInt32LE(8),
        body: packet.subarray(12, size + 2).toString('utf8'),
    };
}

test('encodePacket construit un paquet Source RCON valide', () => {
    const packet = encodePacket(7, 2, 'status');
    assert.equal(packet.readInt32LE(0), 16);
    assert.deepEqual(decodePacket(packet), { id: 7, type: 2, body: 'status' });
});

test('sendRconCommand authentifie puis renvoie la reponse', async () => {
    const server = net.createServer(socket => {
        let requests = 0;
        socket.on('data', data => {
            const request = decodePacket(data);
            requests += 1;
            if (requests === 1) {
                assert.deepEqual(request, { id: 41, type: 3, body: 'secret' });
                socket.write(encodePacket(41, 2, ''));
            } else {
                assert.deepEqual(request, { id: 42, type: 2, body: 'status' });
                socket.write(encodePacket(42, 0, 'surf_boreas'));
            }
        });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    try {
        const response = await sendRconCommand({
            host: '127.0.0.1',
            port: address.port,
            password: 'secret',
            command: 'status',
        });
        assert.equal(response, 'surf_boreas');
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});
