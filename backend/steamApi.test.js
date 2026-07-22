const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchWorkshopPreviewUrl } = require('./steamApi');

function withMockedFetch(impl, fn) {
    const original = global.fetch;
    global.fetch = impl;
    return fn().finally(() => { global.fetch = original; });
}

test('fetchWorkshopPreviewUrl renvoie le preview_url quand Steam repond correctement', () => withMockedFetch(
    async () => ({
        ok: true,
        json: async () => ({
            response: {
                result: 1,
                publishedfiledetails: [{ result: 1, preview_url: 'https://example.com/thumb.jpg' }],
            },
        }),
    }),
    async () => {
        const url = await fetchWorkshopPreviewUrl('3133346713');
        assert.equal(url, 'https://example.com/thumb.jpg');
    }
));

test('fetchWorkshopPreviewUrl renvoie null si la map est introuvable sur Steam', () => withMockedFetch(
    async () => ({
        ok: true,
        json: async () => ({
            response: { result: 1, publishedfiledetails: [{ result: 9 }] },
        }),
    }),
    async () => {
        assert.equal(await fetchWorkshopPreviewUrl('0'), null);
    }
));

test('fetchWorkshopPreviewUrl renvoie null si la requete HTTP echoue', () => withMockedFetch(
    async () => { throw new Error('network down'); },
    async () => {
        assert.equal(await fetchWorkshopPreviewUrl('3133346713'), null);
    }
));

test('fetchWorkshopPreviewUrl renvoie null sur une reponse HTTP non-ok', () => withMockedFetch(
    async () => ({ ok: false }),
    async () => {
        assert.equal(await fetchWorkshopPreviewUrl('3133346713'), null);
    }
));
