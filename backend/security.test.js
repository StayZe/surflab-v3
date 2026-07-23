const test = require('node:test');
const assert = require('node:assert/strict');
const {
    createApiKeyMiddleware,
    createCorsOptions,
    createFixedWindowRateLimiter,
    extractApiKey,
    safeEqual,
} = require('./security');

function request(headers = {}, ip = '127.0.0.1') {
    return {
        ip,
        get(name) {
            return headers[name.toLowerCase()];
        },
    };
}

function response() {
    return {
        statusCode: 200,
        headers: {},
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        set(name, value) {
            this.headers[name] = value;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
    };
}

test('la cle API est lue depuis Bearer ou X-SurfLab-Key', () => {
    assert.equal(extractApiKey(request({ authorization: 'Bearer secret' })), 'secret');
    assert.equal(extractApiKey(request({ 'x-surflab-key': 'secret-2' })), 'secret-2');
    assert.equal(extractApiKey(request()), '');
});

test('la comparaison de cle refuse les valeurs differentes', () => {
    assert.equal(safeEqual('secret', 'secret'), true);
    assert.equal(safeEqual('secret', 'autre'), false);
    assert.equal(safeEqual('', 'secret'), false);
});

test('le middleware protege les routes de gestion', () => {
    const middleware = createApiKeyMiddleware('secret');
    let called = false;
    const unauthorized = response();
    middleware(request(), unauthorized, () => { called = true; });
    assert.equal(unauthorized.statusCode, 401);
    assert.equal(called, false);

    const authorized = response();
    middleware(request({ authorization: 'Bearer secret' }), authorized, () => { called = true; });
    assert.equal(called, true);
});

test('le limiteur bloque les creations excessives', () => {
    const middleware = createFixedWindowRateLimiter({ max: 2, windowMs: 60_000 });
    const req = request({}, '10.0.0.1');
    let accepted = 0;
    middleware(req, response(), () => { accepted += 1; });
    middleware(req, response(), () => { accepted += 1; });
    const blocked = response();
    middleware(req, blocked, () => { accepted += 1; });
    assert.equal(accepted, 2);
    assert.equal(blocked.statusCode, 429);
});

test('CORS accepte uniquement les origines configurees et les appels serveur', () => {
    const options = createCorsOptions('https://surflab.example,http://localhost:5173');
    options.origin(undefined, (error, allowed) => {
        assert.equal(error, null);
        assert.equal(allowed, true);
    });
    options.origin('https://surflab.example', (error, allowed) => {
        assert.equal(error, null);
        assert.equal(allowed, true);
    });
    options.origin('https://evil.example', (error, allowed) => {
        assert.equal(error, null);
        assert.equal(allowed, false);
    });
});
