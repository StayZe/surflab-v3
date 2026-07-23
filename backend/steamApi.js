const WORKSHOP_DETAILS_URL = 'https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/';

// Recupere l'URL de la miniature Workshop d'une map via l'API publique Steam.
// N'a pas besoin de cle API : GetPublishedFileDetails est un endpoint public.
async function fetchWorkshopPreviewUrl(publishedFileId, { timeoutMs = 5000 } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const body = new URLSearchParams();
        body.set('itemcount', '1');
        body.set('publishedfileids[0]', publishedFileId);

        const res = await fetch(WORKSHOP_DETAILS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
            signal: controller.signal,
        });
        if (!res.ok) return null;

        const data = await res.json();
        const detail = data?.response?.publishedfiledetails?.[0];
        if (!detail || detail.result !== 1 || !detail.preview_url) return null;

        return detail.preview_url;
    } catch (_err) {
        return null;
    } finally {
        clearTimeout(timeout);
    }
}

module.exports = { fetchWorkshopPreviewUrl };
