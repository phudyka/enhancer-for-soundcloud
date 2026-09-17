/*
 * Enhancer for SoundCloud™ — boîtes de dialogue (monde principal)
 *
 * Remplace confirm() et prompt() du navigateur, qui figent la page et obligent
 * à choisir une playlist en tapant son numéro. Trois dialogues, même habillage
 * que nos panneaux (fond #222, couleur d'accent) :
 *
 *   __sceDialog.confirm(message, { ok, danger })  → Promise<boolean>
 *   __sceDialog.input(message, value)             → Promise<string | null>
 *   __sceDialog.pick(message, [{ label, detail }]) → Promise<index | -1>  (filtre au-delà de 8 entrées)
 *
 * Échap, clic hors de la boîte ou « Annuler » : false / null / -1. Un seul dialogue à la fois.
 */
(() => {
    'use strict';
    try { if (JSON.parse(localStorage.getItem('scsp:settings') || '{}').extensionDisabled === true) return; } catch {}
    const NS = 'sce-dialog';
    const L = (document.documentElement.lang || 'en').startsWith('fr')
        ? { ok: 'OK', cancel: 'Annuler', filter: 'Filtrer…', none: 'Aucun résultat' }
        : { ok: 'OK', cancel: 'Cancel', filter: 'Filter…', none: 'No results' };
    const FONT = 'Söhne, system-ui, -apple-system, "Segoe UI", Roboto, Ubuntu, Cantarell, "Noto Sans", sans-serif';
    const CSS = `
        .${NS}-overlay { position: fixed; inset: 0; z-index: 2147483600; display: grid; place-items: center; background: rgba(0,0,0,.55); font: 13px/1.45 ${FONT}; }
        .${NS} { width: min(420px, calc(100vw - 32px)); max-height: calc(100vh - 64px); display: flex; flex-direction: column; gap: 12px; padding: 18px; border-radius: 6px; background: #222; color: #eee; border: 1px solid #444; box-shadow: 0 12px 36px rgba(0,0,0,.6); }
        .${NS} p { margin: 0; white-space: pre-line; overflow-wrap: anywhere; }
        .${NS} input { width: 100%; box-sizing: border-box; height: 32px; padding: 0 10px; border-radius: 3px; border: 1px solid #555; background: #161616; color: #fff; font: inherit; }
        .${NS} input:focus { outline: 0; border-color: var(--sce-accent, #f50); }
        .${NS}-list { min-height: 0; overflow: auto; margin: 0; padding: 0; list-style: none; border: 1px solid #3a3a3a; border-radius: 3px; }
        .${NS}-list button { display: flex; justify-content: space-between; gap: 12px; width: 100%; padding: 8px 10px; border: 0; border-bottom: 1px solid #333; background: transparent; color: #ddd; cursor: pointer; text-align: left; font: inherit; }
        .${NS}-list li:last-child button { border-bottom: 0; }
        .${NS}-list button:hover, .${NS}-list button:focus-visible { background: #333; color: #fff; outline: 0; }
        .${NS}-list span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .${NS}-list small { flex: none; color: #888; font-variant-numeric: tabular-nums; }
        .${NS}-empty { padding: 14px; color: #888; text-align: center; }
        .${NS}-actions { display: flex; justify-content: flex-end; gap: 8px; }
        .${NS}-actions button { height: 30px; padding: 0 14px; border-radius: 3px; border: 1px solid #555; background: #333; color: #eee; cursor: pointer; font: 500 13px ${FONT}; }
        .${NS}-actions button:hover, .${NS}-actions button:focus-visible { background: #444; outline: 0; }
        .${NS}-actions .m-ok { border-color: transparent; background: var(--sce-accent, #f50); color: var(--sce-on-accent, #fff); }
        .${NS}-actions .m-ok.m-danger { background: #c0392b; color: #fff; }
        .${NS}-actions .m-ok:hover, .${NS}-actions .m-ok:focus-visible { filter: brightness(1.1); background: var(--sce-accent, #f50); }
        .${NS}-actions .m-ok.m-danger:hover, .${NS}-actions .m-ok.m-danger:focus-visible { background: #c0392b; }
    `;
    const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text != null) node.textContent = text; return node; };

    let closeCurrent = null;
    /** Ouvre une boîte ; `build(box, done)` la remplit et renvoie l'élément à mettre au point. `cancelled` : valeur d'annulation. */
    function show(message, cancelled, build) {
        closeCurrent?.();
        if (!document.getElementById(`${NS}-styles`)) { const style = el('style'); style.id = `${NS}-styles`; style.textContent = CSS; document.head.appendChild(style); }
        return new Promise((resolve) => {
            const previous = document.activeElement;
            const overlay = el('div', `${NS}-overlay`), box = el('div', NS);
            box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', message);
            box.appendChild(el('p', '', message));
            const done = (value) => {
                if (!overlay.isConnected) return;
                overlay.remove(); closeCurrent = null;
                try { previous?.focus?.(); } catch {}
                resolve(value);
            };
            closeCurrent = () => done(cancelled);
            const focus = build(box, done);
            overlay.appendChild(box);
            overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) done(cancelled); });
            // Les raccourcis de SoundCloud (espace, flèches, lettres) ne doivent pas agir pendant la saisie.
            overlay.addEventListener('keydown', (e) => {
                e.stopPropagation();
                if (e.key === 'Escape') { e.preventDefault(); done(cancelled); return; }
                if (e.key !== 'Tab') return;
                const items = [...box.querySelectorAll('input, button')];
                const first = items[0], last = items.at(-1);
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            });
            document.body.appendChild(overlay);
            focus?.focus?.(); focus?.select?.();
        });
    }
    function actions(box, done, cancelled, { ok = L.ok, danger = false, value = () => true } = {}) {
        const row = el('div', `${NS}-actions`);
        const cancel = el('button', '', L.cancel); cancel.type = 'button';
        const accept = el('button', `m-ok${danger ? ' m-danger' : ''}`, ok); accept.type = 'button';
        cancel.addEventListener('click', () => done(cancelled));
        accept.addEventListener('click', () => done(value()));
        row.append(cancel, accept); box.appendChild(row);
        return accept;
    }

    const confirmDialog = (message, options = {}) => show(message, false, (box, done) => actions(box, done, false, options));

    const inputDialog = (message, value = '') => show(message, null, (box, done) => {
        const input = el('input'); input.type = 'text'; input.maxLength = 100; input.value = value; input.setAttribute('aria-label', message);
        box.appendChild(input);
        actions(box, done, null, { value: () => input.value });
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done(input.value); } });
        return input;
    });

    const pickDialog = (message, items) => show(message, -1, (box, done) => {
        const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
        const list = el('ul', `${NS}-list`);
        const filter = items.length > 8 ? el('input') : null;
        const render = () => {
            const q = fold(filter?.value).trim();
            list.replaceChildren();
            items.forEach((item, index) => {
                if (q && !fold(item.label).includes(q)) return;
                const row = el('li'), button = el('button'); button.type = 'button';
                button.append(el('span', '', item.label), el('small', '', item.detail ?? ''));
                button.addEventListener('click', () => done(index));
                row.appendChild(button); list.appendChild(row);
            });
            if (!list.children.length) list.appendChild(el('li', `${NS}-empty`, L.none));
        };
        if (filter) {
            filter.type = 'search'; filter.placeholder = L.filter; filter.setAttribute('aria-label', L.filter);
            filter.addEventListener('input', render);
            filter.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); list.querySelector('button')?.click(); } });
            box.appendChild(filter);
        }
        render(); box.appendChild(list);
        const row = el('div', `${NS}-actions`), cancel = el('button', '', L.cancel); cancel.type = 'button';
        cancel.addEventListener('click', () => done(-1));
        row.appendChild(cancel); box.appendChild(row);
        return filter || list.querySelector('button') || cancel;
    });

    window.__sceDialog = Object.freeze({ confirm: confirmDialog, input: inputDialog, pick: pickDialog });
})();
