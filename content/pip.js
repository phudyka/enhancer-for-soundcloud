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
    try { if (JSON.parse(localStorage.getItem('scsp:settings') || '{}').extensionDisabled === true) return; } catch {}
    const NS = 'sce-pip';
    const SEL = {
        play:     '.playControl',
        next:     '.skipControl__next',
        prev:     '.skipControl__prev',
        repeat:   '.repeatControl',
        title:    '.playbackSoundBadge__titleLink',
        timeline: '.playbackTimeline__progressWrapper',
        volume:   '.playControls__volume',
        badge:    '.playControls__soundBadge',
    };
    const $ = (s, r = document) => r.querySelector(s);
    const supported = 'documentPictureInPicture' in window;
    const T = {
        fr: { prev: 'Précédent', play: 'Lecture', pause: 'Pause', next: 'Suivant', repeat: 'Répéter', shuffle: 'Shuffle+ de la lecture en cours', audio: 'Vitesse et effets', speed: 'Vitesse', pitch: 'Conserver la hauteur', bass: 'Bass boost', reverb: 'Réverb', normal: 'Normal', slowed: 'Slowed + Reverb', nightcore: 'Nightcore',
              pin: 'Lecteur épinglable (toujours au premier plan)', pinShort: 'Lecteur épinglable', gesture: 'Le navigateur exige un clic dans la page : utilisez le bouton de la barre du lecteur' },
        en: { prev: 'Previous', play: 'Play', pause: 'Pause', next: 'Next', repeat: 'Repeat', shuffle: 'True shuffle of what is playing', audio: 'Speed and effects', speed: 'Speed', pitch: 'Preserve pitch', bass: 'Bass boost', reverb: 'Reverb', normal: 'Normal', slowed: 'Slowed + Reverb', nightcore: 'Nightcore',
              pin: 'Pinnable player (always on top)', pinShort: 'Pinnable player', gesture: 'The browser requires a click in the page: use the button in the player bar' },
    };
    const L = T[(document.documentElement.lang || 'en').slice(0, 2)] || T.en;

    // ── Icônes (16×16, currentColor), tracées dans l'esprit des glyphes SoundCloud
    const I = {
        prev:    '<svg viewBox="0 0 16 16"><path d="M3 2h2v12H3zM13 2v12L5.5 8z"/></svg>',
        next:    '<svg viewBox="0 0 16 16"><path d="M11 2h2v12h-2zM3 2v12l7.5-6z"/></svg>',
        ...window.__sceShared.icons,
        shuffle: '<svg viewBox="0 0 16 16"><path d="M11.5 1.5l3 3-3 3V5.75h-1.2c-.5 0-.97.25-1.25.66L7.9 8l-1.15-1.6.6-.84A3 3 0 0 1 10.3 4.25h1.2V1.5zM1 4.25h2.3a3 3 0 0 1 2.45 1.27l3.3 4.62c.28.41.75.66 1.25.66h1.2V8.5l3 3-3 3v-2.25h-1.2a3 3 0 0 1-2.45-1.27L4.55 6.36a1.5 1.5 0 0 0-1.25-.61H1v-1.5zM1 10.25h2.3c.5 0 .97-.25 1.25-.66l.6-.84L6.3 10.35l-.55.77A3 3 0 0 1 3.3 12.4H1v-1.5z"/></svg>',
        repeat:  '<svg viewBox="0 0 16 16"><path d="M4 4.5h7V2.5l3 3-3 3v-2H5.5v3H4zM12 11.5H5v2l-3-3 3-3v2h5.5v-3H12z"/></svg>',
        // Glyphe Picture-in-Picture : cadre 1,5 px + vignette pleine, comme les icônes SoundCloud
        pin:     '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.75" y="3.25" width="12.5" height="9.5" rx="1.25" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="8" y="7.25" width="5" height="3.75" rx=".5" fill="currentColor"/></svg>',
    };

    const fmtTime = window.__sceShared.formatTime;

    function readState() {
        const state = window.__scePlayerState();
        return {
            ...state,
            title: state.title || '—',
            artist: state.artist || '',
            position: Number.isFinite(state.position) ? state.position : Number($(SEL.timeline)?.getAttribute('aria-valuenow') || 0),
            duration: Number.isFinite(state.duration) ? state.duration : Number($(SEL.timeline)?.getAttribute('aria-valuemax') || 0),
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
        .${NS}-fill { position: absolute; left: 0; top: 5px; height: 2px; background: var(--sce-accent, #f50); width: 0; }
        .${NS}-knob { position: absolute; top: 2px; width: 8px; height: 8px; margin-left: -4px; border-radius: 50%; background: var(--sce-accent, #f50); opacity: 0; transition: opacity .12s; }
        .${NS}-bar:hover .${NS}-knob { opacity: 1; }
        .${NS}-times { display: flex; justify-content: space-between; color: #999; font-size: 11px; font-variant-numeric: tabular-nums; margin-top: -6px; }
        .${NS}-times .cur { color: var(--sce-accent, #f50); }
        .${NS}-ctl { display: flex; align-items: center; justify-content: center; gap: 4px; }
        .${NS}-ctl button { width: 36px; height: 36px; border: 0; border-radius: 50%; background: transparent; color: #ccc; cursor: pointer; display: grid; place-items: center; padding: 0; position: relative; }
        .${NS}-ctl button svg { width: 16px; height: 16px; fill: currentColor; display: block; }
        .${NS}-ctl button:hover { color: #fff; background: rgba(255,255,255,.06); }
        .${NS}-ctl button.m-play { width: 40px; height: 40px; background: #fff; color: #111; margin: 0 6px; }
        .${NS}-ctl button.m-play:hover { background: #f2f2f2; color: #111; }
        .${NS}-ctl button.m-on { color: var(--sce-accent, #f50); }
        .${NS}-ctl button.m-on::after { content: ''; position: absolute; bottom: 5px; left: 50%; width: 3px; height: 3px; margin-left: -1.5px; border-radius: 50%; background: var(--sce-accent, #f50); }
        .${NS}-ctl button.m-busy svg { animation: ${NS}-spin .9s linear infinite; }
        .${NS}-ctl button .n { position: absolute; top: 4px; right: 4px; font-size: 8px; font-weight: 700; color: var(--sce-accent, #f50); }
        .${NS}-audio { border-top: 1px solid #3b3b3b; padding-top: 6px; color: #bbb; }
        .${NS}-audio summary { cursor: pointer; color: #ddd; font-weight: 600; }
        .${NS}-audio label { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px; }
        .${NS}-audio input[type=range] { width: 100%; accent-color: var(--sce-accent, #f50); }
        .${NS}-audio input[type=checkbox] { accent-color: var(--sce-accent, #f50); }
        .${NS}-presets { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-top: 8px; }
        .${NS}-presets button { padding: 5px; border: 0; border-radius: 2px; background: #3a3a3a; color: #ddd; cursor: pointer; }
        .${NS}-presets button:hover { background: #555; }
        @keyframes ${NS}-spin { to { transform: rotate(360deg); } }
    `;

    let pipWin = null, ui = null, media = null, off = [], mediaOff = []; // off : durée de vie de la fenêtre ; mediaOff : élément média courant

    function render() {
        if (!pipWin || pipWin.closed) return;
        const s = readState();
        ui.art.style.backgroundImage = s.artwork ? `url("${s.artwork}")` : '';
        ui.title.textContent = s.title;
        ui.artist.textContent = s.artist;
        ui.play.innerHTML = s.playing ? I.pause : I.play;
        ui.play.title = s.playing ? L.pause : L.play;
        const pct = s.duration ? Math.min(100, (s.position / s.duration) * 100) : 0;
        ui.fill.style.width = `${pct}%`;
        ui.knob.style.left = `${pct}%`;
        ui.cur.textContent = fmtTime(s.position);
        ui.dur.textContent = fmtTime(s.duration);
        ui.repeat.classList.toggle('m-on', s.repeat !== 'off');
        ui.repeat.querySelector('.n').textContent = s.repeat === 'one' ? '1' : '';
        const audio = window.__sceAudio?.settings;
        if (audio) {
            for (const key of ['rate', 'bass', 'reverb']) {
                const input = ui.audio.querySelector(`[data-audio="${key}"]`);
                if (input && pipWin.document.activeElement !== input) input.value = audio[key];
            }
            ui.audio.querySelector('[data-audio="preservePitch"]').checked = audio.preservePitch;
            ui.audio.querySelector('[data-value="rate"]').textContent = `${audio.rate}×`;
            ui.audio.querySelector('[data-value="bass"]').textContent = `${audio.bass} dB`;
            ui.audio.querySelector('[data-value="reverb"]').textContent = `${Math.round(audio.reverb * 100)} %`;
        }
        pipWin.document.title = s.title;
    }

    function bindMedia(el) {
        for (const fn of mediaOff.splice(0)) fn();
        media = el;
        if (!el) return;
        const on = (ev, fn) => { el.addEventListener(ev, fn); mediaOff.push(() => el.removeEventListener(ev, fn)); };
        on('timeupdate', render); on('play', render); on('pause', render); on('durationchange', render);
    }

    function seek(e) {
        const r = ui.bar.getBoundingClientRect();
        const frac = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
        if (media && Number.isFinite(media.duration)) media.currentTime = frac * media.duration;
        else {
            // Repli : clic proportionnel sur la timeline native
            const tl = $(SEL.timeline); if (!tl) return;
            const tr = tl.getBoundingClientRect();
            tl.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: tr.left + frac * tr.width, clientY: tr.top + tr.height / 2 }));
        }
        render();
    }

    async function open() {
        if (!supported) { window.postMessage({ scsp: 'event', type: 'pip-fallback' }, location.origin); return; } // Firefox : fenêtre popup via le service worker
        if (pipWin && !pipWin.closed) { pipWin.focus(); return; }
        pipWin = await documentPictureInPicture.requestWindow({ width: 300, height: 440 });
        const d = pipWin.document;
        d.documentElement.lang = document.documentElement.lang || 'fr';
        const style = d.createElement('style'); style.textContent = CSS; d.head.appendChild(style);
        d.documentElement.style.setProperty('--sce-accent', getComputedStyle(document.documentElement).getPropertyValue('--sce-accent') || '#ff5500');
        const root = d.createElement('div'); root.className = NS;
        root.innerHTML = `
            <div class="${NS}-art"></div>
            <div class="${NS}-meta"><div class="${NS}-title"></div><div class="${NS}-artist"></div></div>
            <div class="${NS}-bar"><div class="${NS}-fill"></div><div class="${NS}-knob"></div></div>
            <div class="${NS}-times"><span class="cur">0:00</span><span class="dur">0:00</span></div>
            <div class="${NS}-ctl">
                <button data-a="shuffle" title="${L.shuffle}">${I.shuffle}</button>
                <button data-a="prev" title="${L.prev}">${I.prev}</button>
                <button data-a="play" class="m-play">${I.play}</button>
                <button data-a="next" title="${L.next}">${I.next}</button>
                <button data-a="repeat" title="${L.repeat}">${I.repeat}<span class="n"></span></button>
            </div>
            <details class="${NS}-audio"><summary>${L.audio}</summary>
                <label>${L.speed} <output data-value="rate">1×</output></label><input data-audio="rate" type="range" min="0.1" max="3" step="0.01">
                <label><span>${L.pitch}</span><input data-audio="preservePitch" type="checkbox"></label>
                <label>${L.bass} <output data-value="bass">0 dB</output></label><input data-audio="bass" type="range" min="0" max="12" step="0.5">
                <label>${L.reverb} <output data-value="reverb">0 %</output></label><input data-audio="reverb" type="range" min="0" max="1" step="0.02">
                <div class="${NS}-presets"><button data-preset="normal">${L.normal}</button><button data-preset="bass">${L.bass}</button><button data-preset="slowed">${L.slowed}</button><button data-preset="nightcore">${L.nightcore}</button></div>
            </details>`;
        d.body.appendChild(root);
        ui = {
            art: root.querySelector(`.${NS}-art`), title: root.querySelector(`.${NS}-title`), artist: root.querySelector(`.${NS}-artist`),
            bar: root.querySelector(`.${NS}-bar`), fill: root.querySelector(`.${NS}-fill`), knob: root.querySelector(`.${NS}-knob`),
            cur: root.querySelector('.cur'), dur: root.querySelector('.dur'),
            play: root.querySelector('[data-a=play]'), repeat: root.querySelector('[data-a=repeat]'), shuffle: root.querySelector('[data-a=shuffle]'),
            audio: root.querySelector(`.${NS}-audio`),
        };
        ui.audio.addEventListener('input', (e) => {
            const key = e.target.dataset.audio;
            if (!key) return;
            window.__sceAudio?.setSettings({ [key]: key === 'preservePitch' ? e.target.checked : Number(e.target.value) });
            render();
        });
        ui.audio.addEventListener('click', (e) => {
            const preset = e.target.closest('[data-preset]')?.dataset.preset;
            if (preset) window.__sceAudio?.applyPreset(preset);
        });
        window.addEventListener('sce:audio-change', render);
        off.push(() => window.removeEventListener('sce:audio-change', render));
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

        pipWin.addEventListener('pagehide', () => { for (const fn of [...off.splice(0), ...mediaOff.splice(0)]) fn(); media = null; pipWin = null; ui = null; pinBtn?.classList.remove('m-on'); });
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
        .${NS}-pin.m-on { color: var(--sce-accent, #f50); }
    `;
    function mount() {
        if (pinBtn?.isConnected) return;
        const volume = $(SEL.volume); if (!volume) return;
        if (!document.getElementById(`${NS}-bar-styles`)) { const st = document.createElement('style'); st.id = `${NS}-bar-styles`; st.textContent = BAR_CSS; document.head.appendChild(st); }
        pinBtn = document.createElement('button');
        pinBtn.type = 'button';
        pinBtn.className = `${NS}-pin sc-mr-1x`;
        pinBtn.title = L.pin;
        pinBtn.setAttribute('aria-label', L.pinShort);
        pinBtn.innerHTML = `<div>${I.pin}</div>`;
        pinBtn.addEventListener('click', () => open().catch((e) => console.warn('[SCE] PiP', e)));
        volume.parentElement.insertBefore(pinBtn, volume);
    }
    new MutationObserver(() => { if (!pinBtn?.isConnected) mount(); }).observe(document.body, { childList: true, subtree: true });
    mount();

    // Commande externe (popup / raccourci) : { sce: 'command', command: 'pip' }.
    // Chromium n'ouvre une fenêtre PiP que sur activation utilisateur dans la page : sinon, on l'explique.
    window.addEventListener('message', (e) => {
        if (e.source === window && e.data?.sce === 'command' && e.data.command === 'pip') open().catch(() => window.__scsp?.toast?.(L.gesture, { error: true }));
    });
})();
