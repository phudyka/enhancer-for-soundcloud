/*
 * Enhancer for SoundCloud™ — sampler : boucles A/B mémorisées (monde principal)
 *
 * Pour repérer des passages (samples) dans un titre : point A, point B, lecture
 * en boucle entre les deux, boucles nommées et mémorisées par titre, liste
 * copiable (horodatages + lien). Aucune extraction audio : tout se joue dans
 * le lecteur SoundCloud.
 *
 *   · Touches : [ = A au temps courant · ] = B · \\ = boucle on/off · Maj+[ / Maj+] = ±0,1 s
 *   · Section « Samples » ajoutée au panneau Audio (événement 'sce:audio-panel')
 *   · Repères A et B dessinés sur la barre de progression du lecteur
 *
 * Stockage : localStorage 'sce:samples' → { [url]: [{ name, a, b }] }.
 */
(() => {
    'use strict';
    const NS = 'sce-smp';
    const KEY = 'sce:samples';
    const T = {
        fr: { title: 'Samples', a: 'A', b: 'B', loop: 'Boucle', save: 'Mémoriser', copy: 'Copier la liste', copied: 'Liste copiée', del: 'Supprimer', play: 'Jouer en boucle', empty: 'Aucun sample mémorisé pour ce titre', name: 'Nom du sample', setA: 'Point A au temps courant ([)', setB: 'Point B au temps courant (])', tipLoop: 'Lire en boucle entre A et B (\\\\)', none: '–' },
        en: { title: 'Samples', a: 'A', b: 'B', loop: 'Loop', save: 'Save', copy: 'Copy list', copied: 'List copied', del: 'Delete', play: 'Play in loop', empty: 'No sample saved for this track', name: 'Sample name', setA: 'Point A at current time ([)', setB: 'Point B at current time (])', tipLoop: 'Loop between A and B (\\\\)', none: '–' },
    };
    const L = T[(document.documentElement.lang || 'en').slice(0, 2)] || T.en;
    const fmt = (s) => { if (!Number.isFinite(s)) return L.none; const m = Math.floor(s / 60), r = s - m * 60; return `${m}:${r.toFixed(2).padStart(5, '0')}`; };
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const enabled = () => { try { return JSON.parse(localStorage.getItem('scsp:settings') || '{}').sampler !== false; } catch { return true; } };
    const trackUrl = () => document.querySelector('.playbackSoundBadge__titleLink')?.getAttribute('href') || null;
    const trackTitle = () => document.querySelector('.playbackSoundBadge__titleLink')?.title || '';
    const media = () => window.__sceMedia;

    const store = {
        all() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } },
        list(url) { return (url && this.all()[url]) || []; },
        save(url, list) { const all = this.all(); if (list.length) all[url] = list; else delete all[url]; try { localStorage.setItem(KEY, JSON.stringify(all)); } catch {} },
    };

    // ── Boucle ────────────────────────────────────────────────────
    const loop = { a: NaN, b: NaN, on: false, url: null, timer: null };
    const valid = () => Number.isFinite(loop.a) && Number.isFinite(loop.b) && loop.b > loop.a + 0.05;
    function tick() {
        const m = media(); if (!m || !loop.on || !valid()) return;
        if (m.currentTime >= loop.b - 0.02 || m.currentTime < loop.a - 1) { try { m.currentTime = loop.a; } catch {} }
    }
    function setLoop(on) {
        loop.on = on && valid();
        clearInterval(loop.timer); loop.timer = null;
        if (loop.on) { loop.timer = setInterval(tick, 30); const m = media(); if (m && (m.currentTime < loop.a || m.currentTime > loop.b)) { try { m.currentTime = loop.a; } catch {} } }
        render();
    }
    function setPoint(which, time) {
        const m = media(); const t = Number.isFinite(time) ? time : m?.currentTime;
        if (!Number.isFinite(t)) return;
        loop[which] = Math.max(0, Math.round(t * 100) / 100);
        loop.url = trackUrl();
        if (loop.on && !valid()) setLoop(false); else render();
    }
    function nudge(which, delta) { if (Number.isFinite(loop[which])) setPoint(which, loop[which] + delta); }
    function play(sample) { loop.a = sample.a; loop.b = sample.b; loop.url = trackUrl(); setLoop(true); }
    function resetForTrack() { const url = trackUrl(); if (url !== loop.url) { loop.a = NaN; loop.b = NaN; loop.url = url; setLoop(false); } }

    // ── Panneau (section dans le panneau Audio) ───────────────────
    let section = null;
    const STYLE = `
        .${NS} { padding-top: 8px; border-top: 1px solid #444; margin-top: 8px; }
        .${NS} h4 { margin: 0 0 6px; font-size: 12px; font-weight: 400; color: #999; display: flex; justify-content: space-between; }
        .${NS}-row { display: flex; align-items: center; gap: 4px; margin-bottom: 6px; }
        .${NS}-row button, .${NS}-list button { height: 24px; padding: 0 8px; border: 0; border-radius: 2px; background: #444; color: #ddd; cursor: pointer; font: 500 11px system-ui, sans-serif; }
        .${NS}-row button:hover, .${NS}-list button:hover { background: #555; color: #fff; }
        .${NS}-row button.m-on { background: var(--sce-accent, #f50); color: #fff; }
        .${NS}-row b { color: #fff; font-variant-numeric: tabular-nums; font-weight: 600; min-width: 52px; text-align: center; }
        .${NS}-row .nudge { width: 18px; padding: 0; }
        .${NS}-row input { flex: 1; min-width: 0; height: 24px; background: #222; border: 1px solid #555; border-radius: 2px; color: #fff; padding: 0 6px; font: 11px system-ui, sans-serif; }
        .${NS}-list { list-style: none; margin: 0; padding: 0; max-height: 140px; overflow: auto; }
        .${NS}-list li { display: flex; align-items: center; gap: 6px; padding: 3px 0; border-top: 1px solid #3a3a3a; font-size: 11px; color: #ccc; }
        .${NS}-list li span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .${NS}-list li em { font-style: normal; color: #999; font-variant-numeric: tabular-nums; }
        .${NS}-empty { color: #777; font-size: 11px; }
        .${NS}-mark { position: absolute; top: -3px; width: 2px; height: 8px; background: var(--sce-accent, #f50); z-index: 3; pointer-events: none; }
        .${NS}-mark::after { content: attr(data-l); position: absolute; top: -12px; left: -3px; font: 700 9px system-ui, sans-serif; color: var(--sce-accent, #f50); }
    `;
    function ensureStyle() { if (!document.getElementById(`${NS}-styles`)) { const st = document.createElement('style'); st.id = `${NS}-styles`; st.textContent = STYLE; document.head.appendChild(st); } }
    function build(panel) {
        ensureStyle();
        section = document.createElement('div'); section.className = NS;
        section.innerHTML = `
            <h4><span>${L.title}</span><button type="button" class="${NS}-copy" style="background:none;border:0;color:#999;cursor:pointer;font:11px system-ui,sans-serif;padding:0">${L.copy}</button></h4>
            <div class="${NS}-row"><button type="button" data-set="a" title="${L.setA}">${L.a}</button><button type="button" class="nudge" data-nudge="a:-0.1">−</button><b class="v-a"></b><button type="button" class="nudge" data-nudge="a:0.1">+</button>
                <button type="button" data-set="b" title="${L.setB}">${L.b}</button><button type="button" class="nudge" data-nudge="b:-0.1">−</button><b class="v-b"></b><button type="button" class="nudge" data-nudge="b:0.1">+</button>
                <button type="button" class="v-loop" title="${L.tipLoop}">${L.loop}</button></div>
            <div class="${NS}-row"><input type="text" class="v-name" placeholder="${L.name}" maxlength="60"><button type="button" class="v-save">${L.save}</button></div>
            <ul class="${NS}-list"></ul><div class="${NS}-empty"></div>`;
        section.addEventListener('click', (e) => {
            const b = e.target.closest('button'); if (!b) return;
            if (b.dataset.set) setPoint(b.dataset.set);
            else if (b.dataset.nudge) { const [w, d] = b.dataset.nudge.split(':'); nudge(w, parseFloat(d)); }
            else if (b.classList.contains('v-loop')) setLoop(!loop.on);
            else if (b.classList.contains('v-save')) save();
            else if (b.classList.contains(`${NS}-copy`)) copyList();
            else if (b.dataset.play != null) { const s = store.list(trackUrl())[+b.dataset.play]; if (s) play(s); }
            else if (b.dataset.del != null) { const url = trackUrl(); const list = store.list(url).filter((_, i) => i !== +b.dataset.del); store.save(url, list); render(); }
        });
        section.querySelector('.v-name').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') save(); });
        panel.appendChild(section);
        render();
    }
    function save() {
        if (!valid()) return;
        const url = trackUrl(); if (!url) return;
        const input = section?.querySelector('.v-name');
        const list = store.list(url);
        const name = (input?.value || '').trim() || `Sample ${list.length + 1}`;
        list.push({ name, a: loop.a, b: loop.b });
        store.save(url, list);
        if (input) input.value = '';
        render();
    }
    function copyList() {
        const url = trackUrl(); const list = store.list(url); if (!list.length) return;
        const text = [`${trackTitle()} — https://soundcloud.com${url}`, ...list.map((s) => `${fmt(s.a)} → ${fmt(s.b)}  ${s.name}`)].join('\n');
        navigator.clipboard?.writeText(text).then(() => window.__scsp?.toast?.(L.copied)).catch(() => {});
    }
    function render() {
        renderMarks();
        if (!section?.isConnected) return;
        section.querySelector('.v-a').textContent = fmt(loop.a);
        section.querySelector('.v-b').textContent = fmt(loop.b);
        section.querySelector('.v-loop').classList.toggle('m-on', loop.on);
        const list = store.list(trackUrl());
        section.querySelector(`.${NS}-list`).innerHTML = list.map((s, i) => `<li><span>${esc(s.name)}</span><em>${fmt(s.a)} → ${fmt(s.b)}</em><button type="button" data-play="${i}" title="${L.play}">▶</button><button type="button" data-del="${i}" title="${L.del}">×</button></li>`).join('');
        section.querySelector(`.${NS}-empty`).textContent = list.length ? '' : L.empty;
    }
    /** Repères A et B sur la barre de progression du lecteur. */
    function renderMarks() {
        const bar = document.querySelector('.playbackTimeline__progressWrapper');
        document.querySelectorAll(`.${NS}-mark`).forEach((el) => el.remove());
        const m = media(); if (!bar || !m?.duration || !enabled()) return;
        bar.style.position = bar.style.position || 'relative';
        for (const which of ['a', 'b']) {
            if (!Number.isFinite(loop[which])) continue;
            const mark = document.createElement('div'); mark.className = `${NS}-mark`; mark.dataset.l = which.toUpperCase();
            mark.style.left = `${Math.min(100, (loop[which] / m.duration) * 100)}%`;
            bar.appendChild(mark);
        }
    }

    document.addEventListener('keydown', (e) => {
        if (!enabled()) return;
        const el = document.activeElement;
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
        if (e.ctrlKey || e.altKey || e.metaKey) return;
        if (e.code === 'BracketLeft')  { e.preventDefault(); e.shiftKey ? nudge('a', -0.1) : setPoint('a'); }
        if (e.code === 'BracketRight') { e.preventDefault(); e.shiftKey ? nudge('b', 0.1) : setPoint('b'); }
        if (e.code === 'Backslash')    { e.preventDefault(); setLoop(!loop.on); }
    });
    window.addEventListener('sce:audio-panel', (e) => { if (enabled() && e.detail?.panel) build(e.detail.panel); });
    if (typeof window.__sceOnMedia === 'function') window.__sceOnMedia((el) => { el.addEventListener('play', resetForTrack); el.addEventListener('loadedmetadata', () => { resetForTrack(); render(); }); });
    new MutationObserver(() => { if (document.querySelector('.playbackTimeline__progressWrapper') && !document.querySelector(`.${NS}-mark`) && (Number.isFinite(loop.a) || Number.isFinite(loop.b))) renderMarks(); }).observe(document.body, { childList: true, subtree: true });
    window.__sceSampler = Object.freeze({ setPoint, setLoop, get loop() { return { a: loop.a, b: loop.b, on: loop.on }; }, save, list: () => store.list(trackUrl()) });
})();
