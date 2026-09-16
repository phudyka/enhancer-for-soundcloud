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

    const fmt = (r) => `${r.toFixed(2)}×`;

    function apply(el = media) {
        if (!el) return;
        el.playbackRate = cfg.rate;
        el.defaultPlaybackRate = cfg.rate;
        if ('preservesPitch' in el) el.preservesPitch = cfg.preservePitch;
        if (btn) btn.querySelector(`.${NS}-label`).textContent = fmt(cfg.rate);
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
    const CSS = `
        .${NS}-btn { min-width: 44px !important; padding: 0 6px !important; font-size: 11px !important; font-weight: 700 !important;
                     font-variant-numeric: tabular-nums; letter-spacing: 0; text-transform: none !important; }
        .${NS}-btn.m-active { color: #f50 !important; }
        .${NS}-panel { position: fixed; bottom: 56px; width: 240px; padding: 12px 14px; border-radius: 8px;
                       background: #1f1f1f; color: #fff; box-shadow: 0 8px 28px rgba(0,0,0,.5); border: 1px solid rgba(255,255,255,.08);
                       font-size: 12px; z-index: 99999; }
        .${NS}-panel h4 { margin: 0 0 8px; font-size: 12px; font-weight: 600; display: flex; justify-content: space-between; }
        .${NS}-panel input[type=range] { width: 100%; accent-color: #f50; }
        .${NS}-presets { display: flex; gap: 6px; margin: 8px 0; }
        .${NS}-presets button { flex: 1; padding: 4px 0; border-radius: 4px; border: 1px solid rgba(255,255,255,.15); background: transparent; color: #ddd; cursor: pointer; font-size: 11px; }
        .${NS}-presets button.m-on { background: #f50; border-color: #f50; color: #fff; }
        .${NS}-panel label { display: flex; align-items: center; gap: 6px; margin-top: 6px; cursor: pointer; color: #ccc; }
    `;
    function injectStyles() {
        if (document.getElementById(`${NS}-styles`)) return;
        const s = document.createElement('style'); s.id = `${NS}-styles`; s.textContent = CSS; document.head.appendChild(s);
    }

    function buildPanel() {
        const p = document.createElement('div');
        p.className = `${NS}-panel`;
        p.innerHTML = `
            <h4><span>Vitesse de lecture</span><span class="${NS}-val">${fmt(cfg.rate)}</span></h4>
            <input type="range" min="${MIN}" max="${MAX}" step="${STEP}" value="${cfg.rate}">
            <div class="${NS}-presets">${PRESETS.map((r) => `<button type="button" data-rate="${r}">${r}×</button>`).join('')}</div>
            <label><input type="checkbox" class="${NS}-pitch" ${cfg.preservePitch ? 'checked' : ''}> Conserver la hauteur (pas d'effet chipmunk)</label>`;
        p.querySelector('input[type=range]').addEventListener('input', (e) => setRate(parseFloat(e.target.value)));
        p.querySelectorAll('[data-rate]').forEach((b) => b.addEventListener('click', () => setRate(parseFloat(b.dataset.rate))));
        p.querySelector(`.${NS}-pitch`).addEventListener('change', (e) => { cfg = { ...cfg, preservePitch: e.target.checked }; store.set(cfg); apply(); });
        return p;
    }

    function syncPanel() {
        panel.querySelector(`.${NS}-val`).textContent = fmt(cfg.rate);
        panel.querySelector('input[type=range]').value = cfg.rate;
        panel.querySelectorAll('[data-rate]').forEach((b) => b.classList.toggle('m-on', Math.abs(parseFloat(b.dataset.rate) - cfg.rate) < 1e-6));
        btn?.classList.toggle('m-active', Math.abs(cfg.rate - 1) > 1e-6);
    }

    function togglePanel() {
        if (panel) { panel.remove(); panel = null; return; }
        panel = buildPanel();
        document.body.appendChild(panel);
        const r = btn.getBoundingClientRect();
        panel.style.left = `${Math.max(8, Math.min(window.innerWidth - 256, r.left + r.width / 2 - 120))}px`;
        syncPanel();
        const close = (e) => { if (panel && !panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) { panel.remove(); panel = null; document.removeEventListener('mousedown', close, true); } };
        document.addEventListener('mousedown', close, true);
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
        btn.className = `${NS}-btn sc-button sc-button-secondary sc-button-small sc-mr-1x`;
        btn.title = 'Vitesse de lecture';
        btn.innerHTML = `<span class="${NS}-label">${fmt(cfg.rate)}</span>`;
        btn.addEventListener('click', togglePanel);
        volume.parentElement.insertBefore(btn, volume);
        btn.classList.toggle('m-active', Math.abs(cfg.rate - 1) > 1e-6);
    }

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
