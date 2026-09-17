/* Local SoundCloud stream conversion. No media is sent to a third-party server. */
(() => {
    'use strict';
    const $ = (selector) => document.querySelector(selector);
    const list = $('#tracks');
    const selected = new Set();
    let tracks = [], clientId = null, busy = false;
    const apiOrigin = 'https://api-v2.soundcloud.com';
    const sourceUrl = new URLSearchParams(location.search).get('url');
    const presetParam = new URLSearchParams(location.search).get('preset');
    let exportPreset = null;
    try {
        const parsed = JSON.parse(presetParam || 'null');
        if (typeof parsed?.name === 'string' && parsed.values && typeof parsed.values === 'object') {
            const values = {};
            for (const [key, min, max] of [['rate', 0.1, 3], ['volume', 0, 1], ['bass', 0, 12], ['reverb', 0, 1], ['pitchSemitones', -12, 12]]) {
                if (Number.isFinite(parsed.values[key]) && parsed.values[key] >= min && parsed.values[key] <= max) values[key] = parsed.values[key];
            }
            for (const key of ['muted', 'preservePitch']) if (typeof parsed.values[key] === 'boolean') values[key] = parsed.values[key];
            if (Object.keys(values).length) exportPreset = { name: parsed.name.slice(0, 40), values };
        }
    } catch {}
    const safeName = (text) => {
        const clean = String(text || 'SoundCloud').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
        const extension = /\.(?:mp3|jpg)$/i.exec(clean)?.[0] || '';
        const stem = extension ? clean.slice(0, -extension.length) : clean;
        return `${stem.slice(0, 120 - extension.length).replace(/[. ]+$/, '') || 'SoundCloud'}${extension}`;
    };
    const message = (text) => { $('#status').textContent = text; };
    const error = (text) => { $('#error').textContent = text; };
    if (exportPreset) {
        $('#preset-option').hidden = false;
        $('#preset-name').textContent = exportPreset.name;
        $('#preset-note').hidden = exportPreset.values.rate === undefined || exportPreset.values.rate === 1 || !!exportPreset.values.preservePitch;
    }

    function allowed(url) {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:') throw new Error('Adresse de flux non sécurisée.');
        if (parsed.hostname !== 'api-v2.soundcloud.com' && parsed.hostname !== 'soundcloud.com'
            && !parsed.hostname.endsWith('.sndcdn.com') && !parsed.hostname.endsWith('.soundcloud.cloud')) {
            throw new Error('Hôte de flux SoundCloud inattendu.');
        }
        return parsed.href;
    }
    async function request(url, kind = 'json') {
        const response = await fetch(allowed(url));
        if (!response.ok) {
            const failure = new Error(`SoundCloud : HTTP ${response.status}`);
            failure.status = response.status;
            throw failure;
        }
        return kind === 'buffer' ? response.arrayBuffer() : kind === 'text' ? response.text() : response.json();
    }
    async function api(path, retry = true) {
        try { return await request(`${apiOrigin}${path}${path.includes('?') ? '&' : '?'}client_id=${encodeURIComponent(clientId)}`); }
        catch (failure) {
            if (retry && (failure.status === 401 || failure.status === 403)) {
                const fresh = await chrome.runtime.sendMessage({ type: 'download-client-id', refresh: true });
                if (fresh?.clientId && fresh.clientId !== clientId) { clientId = fresh.clientId; return api(path, false); }
            }
            throw failure;
        }
    }
    const artwork = (track) => (track.artwork_url || track.user?.avatar_url || '').replace(/-(?:large|t\d+x\d+|crop)\./, '-t500x500.');
    const formats = (track) => (track.media?.transcodings || []).filter((item) => item.url && item.format?.protocol);
    function formatLabel(item) {
        const mime = item.format?.mime_type || '';
        const codec = /mpeg|mp3/i.test(mime + item.preset) ? 'MP3' : /opus/i.test(mime + item.preset) ? 'Opus' : /aac|mp4/i.test(mime + item.preset) ? 'AAC' : mime || 'Audio';
        return `${codec} · ${/hq|160|256|320/i.test(item.preset) ? 'HQ' : 'SQ'} · ${item.preset}`;
    }
    function chooseFormat(track) {
        const choices = formats(track);
        const preference = $('#quality').value;
        const score = (item) => {
            const name = `${item.preset} ${item.format.mime_type}`;
            return (/hq|160|256|320/i.test(name) ? 100 : 0) + (/mpeg|mp3/i.test(name) ? 30 : 0)
                + (item.format.protocol === 'progressive' ? 10 : 0);
        };
        return choices.find((item) => item.preset === preference) || choices.sort((a, b) => score(b) - score(a))[0];
    }
    function render() {
        list.replaceChildren();
        for (const track of tracks) {
            const row = document.createElement('div');
            row.className = 'track';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox'; checkbox.checked = selected.has(track.id); checkbox.disabled = busy;
            checkbox.addEventListener('change', () => {
                if (checkbox.checked && selected.size >= 10) { checkbox.checked = false; error('10 titres maximum par lot.'); return; }
                error('');
                if (checkbox.checked) selected.add(track.id); else selected.delete(track.id);
                $('#download').disabled = busy || !selected.size;
            });
            const image = document.createElement('img');
            image.src = artwork(track); image.alt = '';
            const meta = document.createElement('span'); meta.className = 'meta';
            const title = document.createElement('strong'); title.textContent = track.title || `#${track.id}`;
            const artist = document.createElement('small'); artist.textContent = track.user?.username || '';
            meta.append(title, artist);
            const cover = document.createElement('button'); cover.type = 'button'; cover.textContent = 'JPG'; cover.title = 'Télécharger la pochette';
            cover.disabled = busy || !artwork(track);
            cover.addEventListener('click', () => saveCover(track).catch((cause) => error(cause.message)));
            row.append(checkbox, image, meta, cover); list.append(row);
        }
        $('#download').disabled = busy || !selected.size;
        $('#select-all').disabled = busy;
        $('#quality').disabled = busy;
    }
    function populateQuality() {
        const options = new Map();
        for (const track of tracks) for (const item of formats(track)) options.set(item.preset, formatLabel(item));
        for (const [preset, label] of options) {
            const option = document.createElement('option'); option.value = preset; option.textContent = `${label} → MP3`;
            $('#quality').append(option);
        }
    }
    async function resolve() {
        const parsed = new URL(sourceUrl);
        if (parsed.origin !== 'https://soundcloud.com') throw new Error('Adresse SoundCloud invalide.');
        const response = await chrome.runtime.sendMessage({ type: 'download-client-id' });
        clientId = response?.clientId;
        if (!/^[A-Za-z0-9]{20,}$/.test(clientId || '')) throw new Error('Ouvrez SoundCloud et rechargez la page pour obtenir un flux public.');
        const result = await api(`/resolve?url=${encodeURIComponent(parsed.href)}`);
        if (result.kind === 'track') tracks = [result];
        else if (result.kind === 'playlist') {
            tracks = result.tracks || [];
            const missing = tracks.filter((track) => track?.id && !track.media?.transcodings).map((track) => track.id);
            for (let i = 0; i < missing.length; i += 50) {
                const details = await api(`/tracks?ids=${missing.slice(i, i + 50).join(',')}`);
                const byId = new Map(details.map((track) => [track.id, track]));
                tracks = tracks.map((track) => track && (byId.get(track.id) || track));
            }
        } else throw new Error('Cette page ne contient ni titre ni playlist.');
        tracks = tracks.filter((track) => track?.kind === 'track' && track.id && track.sharing !== 'private');
        if (!tracks.length) throw new Error('Aucun titre public disponible.');
        $('#heading').textContent = result.title || 'Téléchargements SoundCloud';
        if (tracks.length === 1) selected.add(tracks[0].id);
        populateQuality(); render(); message(`${tracks.length} titre(s) disponible(s).`);
    }

    async function streamBuffers(track, transcode, onProgress) {
        const endpoint = new URL(transcode.url);
        endpoint.searchParams.set('client_id', clientId);
        const stream = await request(endpoint.href);
        const streamUrl = allowed(stream.url);
        if (transcode.format.protocol === 'progressive') {
            onProgress(0.5);
            return [await request(streamUrl, 'buffer')];
        }
        if (transcode.format.protocol !== 'hls') throw new Error('Protocole de flux non pris en charge.');
        let manifestUrl = streamUrl;
        let manifest = await request(manifestUrl, 'text');
        if (manifest.includes('#EXT-X-STREAM-INF')) {
            const variant = manifest.split(/\r?\n/).find((line) => line && !line.startsWith('#'));
            if (!variant) throw new Error('Playlist HLS vide.');
            manifestUrl = allowed(new URL(variant, manifestUrl).href);
            manifest = await request(manifestUrl, 'text');
        }
        const segments = manifest.split(/\r?\n/).filter((line) => line && !line.startsWith('#'));
        if (!segments.length) throw new Error('Aucun segment audio disponible.');
        const map = manifest.match(/#EXT-X-MAP:URI="([^"]+)"/);
        const prefix = map ? await request(new URL(map[1], manifestUrl).href, 'buffer') : null;
        const buffers = [];
        for (let i = 0; i < segments.length; i++) {
            const part = await request(new URL(segments[i], manifestUrl).href, 'buffer');
            if (prefix) {
                const joined = new Uint8Array(prefix.byteLength + part.byteLength);
                joined.set(new Uint8Array(prefix)); joined.set(new Uint8Array(part), prefix.byteLength);
                buffers.push(joined.buffer);
            } else buffers.push(part);
            onProgress((i + 1) / (segments.length * 2));
        }
        return buffers;
    }
    function pcm(channel, start, size) {
        const output = new Int16Array(size);
        for (let i = 0; i < size; i++) {
            const sample = Math.max(-1, Math.min(1, channel[start + i] || 0));
            output[i] = sample < 0 ? sample * 32768 : sample * 32767;
        }
        return output;
    }
    async function applyAudioPreset(context, chunks, values) {
        const rate = values.rate || 1;
        const channels = Math.min(2, chunks[0].numberOfChannels);
        const frames = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const input = context.createBuffer(channels, frames, 44100);
        let offset = 0;
        for (const chunk of chunks) {
            for (let ch = 0; ch < channels; ch++) input.getChannelData(ch).set(chunk.getChannelData(Math.min(ch, chunk.numberOfChannels - 1)), offset);
            offset += chunk.length;
        }
        const reverb = values.reverb || 0;
        const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        if (!OfflineContext) throw new Error('Le rendu audio hors ligne est indisponible dans ce navigateur.');
        const offline = new OfflineContext(channels, Math.ceil(frames / rate) + (reverb ? 44100 * 3 : 0), 44100);
        const source = offline.createBufferSource(); source.buffer = input; source.playbackRate.value = rate;
        const bass = offline.createBiquadFilter(); bass.type = 'lowshelf'; bass.frequency.value = 90; bass.gain.value = values.bass || 0;
        const dry = offline.createGain(); dry.gain.value = 1 - reverb * 0.35;
        const master = offline.createGain(); master.gain.value = values.muted ? 0 : values.volume ?? 1;
        source.connect(bass); bass.connect(dry); dry.connect(master);
        if (reverb) {
            const impulse = offline.createBuffer(2, 44100 * 2, 44100);
            for (let ch = 0; ch < 2; ch++) {
                const data = impulse.getChannelData(ch);
                for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 3;
            }
            const lowpass = offline.createBiquadFilter(); lowpass.type = 'lowpass'; lowpass.frequency.value = 4500;
            const convolver = offline.createConvolver(); convolver.buffer = impulse;
            const wet = offline.createGain(); wet.gain.value = reverb * 0.9;
            bass.connect(lowpass); lowpass.connect(convolver); convolver.connect(wet); wet.connect(master);
        }
        master.connect(offline.destination); source.start();
        const rendered = await offline.startRendering();
        const semitones = (values.pitchSemitones || 0) + (values.preservePitch ? -12 * Math.log2(rate) : 0);
        return window.__scePitchShifter.render(context, rendered, semitones);
    }
    async function encodeMp3(buffers, onProgress, preset = null) {
        const context = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 44100 });
        const parts = [];
        let encoder = null;
        try {
            const decoded = [];
            const encode = (audio) => {
                const channels = Math.min(2, audio.numberOfChannels);
                if (!channels) throw new Error('Flux audio vide.');
                if (!encoder) encoder = new lamejs.Mp3Encoder(channels, 44100, 192);
                const left = audio.getChannelData(0), right = channels === 2 ? audio.getChannelData(1) : null;
                for (let offset = 0; offset < left.length; offset += 1152) {
                    const n = Math.min(1152, left.length - offset);
                    const encoded = channels === 2 ? encoder.encodeBuffer(pcm(left, offset, n), pcm(right, offset, n)) : encoder.encodeBuffer(pcm(left, offset, n));
                    if (encoded.length) parts.push(encoded);
                }
            };
            for (let i = 0; i < buffers.length; i++) {
                let audio;
                try { audio = await context.decodeAudioData(buffers[i].slice(0)); }
                catch { throw new Error('Le flux audio ne peut pas être décodé localement dans ce navigateur.'); }
                if (preset) {
                    decoded.push(audio);
                    onProgress(0.5 + (i + 1) / (buffers.length * 4));
                    continue;
                }
                encode(audio);
                onProgress(0.5 + (i + 1) / (buffers.length * 2));
                if (i % 4 === 0) await new Promise((done) => setTimeout(done, 0));
            }
            if (preset) {
                const rendered = await applyAudioPreset(context, decoded, preset);
                decoded.length = 0;
                encode(rendered);
                onProgress(0.95);
            }
            if (!encoder) throw new Error('Aucun audio décodé.');
            parts.push(encoder.flush());
            return parts;
        } finally { await context.close(); }
    }

    const bytes = (text) => new TextEncoder().encode(text);
    const u32 = (number) => new Uint8Array([number >>> 24, number >>> 16, number >>> 8, number]);
    const syncSafe = (number) => new Uint8Array([(number >>> 21) & 127, (number >>> 14) & 127, (number >>> 7) & 127, number & 127]);
    const utf16 = (text) => {
        const value = String(text || '');
        const output = new Uint8Array(3 + value.length * 2);
        output.set([1, 0xff, 0xfe]);
        for (let i = 0; i < value.length; i++) { const code = value.charCodeAt(i); output[3 + i * 2] = code & 255; output[4 + i * 2] = code >>> 8; }
        return output;
    };
    function frame(id, data) {
        const output = new Uint8Array(10 + data.length);
        output.set(bytes(id)); output.set(u32(data.length), 4); output.set(data, 10);
        return output;
    }
    async function coverJpg(track) {
        const url = artwork(track);
        if (!url) return null;
        const imageData = await request(url, 'buffer');
        const bitmap = await createImageBitmap(new Blob([imageData]));
        try {
            const canvas = document.createElement('canvas'); canvas.width = 500; canvas.height = 500;
            const side = Math.min(bitmap.width, bitmap.height);
            canvas.getContext('2d').drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 500, 500);
            return await new Promise((done) => canvas.toBlob(done, 'image/jpeg', 0.92));
        } finally { bitmap.close(); }
    }
    async function id3(track, cover, title = track.title) {
        const frames = [frame('TIT2', utf16(title)), frame('TPE1', utf16(track.publisher_metadata?.artist || track.user?.username)),
            frame('TALB', utf16(track.publisher_metadata?.album_title || track.title)), frame('TCON', utf16(track.genre || ''))];
        if (cover) {
            const picture = new Uint8Array(await cover.arrayBuffer());
            const apic = new Uint8Array(1 + 11 + 1 + 1 + picture.length);   // encodage, type MIME + NUL, type d'image, description vide
            apic.set(bytes('image/jpeg'), 1); apic[12] = 3; apic.set(picture, 14);
            frames.push(frame('APIC', apic));
        }
        const size = frames.reduce((sum, item) => sum + item.length, 0);
        const header = new Uint8Array(10); header.set(bytes('ID3')); header.set([3, 0, 0], 3); header.set(syncSafe(size), 6);
        return [header, ...frames];
    }
    async function save(blob, filename) {
        const url = URL.createObjectURL(blob);
        try { await chrome.downloads.download({ url, filename: safeName(filename), saveAs: false, conflictAction: 'uniquify' }); }
        finally { setTimeout(() => URL.revokeObjectURL(url), 120000); }
    }
    async function saveCover(track) {
        const image = await coverJpg(track);
        if (!image) throw new Error('Aucune pochette disponible.');
        await save(image, `${track.user?.username || 'SoundCloud'} - ${track.title}.jpg`);
    }
    async function downloadTrack(track, index, total) {
        const transcode = chooseFormat(track);
        if (!transcode) throw new Error('Aucun flux public disponible pour ce titre.');
        const update = (fraction) => {
            $('#progress').value = ((index + fraction) / total) * 100;
            message(`${index + 1}/${total} · ${track.title} · ${Math.round(fraction * 100)} %`);
        };
        const buffers = await streamBuffers(track, transcode, update);
        const appliedPreset = exportPreset && $('#apply-preset').checked ? exportPreset : null;
        const mp3 = await encodeMp3(buffers, update, appliedPreset?.values || null);
        let cover = null;
        try { cover = await coverJpg(track); } catch { /* Audio remains downloadable without artwork. */ }
        const title = `${track.title}${appliedPreset ? ` - ${appliedPreset.name}` : ''}`;
        await save(new Blob([...(await id3(track, cover, title)), ...mp3], { type: 'audio/mpeg' }),
            `${track.user?.username || 'SoundCloud'} - ${title}.mp3`);
        update(1);
        return !!appliedPreset;
    }
    $('#upload').addEventListener('click', () => window.open('https://soundcloud.com/upload', '_blank', 'noopener'));
    $('#select-all').addEventListener('click', () => { selected.clear(); tracks.slice(0, 10).forEach((track) => selected.add(track.id)); error(''); render(); });
    $('#download').addEventListener('click', async () => {
        if (busy || !selected.size) return;
        busy = true; error(''); render(); $('#progress').hidden = false; $('#progress').value = 0;
        const batch = tracks.filter((track) => selected.has(track.id)).slice(0, 10);
        const failures = [];
        let remixReady = false;
        for (let i = 0; i < batch.length; i++) {
            try { remixReady = (await downloadTrack(batch[i], i, batch.length)) || remixReady; }
            catch (cause) { failures.push(`${batch[i].title}: ${cause.message}`); $('#progress').value = ((i + 1) / batch.length) * 100; }
        }
        busy = false; render(); message(`${batch.length - failures.length}/${batch.length} téléchargement(s) terminé(s).`);
        $('#upload').hidden = !remixReady;
        $('#upload-note').hidden = !remixReady;
        if (failures.length) error(failures.join(' · '));
    });
    resolve().catch((cause) => error(cause.message));
})();
