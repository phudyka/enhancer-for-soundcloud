/* Enhancer for SoundCloud™ — agrégats de l'historique d'écoute (pur, testable sous Node).
   Entrée : écoutes { url, title, artist, artwork, duration, at (ms), listened (s) }. */
(function (root) {
    'use strict';
    const DAY = 86400000;

    /** Écoutes de la période : 'today', '7d', '30d', 'year' ou 'all'. */
    function filter(entries, period, now = Date.now()) {
        if (period === 'all') return entries.slice();
        let since;
        if (period === 'today') { const d = new Date(now); d.setHours(0, 0, 0, 0); since = d.getTime(); }
        else if (period === '7d') since = now - 7 * DAY;
        else if (period === '30d') since = now - 30 * DAY;
        else if (period === 'year') since = now - 365 * DAY;
        else return entries.slice();
        return entries.filter((e) => e.at >= since);
    }

    const trackKey = (url) => (url ? String(url).split('?')[0] : null);   // même titre joué depuis plusieurs playlists (?in=)

    function summarize(entries) {
        const tracks = new Set(), artists = new Set();
        let seconds = 0, completed = 0;
        for (const e of entries) {
            seconds += e.listened || 0;
            tracks.add(trackKey(e.url));
            if (e.artist) artists.add(e.artist);
            if (e.duration && e.listened >= e.duration * 0.9) completed++;
        }
        return { seconds, plays: entries.length, tracks: tracks.size, artists: artists.size, completed };
    }

    function group(entries, keyOf) {
        const map = new Map();
        for (const e of entries) {
            const key = keyOf(e); if (!key) continue;
            let g = map.get(key);
            if (!g) { g = { key, seconds: 0, plays: 0, last: 0, sample: e }; map.set(key, g); }
            g.seconds += e.listened || 0; g.plays++;
            if (e.at >= g.last) { g.last = e.at; g.sample = e; }
        }
        return [...map.values()].sort((a, b) => b.seconds - a.seconds || b.plays - a.plays || b.last - a.last);
    }

    const topTracks = (entries, n = 10) => group(entries, (e) => trackKey(e.url)).slice(0, n)
        .map((g) => ({ url: g.key, title: g.sample.title, artist: g.sample.artist, artwork: g.sample.artwork, seconds: g.seconds, plays: g.plays }));
    const topArtists = (entries, n = 10) => group(entries, (e) => e.artist).slice(0, n)
        .map((g) => ({ artist: g.key, seconds: g.seconds, plays: g.plays, artwork: g.sample.artwork, tracks: new Set(entries.filter((e) => e.artist === g.key).map((e) => trackKey(e.url))).size }));

    /** Secondes écoutées par heure de début (0–23), heure locale. */
    function byHour(entries) {
        const out = new Array(24).fill(0);
        for (const e of entries) out[new Date(e.at).getHours()] += e.listened || 0;
        return out;
    }
    /** Secondes écoutées par jour de semaine, lundi en premier. */
    function byWeekday(entries) {
        const out = new Array(7).fill(0);
        for (const e of entries) out[(new Date(e.at).getDay() + 6) % 7] += e.listened || 0;
        return out;
    }
    /** Secondes écoutées par jour calendaire sur les `days` derniers jours, du plus ancien au plus récent. */
    function byDay(entries, days = 30, now = Date.now()) {
        const start = new Date(now); start.setHours(0, 0, 0, 0);
        const out = [];
        for (let i = days - 1; i >= 0; i--) out.push({ day: new Date(start.getTime() - i * DAY), seconds: 0 });
        const first = out[0].day.getTime();
        for (const e of entries) {
            if (e.at < first) continue;
            const d = new Date(e.at); d.setHours(0, 0, 0, 0);
            const idx = Math.round((d.getTime() - first) / DAY);
            if (out[idx]) out[idx].seconds += e.listened || 0;
        }
        return out;
    }

    const recent = (entries, n = 50) => entries.slice().sort((a, b) => b.at - a.at).slice(0, n);

    function fmtDuration(seconds, lang = 'fr') {
        seconds = Math.round(seconds || 0);
        const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
        if (h) return `${h} h ${String(m).padStart(2, '0')} min`;
        if (m) return `${m} min`;
        return `${s} s`;
    }

    function toCSV(entries) {
        const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const rows = [['date', 'title', 'artist', 'url', 'listened_seconds', 'duration_seconds']];
        for (const e of recent(entries, Infinity)) rows.push([new Date(e.at).toISOString(), e.title, e.artist, `https://soundcloud.com${e.url}`, e.listened, e.duration ?? '']);
        return rows.map((r) => r.map(esc).join(',')).join('\n');
    }

    root.SCE_STATS = { filter, summarize, topTracks, topArtists, byHour, byWeekday, byDay, recent, fmtDuration, toCSV };
})(typeof globalThis !== 'undefined' ? globalThis : this);
