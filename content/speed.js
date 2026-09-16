/*
 * Enhancer for SoundCloud™ — vitesse de lecture (monde principal)
 *
 * Bouton « 1.00× » inséré à côté du volume dans la barre du lecteur. Un clic
 * ouvre un panneau : curseur 0,5× → 2,0×, préréglages, conservation de la
 * hauteur (preservesPitch). Le réglage est réappliqué à chaque nouveau titre
 * grâce au crochet média (window.__sceOnMedia) et persiste dans localStorage.
 */
(() => {
    'use strict';
    const NS = 'sce-speed';
    const KEY = 'sce:speed';
    const MIN = 0.5, MAX = 2.0, STEP = 0.05;
    const PRESETS = [0.75, 1, 1.25, 1.5, 2];

    const store = {
        get() { try { return { rate: 1, preservePitch: true, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch { return { rate: 1, preservePitch: true }; } },
        set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} },
    };
    let cfg = store.get();
    let media = null;
    let btn = null, panel = null;

    // Libellé court : 1× · 1.5× · 1.25× (pas de décimales inutiles)
    const fmt = (r) => `${parseFloat(r.toFixed(2))}×`;

    function apply(el = media) {
        if (!el) return;
        el.playbackRate = cfg.rate;
        el.defaultPlaybackRate = cfg.rate;
        if ('preservesPitch' in el) el.preservesPitch = cfg.preservePitch;
        updateTitle();
    }

    function updateTitle() {
        if (!btn) return;
        btn.title = `Vitesse : ${fmt(cfg.rate)}  (Maj+, / Maj+. / Maj+0)`;
        btn.classList.toggle('m-active', Math.abs(cfg.rate - 1) > 1e-6);
    }

    function setRate(rate) {
        cfg = { ...cfg, rate: Math.min(MAX, Math.max(MIN, Math.round(rate / STEP) * STEP)) };
        store.set(cfg);
        apply();
        if (panel) syncPanel();
    }

    // Crochet média : réapplique la vitesse à chaque nouvel <audio>
    if (typeof window.__sceOnMedia === 'function') {
        window.__sceOnMedia((el) => { media = el; apply(el); });
    }

    // ── UI ────────────────────────────────────────────────────────
    // Design system SoundCloud : contrôle discret, même gris que les icônes du lecteur,
    // orange #f50 uniquement quand la vitesse n'est pas 1×. Panneau dans le style
    // du popover de volume (fond #333, angles 2px, pas d'ombre lourde).
    const CSS = `
        /* Même moule que .shuffleControl / .volume__button : 24×48, icône 16 px blanche */
        .${NS}-btn { width: 24px; height: 48px; padding: 16px 4px; border: 0; background: transparent; color: #fff; cursor: pointer; display: block; }
        .${NS}-btn div { width: 16px; height: 16px; }
        .${NS}-btn svg { width: 16px; height: 16px; display: block; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
        .${NS}-btn:hover, .${NS}-btn.m-open { color: #fff; }
        .${NS}-btn.m-active { color: #f50; }
        .${NS}-btn.m-active .${NS}-needle { stroke-width: 1.75; }
        .${NS}-panel { position: fixed; bottom: 52px; width: 200px; padding: 10px 12px 8px; border-radius: 2px;
                       background: #333; color: #ccc; box-shadow: 0 2px 8px rgba(0,0,0,.4); font-size: 12px; z-index: 99999; }
        .${NS}-panel::after { content: ''; position: absolute; left: 50%; bottom: -5px; width: 10px; height: 10px; background: #333; transform: translateX(-50%) rotate(45deg); }
        .${NS}-panel h4 { margin: 0 0 8px; font-size: 12px; font-weight: 400; color: #999; display: flex; justify-content: space-between; }
        .${NS}-panel h4 .${NS}-val { color: #fff; font-weight: 700; font-variant-numeric: tabular-nums; }
        .${NS}-panel input[type=range] { width: 100%; height: 2px; margin: 6px 0 10px; accent-color: #f50; cursor: pointer; }
        .${NS}-presets { display: flex; gap: 4px; }
        .${NS}-presets button { flex: 1; height: 24px; border-radius: 2px; border: 0; background: #444; color: #ccc; cursor: pointer; font-size: 11px; font-variant-numeric: tabular-nums; }
        .${NS}-presets button:hover { background: #555; color: #fff; }
        .${NS}-presets button.m-on { background: #f50; color: #fff; }
        .${NS}-panel label { display: flex; align-items: center; gap: 6px; margin-top: 10px; cursor: pointer; color: #999; font-size: 11px; }
        .${NS}-panel label input { accent-color: #f50; margin: 0; }
    `;
    function injectStyles() {
        if (document.getElementById(`${NS}-styles`)) return;
        const s = document.createElement('style'); s.id = `${NS}-styles`; s.textContent = CSS; document.head.appendChild(s);
    }

    function buildPanel() {
        const p = document.createElement('div');
        p.className = `${NS}-panel`;
        p.innerHTML = `
            <h4><span>Vitesse</span><span class="${NS}-val">${fmt(cfg.rate)}</span></h4>
            <input type="range" min="${MIN}" max="${MAX}" step="${STEP}" value="${cfg.rate}">
            <div class="${NS}-presets">${PRESETS.map((r) => `<button type="button" data-rate="${r}">${r}×</button>`).join('')}</div>
            <label><input type="checkbox" class="${NS}-pitch" ${cfg.preservePitch ? 'checked' : ''}> Conserver la hauteur</label>`;
        p.querySelector('input[type=range]').addEventListener('input', (e) => setRate(parseFloat(e.target.value)));
        p.querySelectorAll('[data-rate]').forEach((b) => b.addEventListener('click', () => setRate(parseFloat(b.dataset.rate))));
        p.querySelector(`.${NS}-pitch`).addEventListener('change', (e) => { cfg = { ...cfg, preservePitch: e.target.checked }; store.set(cfg); apply(); });
        return p;
    }

    function syncPanel() {
        panel.querySelector(`.${NS}-val`).textContent = fmt(cfg.rate);
        panel.querySelector('input[type=range]').value = cfg.rate;
        panel.querySelectorAll('[data-rate]').forEach((b) => b.classList.toggle('m-on', Math.abs(parseFloat(b.dataset.rate) - cfg.rate) < 1e-6));
        updateTitle();
    }

    function closePanel() { panel?.remove(); panel = null; btn?.classList.remove('m-open'); }
    function togglePanel() {
        if (panel) { closePanel(); return; }
        panel = buildPanel();
        document.body.appendChild(panel);
        btn.classList.add('m-open');
        const r = btn.getBoundingClientRect();
        panel.style.left = `${Math.max(8, Math.min(window.innerWidth - 216, r.left + r.width / 2 - 100))}px`;
        syncPanel();
        const close = (e) => { if (panel && !panel.contains(e.target) && !btn.contains(e.target)) { closePanel(); document.removeEventListener('mousedown', close, true); } };
        document.addEventListener('mousedown', close, true);
        document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { closePanel(); document.removeEventListener('keydown', esc); } });
    }

    const enabled = () => { try { return JSON.parse(localStorage.getItem('scsp:settings') || '{}').speedControl !== false; } catch { return true; } };

    function mount() {
        if (btn?.isConnected) return;
        if (!enabled()) { btn?.remove(); btn = null; return; }
        const volume = document.querySelector('.playControls__volume');
        if (!volume) return;
        injectStyles();
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `${NS}-btn sc-mr-1x`;
        btn.setAttribute('aria-label', 'Vitesse de lecture');
        // Jauge : arc + aiguille, tracé à 1,5 px comme les glyphes SoundCloud
        btn.innerHTML = `<div><svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M2.75 11.25a5.25 5.25 0 1 1 10.5 0"/>
            <path class="${NS}-needle" d="M8 11.25l2.6-3.6"/>
            <circle cx="8" cy="11.25" r=".9" fill="currentColor" stroke="none"/>
        </svg></div>`;
        updateTitle();
        btn.addEventListener('click', togglePanel);
        volume.parentElement.insertBefore(btn, volume);
    }

    // Commande externe (popup / lecteur épinglable) : window.dispatchEvent(new CustomEvent('sce:speed', { detail: { rate } }))
    window.addEventListener('sce:speed', (e) => { const r = Number(e.detail?.rate); if (Number.isFinite(r)) setRate(r); });

    // Raccourcis : Maj+, / Maj+. (± 0,25×), Maj+0 = 1×
    document.addEventListener('keydown', (e) => {
        const el = document.activeElement;
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
        if (!e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
        if (e.code === 'Period')  { e.preventDefault(); setRate(cfg.rate + 0.25); }
        if (e.code === 'Comma')   { e.preventDefault(); setRate(cfg.rate - 0.25); }
        if (e.code === 'Digit0')  { e.preventDefault(); setRate(1); }
    });

    new MutationObserver(() => { if (!btn?.isConnected) mount(); }).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('storage', (e) => { if (e.key === 'scsp:settings') { if (!enabled()) { btn?.remove(); btn = null; } else mount(); } });
    mount();
})();
