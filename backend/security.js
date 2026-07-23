const crypto = require('crypto');

function extractApiKey(req) {
    const authorization = req.get('authorization') || '';
    if (/^Bearer\s+/i.test(authorization)) {
        return authorization.replace(/^Bearer\s+/i, '').trim();
    }
    return (req.get('x-surflab-key') || '').trim();
}

function safeEqual(left, right) {
    const leftBuffer = Buffer.from(String(left || ''));
    const rightBuffer = Buffer.from(String(right || ''));
    return leftBuffer.length === rightBuffer.length
        && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function createApiKeyMiddleware(expectedKey) {
    return (req, res, next) => {
        if (!expectedKey) {
            return res.status(503).json({
                success: false,
                error: 'Authentification interne SurfLab non configuree.',
            });
        }
        if (!safeEqual(extractApiKey(req), expectedKey)) {
            return res.status(401).json({
                success: false,
                error: 'Authentification requise.',
            });
        }
        next();
    };
}

function createFixedWindowRateLimiter({ max, windowMs = 60_000 }) {
    const buckets = new Map();
    return (req, res, next) => {
        if (max <= 0) return next();

        const now = Date.now();
        const key = req.ip || req.socket?.remoteAddress || 'unknown';
        const current = buckets.get(key);
        if (!current || current.resetAt <= now) {
            buckets.set(key, { count: 1, resetAt: now + windowMs });
            return next();
        }
        current.count += 1;
        if (current.count > max) {
            res.set('Retry-After', String(Math.max(1, Math.ceil((current.resetAt - now) / 1000))));
            return res.status(429).json({
                success: false,
                error: 'Trop de creations de serveur. Reessaie dans quelques instants.',
            });
        }
        next();
    };
}

function createCorsOptions(originsText = '') {
    const allowedOrigins = new Set(
        String(originsText)
            .split(',')
            .map(origin => origin.trim())
            .filter(Boolean)
    );
    return {
        origin(origin, callback) {
            if (!origin || allowedOrigins.has(origin)) return callback(null, true);
            return callback(null, false);
        },
        methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Authorization', 'Content-Type', 'X-SurfLab-Key'],
        maxAge: 600,
    };
}

function securityHeaders(req, res, next) {
    res.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    });
    next();
}

module.exports = {
    createApiKeyMiddleware,
    createCorsOptions,
    createFixedWindowRateLimiter,
    extractApiKey,
    safeEqual,
    securityHeaders,
};
