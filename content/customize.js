/*
 * Enhancer for SoundCloud™ — personnalisation libre (monde principal)
 *
 * Mode « masquer à la souris » : activé depuis les réglages (customizeMode),
 * il surligne l'élément survolé et un clic le masque, de façon persistante.
 * Chaque élément masqué est décrit par une entrée de settings.hiddenCustom :
 *   class:<classe>        module SoundCloud reconnu par sa classe (…Module)
 *   heading:<titre>       module reconnu par son titre normalisé
 *   text:<css>|<texte>    élément d'un groupe (onglet, lien) reconnu par son texte
 *   sel:<css>             sélecteur stable (tag + classes) pour le reste
 * appearance.js applique ces entrées ; la page renvoie les modifications au
 * pont ({ sce: 'settings-patch' }) qui les écrit dans chrome.storage.sync.
 */
(() => {
    'use strict';
    try { if (JSON.parse(localStorage.getItem('scsp:settings') || '{}').extensionDisabled === true) return; } catch {}
    const NS = 'sce-pick';
    const T = {
        fr: { done: 'Terminer', hidden: 'Élément masqué', undo: 'Annuler' },
        en: { done: 'Stop hiding', hidden: 'Element hidden', undo: 'Undo' },
    };
    const L = T[(document.documentElement.lang || 'en').slice(0, 2)] || T.en;
    const readSettings = () => { try { return JSON.parse(localStorage.getItem('scsp:settings') || '{}'); } catch { return {}; } };
    const patch = (values) => {
        try {
            localStorage.setItem('scsp:settings', JSON.stringify({ ...readSettings(), ...values }));
            window.dispatchEvent(new Event('sce:settings-change'));
        } catch {}
        window.postMessage({ sce: 'settings-patch', patch: values }, location.origin);
    };

    // Conteneurs préférés : on masque le bloc entier plutôt qu'un fragment
    const CONTAINERS = '.sidebarModule, .mixedSelectionModule, .header__navMenuItem, .header__userNavItem, .headerMenu__link, .header__upsellWrapper, .soundList__item, .searchList__item, .trackList__item, .listenEngagement, .commentsList, .sidebarFooter, .l-footer, .footer__localeSelector, .l-listen-hero, .profileHeader, .quotaMeter, .sidebarHeader, section, article, li, [class*="Module"], [class*="module"]';
    const IGNORED_CLASS = /^(sc-|g-|m-|l-|selected|active|hover|focus|playing|expanded|open|visible|hidden|first|last|current|disabled|sce-|scsp-|is-|has-|js-)|\d/;
    const GENERIC_MODULE = new Set(['sidebarModule', 'mixedSelectionModule', 'lazyLoadingList']);
    const stableClasses = (el) => [...(el.classList || [])].filter((c) => !IGNORED_CLASS.test(c)).slice(0, 3);
    const HEADING_SEL = 'h1, h2, h3, h4, h5, h6, [class*="__title"], [class*="Title"]';
    const headingKey = (text) => (text || '').toLocaleLowerCase().replace(/[\d.,'’«»"!?:()]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);

    /** Cible d'un survol : le conteneur le plus proche, sinon l'élément lui-même. */
    function target(el) {
        if (!el || el === document.body || el === document.documentElement) return null;
        if (el.closest(`.${NS}-done, .${NS}-box, .${NS}-toast`)) return null;
        // La barre de lecture doit toujours rester présente. Ses commandes restent sélectionnables une par une.
        if (el.closest('.playControls')) return el.closest('.playControls__volume, .playbackTimeline, .playbackSoundBadge, .shuffleControl, .repeatControl, .skipControl__next, .skipControl__prev, .playControl, .queueControl, .sce-pip-pin, .sce-audio-analysis-bar, .playControls button') || null;
        const container = el.closest(CONTAINERS);
        if (container && container !== document.body) return container;
        let cur = el;
        while (cur && cur !== document.body && !stableClasses(cur).length) cur = cur.parentElement;
        return cur && cur !== document.body ? cur : el;
    }
    /** Sélecteur tag + classes stables, précédé d'un ancêtre si besoin. */
    function selectorFor(el) {
        const count = (sel) => { try { return document.querySelectorAll(sel).length; } catch { return Infinity; } };
        const playerClasses = el.closest('.playControls') ? [...el.classList].filter((c) => /^sce-[\w-]+$/.test(c)).slice(0, 1) : [];
        let best = `${el.tagName.toLowerCase()}${[...stableClasses(el), ...playerClasses].map((c) => `.${CSS.escape(c)}`).join('')}`;
        let bestCount = count(best);
        if (!Number.isFinite(bestCount)) return null;
        let parent = el.parentElement;
        for (let depth = 0; depth < 3 && parent && parent !== document.body && bestCount > 1; depth++, parent = parent.parentElement) {
            const cls = stableClasses(parent);
            if (!cls.length) continue;
            const candidate = `${parent.tagName.toLowerCase()}.${cls.map((c) => CSS.escape(c)).join('.')} ${best}`;
            const c = count(candidate);
            if (c < bestCount) { best = candidate; bestCount = c; }    // un ancêtre n'est gardé que s'il précise la cible
        }
        return best;
    }
    /** Entrée persistée décrivant l'élément, et son libellé pour les réglages. */
    function entryFor(el) {
        const label = (el.textContent || '').replace(/\s+/g, ' ').trim();
        // Classes génériques partagées par toutes les sections : on préfère alors le titre
        const moduleClass = [...el.classList].find((c) => /Module$/.test(c) && !GENERIC_MODULE.has(c) && !IGNORED_CLASS.test(c));
        if (moduleClass) return { entry: `class:${moduleClass}`, label: label.slice(0, 40) || moduleClass };
        const heading = el.matches('.sidebarModule, .mixedSelectionModule, section') ? headingKey(el.querySelector(HEADING_SEL)?.textContent) : '';
        if (heading) return { entry: `heading:${heading}`, label: (el.querySelector(HEADING_SEL)?.textContent || '').trim().slice(0, 40) };
        const sel = selectorFor(el);
        if (!sel) return null;
        let count = 0; try { count = document.querySelectorAll(sel).length; } catch { return null; }
        if (count > 1 && label && label.length <= 40) return { entry: `text:${sel}|${label}`, label };
        return { entry: `sel:${sel}`, label: label.slice(0, 40) || sel };
    }

    // ── Mode personnalisation ──────────────────────────────────────
    let active = false, done = null, box = null, hover = null, toast = null;
    // Entrées de cette session : le retour des réglages (pont → sync → localStorage) est asynchrone,
    // deux clics rapprochés ne doivent pas s'écraser.
    const session = new Set();
    const currentList = () => [...new Set([...(Array.isArray(readSettings().hiddenCustom) ? readSettings().hiddenCustom.filter((x) => typeof x === 'string') : []), ...session])];
    const STYLE = `
        .${NS}-done { position: fixed; right: 18px; bottom: 76px; z-index: 2147483000; display: flex; align-items: center; gap: 9px; padding: 5px 13px 5px 5px; border: 0; border-radius: 24px; background: #242424; color: #fff; box-shadow: 0 2px 8px rgba(0,0,0,.4); font: 600 13px system-ui, sans-serif; cursor: pointer !important; }
        .${NS}-done:hover, .${NS}-done:focus-visible { background: #333; outline: 2px solid var(--sce-accent, #f50); outline-offset: 2px; }
        .${NS}-done-icon { width: 32px; height: 32px; display: grid; place-items: center; flex: none; border-radius: 50%; background: var(--sce-accent, #f50); color: var(--sce-on-accent, #fff); font: 700 20px system-ui, sans-serif; }
        body.${NS}-on .${NS}-done, body.${NS}-on .${NS}-done * { cursor: pointer !important; }
        .${NS}-box { position: fixed; z-index: 2147482999; pointer-events: none; border: 2px solid var(--sce-accent, #f50); background: rgba(255,85,0,.12); border-radius: 3px; transition: all .06s; }
        .${NS}-box::after { content: attr(data-label); position: absolute; left: -2px; top: -22px; padding: 2px 6px; background: var(--sce-accent, #f50); color: #fff; font: 600 11px system-ui, sans-serif; border-radius: 2px; white-space: nowrap; max-width: 320px; overflow: hidden; text-overflow: ellipsis; }
        .${NS}-toast { position: fixed; bottom: 64px; left: 50%; transform: translateX(-50%); z-index: 2147483000; padding: 8px 12px; background: #222; color: #fff; border: 1px solid #444; border-radius: 3px; font: 12px system-ui, sans-serif; display: flex; gap: 10px; align-items: center; }
        .${NS}-toast button { border: 0; background: transparent; color: var(--sce-accent, #f50); font: 600 12px system-ui, sans-serif; cursor: pointer; }
        body.${NS}-on, body.${NS}-on * { cursor: crosshair !important; }
    `;
    function ensureStyle() { if (!document.getElementById(`${NS}-styles`)) { const st = document.createElement('style'); st.id = `${NS}-styles`; st.textContent = STYLE; document.head.appendChild(st); } }
    function onMove(e) {
        const el = target(e.target);
        if (el === hover) return;
        hover = el;
        if (!el) { box.style.display = 'none'; return; }
        const r = el.getBoundingClientRect();
        Object.assign(box.style, { display: 'block', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
        box.dataset.label = entryFor(el)?.label || '';
    }
    function onClick(e) {
        const el = target(e.target);
        if (!el) return;
        e.preventDefault(); e.stopImmediatePropagation();
        const found = entryFor(el);
        if (!found) return;
        session.add(found.entry);
        patch({ hiddenCustom: currentList() });
        el.style.setProperty('display', 'none', 'important');          // effet immédiat, avant le retour des réglages
        box.style.display = 'none'; hover = null;
        showToast(found, el);
    }
    function showToast(found, hiddenElement) {
        toast?.remove();
        toast = document.createElement('div'); toast.className = `${NS}-toast`;
        toast.innerHTML = `<span>${L.hidden} : ${found.label.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))}</span><button type="button">${L.undo}</button>`;
        toast.querySelector('button').addEventListener('click', () => {
            session.delete(found.entry);
            patch({ hiddenCustom: currentList().filter((x) => x !== found.entry) });
            hiddenElement.style.removeProperty('display');
            toast.remove(); toast = null;
        });
        document.body.appendChild(toast);
        setTimeout(() => { if (toast?.isConnected) { toast.remove(); toast = null; } }, 6000);
    }
    const onKey = (e) => { if (e.key === 'Escape') stop(true); };
    function start() {
        if (active) return;
        active = true; ensureStyle();
        done = document.createElement('button'); done.type = 'button'; done.className = `${NS}-done`;
        done.innerHTML = `<span class="${NS}-done-icon" aria-hidden="true">✓</span><span>${L.done}</span>`;
        done.title = L.done; done.setAttribute('aria-label', L.done);
        done.addEventListener('click', () => stop(true));
        box = document.createElement('div'); box.className = `${NS}-box`; box.style.display = 'none';
        document.body.append(done, box); document.body.classList.add(`${NS}-on`);
        document.addEventListener('mousemove', onMove, true);
        document.addEventListener('click', onClick, true);
        document.addEventListener('keydown', onKey, true);
    }
    function stop(persist) {
        if (!active) return;
        active = false;
        done?.remove(); box?.remove(); toast?.remove(); done = box = toast = null; hover = null;
        document.body.classList.remove(`${NS}-on`);
        document.removeEventListener('mousemove', onMove, true);
        document.removeEventListener('click', onClick, true);
        document.removeEventListener('keydown', onKey, true);
        if (persist) patch({ customizeMode: false });
    }
    function sync() { if (readSettings().customizeMode) start(); else stop(false); }
    window.addEventListener('sce:settings-change', sync);
    window.addEventListener('storage', (e) => { if (e.key === 'scsp:settings') sync(); });
    window.__scePick = Object.freeze({ entryFor, target, selectorFor });
    sync();
})();
