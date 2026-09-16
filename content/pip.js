/*
 * Enhancer for SoundCloud™ — lecteur épinglable (monde principal)
 *
 * Fenêtre Document Picture-in-Picture (Chromium 116+) : toujours au premier
 * plan, même origine que la page, donc pilotée directement d'ici sans
 * messagerie. C'est une télécommande : le son reste dans l'onglet SoundCloud.
 *
 * Design system SoundCloud : fond du lecteur (#1a1a1a), texte #fff / #999,
 * accent #ff5500, barre de progression 2 px, icônes monochromes 16 px sans
 * fond, police système. Aucune dépendance.
 *
 * Contenu : pochette · titre · artiste · progression + temps · contrôles
 * (précédent, lecture, suivant, Shuffle+, répéter). Un bouton « épingler » est
 * ajouté dans la barre du lecteur, à gauche du volume.
 */
(() => {
    'use strict';
    const NS = 'sce-pip';
    const SEL = {
        play:     '.playControl',
        next:     '.skipControl__next',
        prev:     '.skipControl__prev',
        repeat:   '.repeatControl',
        title:    '.playbackSoundBadge__titleLink',
        artist:   '.playbackSoundBadge__lightLink',
        artwork:  '.playbackSoundBadge__avatar span[style*="background-image"], .playbackSoundBadge__avatar .image__full',
        timeline: '.playbackTimeline__progressWrapper',
        volume:   '.playControls__volume',
        badge:    '.playControls__soundBadge',
    };
    const $ = (s, r = document) => r.querySelector(s);
    const supported = 'documentPictureInPicture' in window;

    // ── Icônes (16×16, currentColor), tracées dans l'esprit des glyphes SoundCloud
    const I = {
        prev:    '<svg viewBox="0 0 16 16"><path d="M3 2h2v12H3zM13 2v12L5.5 8z"/></svg>',
        next:    '<svg viewBox="0 0 16 16"><path d="M11 2h2v12h-2zM3 2v12l7.5-6z"/></svg>',
        play:    '<svg viewBox="0 0 16 16"><path d="M4 2v12l9-6z"/></svg>',
        pause:   '<svg viewBox="0 0 16 16"><path d="M3.5 2h3v12h-3zM9.5 2h3v12h-3z"/></svg>',
        shuffle: '<svg viewBox="0 0 16 16"><path d="M11.5 1.5l3 3-3 3V5.75h-1.2c-.5 0-.97.25-1.25.66L7.9 8l-1.15-1.6.6-.84A3 3 0 0 1 10.3 4.25h1.2V1.5zM1 4.25h2.3a3 3 0 0 1 2.45 1.27l3.3 4.62c.28.41.75.66 1.25.66h1.2V8.5l3 3-3 3v-2.25h-1.2a3 3 0 0 1-2.45-1.27L4.55 6.36a1.5 1.5 0 0 0-1.25-.61H1v-1.5zM1 10.25h2.3c.5 0 .97-.25 1.25-.66l.6-.84L6.3 10.35l-.55.77A3 3 0 0 1 3.3 12.4H1v-1.5z"/></svg>',
        repeat:  '<svg viewBox="0 0 16 16"><path d="M4 4.5h7V2.5l3 3-3 3v-2H5.5v3H4zM12 11.5H5v2l-3-3 3-3v2h5.5v-3H12z"/></svg>',
        // Glyphe Picture-in-Picture : cadre 1,5 px + vignette pleine, comme les icônes SoundCloud
        pin:     '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.75" y="3.25" width="12.5" height="9.5" rx="1.25" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="8" y="7.25" width="5" height="3.75" rx=".5" fill="currentColor"/></svg>',
    };

    const fmtTime = (s) => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

    function artworkUrl() {
        const el = $(SEL.artwork);
        const m = el && (el.style?.backgroundImage || '').match(/url\("?(.*?)"?\)/);
        return m ? m[1].replace(/-t\d+x\d+\./, '-t500x500.') : (el?.src || null);
    }
    function readState() {
        const media = window.__sceMedia;
        const tl = $(SEL.timeline);
        const rep = $(SEL.repeat);
        return {
            playing:  !!$(SEL.play)?.classList.contains('playing'),
            title:    $(SEL.title)?.title || $(SEL.title)?.textContent?.trim() || '—',
            artist:   $(SEL.artist)?.textContent?.trim() || '',
            artwork:  artworkUrl(),
            position: media && Number.isFinite(media.currentTime) ? media.currentTime : Number(tl?.getAttribute('aria-valuenow') || 0),
            duration: media && Number.isFinite(media.duration)    ? media.duration    : Number(tl?.getAttribute('aria-valuemax') || 0),
            repeat:   rep?.classList.contains('m-one') ? 'one' : rep?.classList.contains('m-all') ? 'all' : 'off',
        };
    }

    const CSS = `
        :root { color-scheme: dark; }
        * { box-sizing: border-box; }
        html, body { margin: 0; height: 100%; background: #1a1a1a; color: #fff; font: 13px/1.4 -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; user-select: none; }
        .${NS} { display: flex; flex-direction: column; height: 100%; padding: 12px 12px 10px; gap: 10px; }
        .${NS}-art { position: relative; flex: 1 1 auto; min-height: 96px; border-radius: 2px; background: #333 center/cover no-repeat; }
        .${NS}-art::after { content: ''; position: absolute; inset: 0; border-radius: 2px; box-shadow: inset 0 0 0 1px rgba(255,255,255,.06); }
        .${NS}-meta { min-width: 0; }
        .${NS}-title { font-weight: 600; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .${NS}-artist { color: #999; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .${NS}-title:hover { text-decoration: underline; cursor: pointer; }
        .${NS}-bar { position: relative; height: 12px; cursor: pointer; }
        .${NS}-bar::before { content: ''; position: absolute; left: 0; right: 0; top: 5px; height: 2px; background: #444; }
        .${NS}-fill { position: absolute; left: 0; top: 5px; height: 2px; background: #f50; width: 0; }
        .${NS}-knob { position: absolute; top: 2px; width: 8px; height: 8px; margin-left: -4px; border-radius: 50%; background: #f50; opacity: 0; transition: opacity .12s; }
        .${NS}-bar:hover .${NS}-knob { opacity: 1; }
        .${NS}-times { display: flex; justify-content: space-between; color: #999; font-size: 11px; font-variant-numeric: tabular-nums; margin-top: -6px; }
        .${NS}-times .cur { color: #f50; }
        .${NS}-ctl { display: flex; align-items: center; justify-content: center; gap: 4px; }
        .${NS}-ctl button { width: 36px; height: 36px; border: 0; border-radius: 50%; background: transparent; color: #ccc; cursor: pointer; display: grid; place-items: center; padding: 0; position: relative; }
        .${NS}-ctl button svg { width: 16px; height: 16px; fill: currentColor; display: block; }
        .${NS}-ctl button:hover { color: #fff; background: rgba(255,255,255,.06); }
        .${NS}-ctl button.m-play { width: 40px; height: 40px; background: #fff; color: #111; margin: 0 6px; }
        .${NS}-ctl button.m-play:hover { background: #f2f2f2; color: #111; }
        .${NS}-ctl button.m-on { color: #f50; }
        .${NS}-ctl button.m-on::after { content: ''; position: absolute; bottom: 5px; left: 50%; width: 3px; height: 3px; margin-left: -1.5px; border-radius: 50%; background: #f50; }
        .${NS}-ctl button.m-busy svg { animation: ${NS}-spin .9s linear infinite; }
        .${NS}-ctl button .n { position: absolute; top: 4px; right: 4px; font-size: 8px; font-weight: 700; color: #f50; }
        @keyframes ${NS}-spin { to { transform: rotate(360deg); } }
    `;

    let pipWin = null, ui = null, media = null, off = [];

    function render() {
        if (!pipWin || pipWin.closed) return;
        const s = readState();
        ui.art.style.backgroundImage = s.artwork ? `url("${s.artwork}")` : '';
        ui.title.textContent = s.title;
        ui.artist.textContent = s.artist;
        ui.play.innerHTML = s.playing ? I.pause : I.play;
        ui.play.title = s.playing ? 'Pause' : 'Lecture';
        const pct = s.duration ? Math.min(100, (s.position / s.duration) * 100) : 0;
        ui.fill.style.width = `${pct}%`;
        ui.knob.style.left = `${pct}%`;
        ui.cur.textContent = fmtTime(s.position);
        ui.dur.textContent = fmtTime(s.duration);
        ui.repeat.classList.toggle('m-on', s.repeat !== 'off');
        ui.repeat.querySelector('.n').textContent = s.repeat === 'one' ? '1' : '';
        pipWin.document.title = s.title;
    }

    function bindMedia(el) {
        for (const fn of off.splice(0)) fn();
        media = el;
        if (!el) return;
        const on = (ev, fn) => { el.addEventListener(ev, fn); off.push(() => el.removeEventListener(ev, fn)); };
        on('timeupdate', render); on('play', render); on('pause', render); on('durationchange', render);
    }

    function seek(e) {
        const r = ui.bar.getBoundingClientRect();
        const frac = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
        const s = readState();
        if (media && Number.isFinite(media.duration)) media.currentTime = frac * media.duration;
        else {
            // Repli : clic proportionnel sur la timeline native
            const tl = $(SEL.timeline); if (!tl) return;
            const tr = tl.getBoundingClientRect();
            tl.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: tr.left + frac * tr.width, clientY: tr.top + tr.height / 2 }));
        }
        void s;
        render();
    }

    async function open() {
        if (!supported) return;
        if (pipWin && !pipWin.closed) { pipWin.focus(); return; }
        pipWin = await documentPictureInPicture.requestWindow({ width: 300, height: 380 });
        const d = pipWin.document;
        d.documentElement.lang = document.documentElement.lang || 'fr';
        const style = d.createElement('style'); style.textContent = CSS; d.head.appendChild(style);
        const root = d.createElement('div'); root.className = NS;
        root.innerHTML = `
            <div class="${NS}-art"></div>
            <div class="${NS}-meta"><div class="${NS}-title"></div><div class="${NS}-artist"></div></div>
            <div class="${NS}-bar"><div class="${NS}-fill"></div><div class="${NS}-knob"></div></div>
            <div class="${NS}-times"><span class="cur">0:00</span><span class="dur">0:00</span></div>
            <div class="${NS}-ctl">
                <button data-a="shuffle" title="Shuffle+ de la lecture en cours">${I.shuffle}</button>
                <button data-a="prev" title="Précédent">${I.prev}</button>
                <button data-a="play" class="m-play">${I.play}</button>
                <button data-a="next" title="Suivant">${I.next}</button>
                <button data-a="repeat" title="Répéter">${I.repeat}<span class="n"></span></button>
            </div>`;
        d.body.appendChild(root);
        ui = {
            art: root.querySelector(`.${NS}-art`), title: root.querySelector(`.${NS}-title`), artist: root.querySelector(`.${NS}-artist`),
            bar: root.querySelector(`.${NS}-bar`), fill: root.querySelector(`.${NS}-fill`), knob: root.querySelector(`.${NS}-knob`),
            cur: root.querySelector('.cur'), dur: root.querySelector('.dur'),
            play: root.querySelector('[data-a=play]'), repeat: root.querySelector('[data-a=repeat]'), shuffle: root.querySelector('[data-a=shuffle]'),
        };
        root.addEventListener('click', (e) => {
            const b = e.target.closest('[data-a]'); if (!b) return;
            switch (b.dataset.a) {
                case 'play':   $(SEL.play)?.click(); break;
                case 'prev':   $(SEL.prev)?.click(); break;
                case 'next':   $(SEL.next)?.click(); break;
                case 'repeat': $(SEL.repeat)?.click(); break;
                case 'shuffle':
                    ui.shuffle.classList.add('m-busy');
                    window.postMessage({ scsp: 'command', command: 'shuffle', force: e.shiftKey }, location.origin);
                    setTimeout(() => ui.shuffle.classList.remove('m-busy'), 4000);
                    break;
            }
            setTimeout(render, 80);
        });
        ui.bar.addEventListener('click', seek);
        ui.title.addEventListener('click', () => { const h = $(SEL.title)?.getAttribute('href'); if (h) { window.focus(); location.assign(h); } });
        d.addEventListener('keydown', (e) => {
            if (e.code === 'Space') { e.preventDefault(); $(SEL.play)?.click(); }
            if (e.key === 'ArrowRight' && e.shiftKey) $(SEL.next)?.click();
            if (e.key === 'ArrowLeft' && e.shiftKey)  $(SEL.prev)?.click();
        });

        // Source de vérité : l'<audio> capté par media-hook + le badge du lecteur
        if (typeof window.__sceOnMedia === 'function') off.push(window.__sceOnMedia(bindMedia));
        else bindMedia(window.__sceMedia || null);
        const mo = new MutationObserver(render);
        const badge = $(SEL.badge) || document.body;
        mo.observe(badge, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'title', 'style', 'href'] });
        const playCtl = $(SEL.play); if (playCtl) mo.observe(playCtl, { attributes: true, attributeFilter: ['class'] });
        off.push(() => mo.disconnect());

        pipWin.addEventListener('pagehide', () => { for (const fn of off.splice(0)) fn(); pipWin = null; ui = null; pinBtn?.classList.remove('m-on'); });
        pinBtn?.classList.add('m-on');
        render();
    }

    // ── Bouton « épingler » dans la barre du lecteur
    let pinBtn = null;
    const BAR_CSS = `
        .${NS}-pin { width: 24px; height: 48px; padding: 16px 4px; border: 0; background: transparent; color: #fff; cursor: pointer; display: block; }
        .${NS}-pin div { width: 16px; height: 16px; }
        .${NS}-pin svg { width: 16px; height: 16px; display: block; }
        .${NS}-pin:hover { color: #fff; }
        .${NS}-pin.m-on { color: #f50; }
    `;
    function mount() {
        if (!supported || pinBtn?.isConnected) return;
        const volume = $(SEL.volume); if (!volume) return;
        if (!document.getElementById(`${NS}-bar-styles`)) { const st = document.createElement('style'); st.id = `${NS}-bar-styles`; st.textContent = BAR_CSS; document.head.appendChild(st); }
        pinBtn = document.createElement('button');
        pinBtn.type = 'button';
        pinBtn.className = `${NS}-pin sc-mr-1x`;
        pinBtn.title = 'Lecteur épinglable (toujours au premier plan)';
        pinBtn.setAttribute('aria-label', 'Lecteur épinglable');
        pinBtn.innerHTML = `<div>${I.pin}</div>`;
        pinBtn.addEventListener('click', () => open().catch((e) => console.warn('[SCE] PiP', e)));
        volume.parentElement.insertBefore(pinBtn, volume);
    }
    new MutationObserver(() => { if (!pinBtn?.isConnected) mount(); }).observe(document.body, { childList: true, subtree: true });
    mount();

    // Commande externe (popup / raccourci) : { sce: 'command', command: 'pip' }
    window.addEventListener('message', (e) => {
        if (e.source === window && e.data?.sce === 'command' && e.data.command === 'pip') open().catch(() => {});
    });
})();
