/*
 * Enhancer for SoundCloud™ — apparence (monde principal)
 *
 * Masquage à la carte (promotions Go+ / Artist Pro, Uploader, Studio de
 * l'artiste, notifications, messages, commentaires, modules latéraux, pied de
 * page), couleur d'accent personnalisée, page d'accueil au choix.
 *
 * Réglages lus dans localStorage 'scsp:settings' (synchronisés par le pont
 * depuis chrome.storage.sync). Tout est du CSS : coût nul, réversible à chaud.
 * Les sélecteurs SoundCloud sont regroupés dans HIDE ; c'est là qu'on répare
 * quand SoundCloud change son DOM.
 */
(() => {
    'use strict';
    const NS = 'sce-look';

    /** clé de réglage → sélecteurs à masquer */
    const HIDE = {
        hideUpsell:        ['.header__upsellWrapper', '.l-product-banners', '.playControls__panel.m-upsell-styling', '.sidebarModule .upsellBanner', '.audibleTile__upsell', '.listenEngagement__upsell'],
        hideUpload:        ['.header__soundInput', '.uploadButton'],
        hideArtistStudio:  ['.header__forArtistsButton'],
        hideNotifications: ['.header__userNavItem:has(.notificationIcon.activities)'],
        hideMessages:      ['.header__userNavItem:has(.notificationIcon.messages)'],
        hideComments:      ['.listenEngagement__commentForm', '.commentForm', '.commentsList', '.listenEngagement__footer .commentsList', '.listenDetails__comments', '.sidebarModule.commentsModule'],
        hideRelated:       ['.l-sidebar-right .sidebarModule:has(.relatedSoundsModule)', '.l-sidebar-right .sidebarModule:has(.soundInSetsModule)', '.l-sidebar-right .sidebarModule:has(.creatorRecommendations)', '.trackStationsModule'],
        hideFooter:        ['.sidebarFooter', '.l-sidebar-right .sidebarModule:has(.sidebarFooter)', '.footer'],
        hidePromoted:      ['.soundList__item:has(.sound__promoted)', '.audibleTile:has(.audibleTile__promoted)', '.promotedIndicator'],
        // Fil d'actualités : les items portent .streamContext ; un repost a un pictogramme dans la ligne de contexte
        hideFeedReposts:   ['.soundList__item:has(.sound.streamContext .soundContext__line .sc-ministats)'],
        hideFeedPlaylists: ['.soundList__item:has(.sound.streamContext.playlist)'],
        // Titres Go+ (extraits de 30 s sans abonnement) : SoundCloud pose .sc-hidden sur l'indicateur quand le titre n'est pas Go+
        hideGoPlus:        ['.searchList__item:has([class*="tierIndicator"]:not(.sc-hidden))', '.soundList__item:has([class*="tierIndicator"]:not(.sc-hidden))', '.audibleTile:has([class*="tierIndicator"]:not(.sc-hidden))', '.trackList__item:has([class*="tierIndicator"]:not(.sc-hidden))', '.badgeList__item:has([class*="tierIndicator"]:not(.sc-hidden))'],
    };
    /** L'en-tête est en flex : quand des éléments sont masqués, la recherche prend l'espace libéré. */
    const WIDE_SEARCH = `.header__middle form, .header__search, .headerSearch, .headerSearch__input { width: 100% !important; max-width: none !important; }`;

    /** Accent : éléments où SoundCloud durcit son orange #ff5500 */
    const accentCSS = (c) => `
        .sc-button-play, .sc-button-primary, .playButton.sc-button-play, .heroPlayButton .sc-button-play { background-color: ${c} !important; border-color: ${c} !important; }
        .sc-button-play:hover, .sc-button-primary:hover { filter: brightness(1.08); }
        .playbackTimeline__progressBackground, .playbackTimeline__progressBar, .playbackTimeline__progressHandle { background-color: ${c} !important; }
        .playbackTimeline__timePassed, .playbackTimeline__timePassed span { color: ${c} !important; }
        .sc-button-selected, .sc-button-selected:hover, .shuffleControl.m-shuffling, .repeatControl.m-one, .repeatControl.m-all { color: ${c} !important; }
        .tabs__tab.active, .g-tabs-link.active, .g-nav-item.active > a, .header__navItem.active { border-color: ${c} !important; color: #fff; }
        .g-tabs-link.active::after, .tabs__tab.active::after { background-color: ${c} !important; }
        .sc-link-primary:hover, .soundTitle__title:hover, .sc-text-primary a:hover { color: ${c} !important; }
        .sc-button-like.sc-button-selected, .sc-button-like.sc-button-selected:hover, .playbackSoundBadge__like.sc-button-selected { color: ${c} !important; }
        .sc-badge, .badge-primary, .notificationIcon__badge { background-color: ${c} !important; }
        .waveform__layer .waveform__scene canvas { filter: hue-rotate(${hue(c)}deg) saturate(.9); }
        .sc-input:focus, .textfield__input:focus { box-shadow: inset 0 0 0 1px ${c} !important; }
    `;
    /** Rotation de teinte depuis l'orange SoundCloud (≈ 20°) vers la couleur choisie, pour les canvas de waveform. */
    function hue(hex) {
        const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex); if (!m) return 0;
        const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16) / 255);
        const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
        let h = 0;
        if (d) { h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h = Math.round(h * 60); if (h < 0) h += 360; }
        return h - 20;
    }

    const readSettings = () => { try { return JSON.parse(localStorage.getItem('scsp:settings') || '{}'); } catch { return {}; } };

    let styleEl = null;
    function apply() {
        const s = readSettings();
        let css = '';
        for (const [key, sels] of Object.entries(HIDE)) if (s[key]) css += `${sels.join(', ')} { display: none !important; }\n`;
        if (s.hideUpsell || s.hideUpload || s.hideArtistStudio || s.wideSearch) css += WIDE_SEARCH;
        if (s.accent && /^#[0-9a-f]{6}$/i.test(s.accent) && s.accent.toLowerCase() !== '#ff5500') css += accentCSS(s.accent);
        if (!styleEl) { styleEl = document.createElement('style'); styleEl.id = `${NS}-styles`; (document.head || document.documentElement).appendChild(styleEl); }
        if (styleEl.textContent !== css) styleEl.textContent = css;
    }

    /** Page d'accueil : redirige la page d'entrée par défaut de SoundCloud (/ ou /discover), au premier chargement seulement. */
    function homeRedirect() {
        const s = readSettings();
        const home = s.homePage; if (!home || home === '/discover') return;
        if (!/^\/(discover)?\/?$/.test(location.pathname)) return;
        const nav = performance.getEntriesByType('navigation')[0];
        if (nav && nav.type !== 'navigate') return;                                   // rechargement, retour arrière : on ne touche pas
        if (document.referrer && new URL(document.referrer).origin === location.origin) return; // clic interne vers Accueil : respecté
        sessionStorage.setItem(`${NS}:redirected`, '1');
        const a = document.createElement('a'); a.href = home; a.style.display = 'none';
        (document.body || document.documentElement).appendChild(a); a.click(); a.remove();
    }

    apply();
    window.addEventListener('storage', (e) => { if (e.key === 'scsp:settings') apply(); });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', homeRedirect, { once: true }); else homeRedirect();
})();
