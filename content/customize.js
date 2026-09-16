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
    const NS = 'sce-pick';
    const T = {
        fr: { hint: 'Personnalisation : survolez un élément et cliquez pour le masquer. Réaffichez-le depuis les réglages.', done: 'Terminer', hidden: 'Élément masqué', undo: 'Annuler' },
        en: { hint: 'Customization: hover an element and click to hide it. Restore it from the settings.', done: 'Done', hidden: 'Element hidden', undo: 'Undo' },
    };
    const L = T[(document.documentElement.lang || 'en').slice(0, 2)] || T.en;
    const readSettings = () => { try { return JSON.parse(localStorage.getItem('scsp:settings') || '{}'); } catch { return {}; } };
    const patch = (values) => window.postMessage({ sce: 'settings-patch', patch: values }, location.origin);

    // Conteneurs préférés : on masque le bloc entier plutôt qu'un fragment
    const CONTAINERS = '.sidebarModule, .mixedSelectionModule, .header__navMenuItem, .header__userNavItem, .headerMenu__link, .header__upsellWrapper, .soundList__item, .searchList__item, .trackList__item, .listenEngagement, .commentsList, .sidebarFooter, .footer__localeSelector, .l-listen-hero, .profileHeader, .quotaMeter, .sidebarHeader, section, article, li, [class*="Module"], [class*="module"]';
    const IGNORED_CLASS = /^(sc-|g-|m-|l-|selected|active|hover|focus|playing|expanded|open|visible|hidden|first|last|current|disabled|sce-|scsp-|is-|has-|js-)|\d/;
    const GENERIC_MODULE = new Set(['sidebarModule', 'mixedSelectionModule', 'lazyLoadingList']);
    const stableClasses = (el) => [...(el.classList || [])].filter((c) => !IGNORED_CLASS.test(c)).slice(0, 3);
    const HEADING_SEL = 'h1, h2, h3, h4, h5, h6, [class*="__title"], [class*="Title"]';
    const headingKey = (text) => (text || '').toLocaleLowerCase().replace(/[\d.,'’«»"!?:()]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);

    /** Cible d'un survol : le conteneur le plus proche, sinon l'élément lui-même. */
    function target(el) {
        if (!el || el === document.body || el === document.documentElement) return null;
        if (el.closest(`.${NS}-bar, .${NS}-box, .${NS}-toast`)) return null;
        const container = el.closest(CONTAINERS);
        if (container && container !== document.body) return container;
        let cur = el;
        while (cur && cur !== document.body && !stableClasses(cur).length) cur = cur.parentElement;
        return cur && cur !== document.body ? cur : el;
    }
    /** Sélecteur tag + classes stables, précédé d'un ancêtre si besoin. */
    function selectorFor(el) {
        const count = (sel) => { try { return document.querySelectorAll(sel).length; } catch { return Infinity; } };
        let best = `${el.tagName.toLowerCase()}${stableClasses(el).map((c) => `.${CSS.escape(c)}`).join('')}`;
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
    let active = false, bar = null, box = null, hover = null, toast = null;
    // Entrées de cette session : le retour des réglages (pont → sync → localStorage) est asynchrone,
    // deux clics rapprochés ne doivent pas s'écraser.
    const session = new Set();
    const currentList = () => [...new Set([...(Array.isArray(readSettings().hiddenCustom) ? readSettings().hiddenCustom.filter((x) => typeof x === 'string') : []), ...session])];
    const STYLE = `
        .${NS}-bar { position: fixed; top: 0; left: 0; right: 0; z-index: 2147483000; display: flex; align-items: center; justify-content: center; gap: 14px; padding: 8px 16px; background: var(--sce-accent, #f50); color: #fff; font: 600 13px system-ui, sans-serif; box-shadow: 0 2px 8px rgba(0,0,0,.4); }
        .${NS}-bar button { height: 28px; padding: 0 12px; border: 0; border-radius: 3px; background: #fff; color: #111; font: 600 12px system-ui, sans-serif; cursor: pointer; }
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
        showToast(found);
    }
    function showToast(found) {
        toast?.remove();
        toast = document.createElement('div'); toast.className = `${NS}-toast`;
        toast.innerHTML = `<span>${L.hidden} : ${found.label.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))}</span><button type="button">${L.undo}</button>`;
        toast.querySelector('button').addEventListener('click', () => {
            session.delete(found.entry);
            patch({ hiddenCustom: currentList().filter((x) => x !== found.entry) });
            document.querySelectorAll('[style*="display: none"]').forEach((el) => { if (entryFor(el)?.entry === found.entry) el.style.removeProperty('display'); });
            toast.remove(); toast = null;
        });
        document.body.appendChild(toast);
        setTimeout(() => { if (toast?.isConnected) { toast.remove(); toast = null; } }, 6000);
    }
    const onKey = (e) => { if (e.key === 'Escape') stop(true); };
    function start() {
        if (active) return;
        active = true; ensureStyle();
        bar = document.createElement('div'); bar.className = `${NS}-bar`;
        bar.innerHTML = `<span>${L.hint}</span><button type="button">${L.done}</button>`;
        bar.querySelector('button').addEventListener('click', () => stop(true));
        box = document.createElement('div'); box.className = `${NS}-box`; box.style.display = 'none';
        document.body.append(bar, box); document.body.classList.add(`${NS}-on`);
        document.addEventListener('mousemove', onMove, true);
        document.addEventListener('click', onClick, true);
        document.addEventListener('keydown', onKey, true);
    }
    function stop(persist) {
        if (!active) return;
        active = false;
        bar?.remove(); box?.remove(); toast?.remove(); bar = box = toast = null; hover = null;
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
