/* Download entry points for the current track and visible SoundCloud items (main world). */
(() => {
    'use strict';
    try { if (JSON.parse(localStorage.getItem('scsp:settings') || '{}').extensionDisabled === true) return; } catch {}
    const fr = (document.documentElement.lang || navigator.language || '').startsWith('fr');
    const label = fr ? 'Télécharger' : 'Download';
    const collectionPath = () => /^\/[^/]+\/(?:sets|albums)\/[^/]+/.test(location.pathname);
    const trackUrl = () => document.querySelector('.playbackSoundBadge__titleLink')?.href;
    const icon = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M7.25 1.5h1.5v8.19l2.22-2.22 1.06 1.06L8 12.56 3.97 8.53l1.06-1.06 2.22 2.22V1.5ZM2 12h1.5v1.5h9V12H14v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-2Z" fill="currentColor"/></svg>';
    const open = (url) => {
        if (url) window.postMessage({ sce: 'download-open', url }, location.origin);
    };

    window.addEventListener('message', async (event) => {
        if (event.source !== window || event.data?.sce !== 'command' || event.data.command !== 'download-client-id') return;
        window.postMessage({ sce: 'download-client-id', clientId: await window.__sceShared.clientId(!!event.data.value?.refresh) }, location.origin);
    });

    function button(kind, url) {
        const element = document.createElement('button');
        element.type = 'button';
        element.className = `sce-download ${kind} sc-button sc-button-secondary sc-button-small sc-button-icon${kind.includes('sce-download-action') ? ' sc-button-responsive' : ''}`;
        element.title = label;
        element.setAttribute('aria-label', label);
        element.innerHTML = `<div>${icon}</div>`;
        element.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            open(url());
        });
        return element;
    }
    function itemUrl(item, selectors) {
        const href = item.querySelector(selectors)?.href;
        return href && new URL(href).origin === location.origin ? href : null;
    }
    function mount() {
        // Remove the old button if this script was updated while the page was open.
        document.querySelector('.playControls__elements > .sce-download-player')?.remove();
        const actions = document.querySelector('.playbackSoundBadge__actions');
        if (actions && !actions.querySelector('.sce-download-player')) {
            const download = button('sce-download-player sc-mr-1x', trackUrl);
            const queue = actions.querySelector('.playbackSoundBadge__showQueue');
            if (queue) queue.before(download);
            else actions.append(download);
        }
        // Conteneurs déjà équipés marqués (data-sce-dl) : exclus par le sélecteur, pas réexaminés à chaque rafale
        document.querySelectorAll('.soundActions:not([data-sce-dl])').forEach((actions) => {
            if (actions.querySelector('.sce-download')) { actions.dataset.sceDl = ''; return; }
            const sound = actions.closest('.sound');
            const url = sound
                ? () => itemUrl(sound, '.soundTitle__title a, .soundTitle__titleLink')
                : () => /^\/[^/]+\/(?:sets\/[^/]+|albums\/[^/]+|[^/]+)\/?$/.test(location.pathname) ? location.href : null;
            if (!sound && !collectionPath() && !document.querySelector('.listenDetails')) return;
            (actions.querySelector('.sc-button-group') || actions).append(button('sce-download-action', url));
            actions.dataset.sceDl = '';
        });
        document.querySelectorAll('.audibleTile:not([data-sce-dl])').forEach((tile) => {
            const actions = tile.querySelector('.playableTile__actions .playableTile__actionWrapper');
            if (!actions) return;
            if (!actions.querySelector('.sce-download')) actions.append(button('sce-download-tile playableTile__actionButton', () => itemUrl(tile, '.playableTile__artworkLink')));
            tile.dataset.sceDl = '';
        });
        document.querySelectorAll('.trackItem:not([data-sce-dl])').forEach((row) => {
            if (row.querySelector('.sce-download') || !row.classList.contains('m-playable') || !itemUrl(row, '.trackItem__trackTitle')) return;
            row.append(button('sce-download-row', () => itemUrl(row, '.trackItem__trackTitle')));
            row.dataset.sceDl = '';
        });
        document.querySelectorAll('.queueItemView:not([data-sce-dl])').forEach((row) => {
            if (row.querySelector('.sce-download') || !itemUrl(row, '.queueItemView__title a, a.queueItemView__title')) return;
            row.append(button('sce-download-row', () => itemUrl(row, '.queueItemView__title a, a.queueItemView__title')));
            row.dataset.sceDl = '';
        });
    }
    const style = document.createElement('style');
    style.textContent = `
        .sce-download { color: #999 !important; cursor: pointer; }
        .sce-download svg { display: block; width: 16px; height: 16px; }
        .sce-download:hover, .sce-download:focus-visible { color: var(--sce-accent, #f50) !important; }
        .sc-button-group .sce-download-action { color: #fff !important; margin: 0 16px 0 0; }
        .trackItem, .queueItemView { position: relative; }
        .sce-download-row { position: absolute; right: 4px; top: 50%; transform: translateY(-50%); z-index: 2; opacity: 0; background: var(--background-surface, #222); }
        .trackItem:hover > .sce-download-row, .trackItem:focus-within > .sce-download-row,
        .queueItemView:hover > .sce-download-row, .queueItemView:focus-within > .sce-download-row { opacity: 1; }
    `;
    (document.head || document.documentElement).append(style);
    let timer;
    (window.__sceShared?.onDom || ((fn) => new MutationObserver(fn).observe(document.body, { childList: true, subtree: true })))(() => { clearTimeout(timer); timer = setTimeout(mount, 120); });
    mount();
})();
