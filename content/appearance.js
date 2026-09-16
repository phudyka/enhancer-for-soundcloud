/*
 * Enhancer for SoundCloud™ — apparence (monde principal)
 *
 * Masquage à la carte (promotions Go+ / Artist Pro, Uploader, Studio de
 * l'artiste, notifications, messages, commentaires, modules latéraux, pied de
 * page), fond noir OLED, couleur d'accent personnalisée, page d'accueil au choix.
 *
 * Réglages lus dans localStorage 'scsp:settings' (synchronisés par le pont
 * depuis chrome.storage.sync). Le bloc artiste est repéré par son titre pour
 * le distinguer de la jauge d'uploads, masquable séparément.
 * Les sélecteurs SoundCloud sont regroupés dans HIDE ; c'est là qu'on répare
 * quand SoundCloud change son DOM.
 */
(() => {
    'use strict';
    const NS = 'sce-look';

    /** clé de réglage → sélecteurs à masquer */
    const HIDE = {
        hideUpsell:        ['.header__upsellWrapper', '.l-product-banners', '.playControls__panel.m-upsell-styling', '.sidebarModule .upsellBanner', '.audibleTile__upsell', '.listenEngagement__upsell', '.spotlight__upsellBanner', '.quotaMeter__upsellText', 'a[href^="https://checkout.soundcloud.com/artist"]'],
        hideUploadMeter:   ['.quotaMeter'],
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
    // Les libellés visibles résistent mieux aux changements de classes de SoundCloud.
    // Les onglets et le menu sont distingués par leur conteneur pour éviter les homonymes.
    const PROFILE_TABS = {
        hideProfileAll: ['Tout', 'All'], hideProfilePopular: ['Titres populaires', 'Popular tracks'],
        hideProfileTracks: ['Titres', 'Tracks'], hideProfileAlbums: ['Albums'],
        hideProfilePlaylists: ['Playlists'], hideProfileReposts: ['Reposts'], hideProfileVinyl: ['Vinyl'],
    };
    const NAV_ITEMS = {
        hideNavProfile: ['Profil', 'Profile'], hideNavLikes: ['Favoris', 'Likes'],
        hideNavPlaylists: ['Playlists'], hideNavStations: ['Stations'],
        hideNavFollowing: ['Abonnements', 'Following'], hideNavSuggestions: ['Suggestions'],
        hideNavArtistPro: ['Essayer Artist Pro', 'Try Artist Pro'], hideNavBenefits: ['Avantages', 'Benefits'],
        hideNavTracks: ['Titres', 'Tracks'], hideNavInsights: ['Informations', 'Insights'],
        hideNavDistribute: ['Distribuer', 'Distribute'],
    };
    const PROFILE_ACTIONS = {
        hideProfileInformation: ['Vos informations', 'Your insights'],
        hideProfileStation: ['Station'],
    };
    const className = (key) => `${NS}-${key.replace(/^hide/, '').replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).replace(/^-/, '')}`;
    const sameLabel = (value, labels) => labels.some((label) => value.toLocaleLowerCase() === label.toLocaleLowerCase());
    /** Éléments à examiner : seulement les zones concernées par les réglages actifs, plus ceux déjà marqués (pour retirer la marque). */
    function debloatCandidates(settings) {
        const scopes = [];
        if (Object.keys(PROFILE_TABS).some((key) => settings[key])) scopes.push('.g-tabs-link', '.tabs__tab');
        if (Object.keys(NAV_ITEMS).some((key) => settings[key])) scopes.push('.l-sidebar-left a', '.sidebarNav a', '.userSidebar a', 'nav a', '.l-sidebar-left button', '.sidebarNav button', '.userSidebar button', 'nav button');
        if (Object.keys(PROFILE_ACTIONS).some((key) => settings[key])) scopes.push('a', 'button');
        if (settings.hideArtistProPrompt) scopes.push('a', 'p');
        const elements = new Set(document.querySelectorAll(`[class*="${NS}-"]`));
        if (scopes.length) document.querySelectorAll([...new Set(scopes)].join(', ')).forEach((element) => elements.add(element));
        return elements;
    }
    function markDebloat(settings) {
        const keys = [...Object.keys(PROFILE_TABS), ...Object.keys(NAV_ITEMS), ...Object.keys(PROFILE_ACTIONS), 'hideArtistProPrompt'];
        debloatCandidates(settings).forEach((element) => {
            const label = (element.textContent || '').replace(/\s+/g, ' ').trim();
            const active = new Set();
            for (const [key, labels] of Object.entries(PROFILE_TABS)) {
                if (settings[key] && element.matches('.g-tabs-link, .tabs__tab') && sameLabel(label, labels)) active.add(key);
            }
            for (const [key, labels] of Object.entries(NAV_ITEMS)) {
                if (settings[key] && element.closest('.l-sidebar-left, .sidebarNav, .userSidebar, nav') && sameLabel(label, labels)) active.add(key);
            }
            for (const [key, labels] of Object.entries(PROFILE_ACTIONS)) {
                if (settings[key] && element.matches('a, button') && sameLabel(label, labels)) active.add(key);
            }
            if (settings.hideArtistProPrompt && /^(essayez artist pro|try artist pro)\b/i.test(label) && /uploads?|unlimited/i.test(label)) active.add('hideArtistProPrompt');
            for (const key of keys) {
                const name = className(key);
                if (active.has(key) && !element.classList.contains(name)) element.classList.add(name);
                if (!active.has(key) && element.classList.contains(name)) element.classList.remove(name);
            }
            if (element.matches('a') && /^(essayez artist pro|try artist pro)$/i.test(label)) {
                const parent = element.parentElement;
                if (parent && /uploads?|unlimited/i.test(parent.textContent || '')) {
                    const name = className('hideArtistProPrompt');
                    if (settings.hideArtistProPrompt) parent.classList.add(name);
                    else parent.classList.remove(name);
                }
            }
        });
    }
    /** L'en-tête est en flex : quand des éléments sont masqués, la recherche prend l'espace libéré. */
    const WIDE_SEARCH = `.header__middle form, .header__search, .headerSearch { width: 100% !important; max-width: 520px !important; } .headerSearch__input { width: 100% !important; }`;

    /** Accent : éléments où SoundCloud durcit son orange #ff5500 */
    const accentCSS = (c) => `
        .sc-button-play, .sc-button-primary, .playButton.sc-button-play, .heroPlayButton .sc-button-play { background-color: ${c} !important; border-color: ${c} !important; }
        .sc-button-play:hover, .sc-button-primary:hover { filter: brightness(1.08); }
        .playbackTimeline__progressBar, .playbackTimeline__progressHandle { background-color: ${c} !important; }
        .playbackTimeline__progressBackground { background-color: #4a4a4a !important; }
        .playbackTimeline__timePassed, .playbackTimeline__timePassed span { color: ${c} !important; }
        .sc-button-selected, .sc-button-selected:hover, .shuffleControl.m-shuffling, .repeatControl.m-one, .repeatControl.m-all { color: ${c} !important; }
        .tabs__tab.active, .g-tabs-link.active, .g-nav-item.active > a, .header__navItem.active { border-color: ${c} !important; color: #fff; }
        .g-tabs-link.active::after, .tabs__tab.active::after { background-color: ${c} !important; }
        .sc-link-primary:hover, .soundTitle__title:hover, .sc-text-primary a:hover { color: ${c} !important; }
        .sc-button-like.sc-button-selected, .sc-button-like.sc-button-selected:hover, .playbackSoundBadge__like.sc-button-selected { color: ${c} !important; }
        .sc-badge, .badge-primary, .notificationIcon__badge { background-color: ${c} !important; }
        .waveform__scene canvas, .waveform canvas.sceneLayer { filter: hue-rotate(${hue(c)}deg); }
        .trackItem.active .trackItem__number, .trackItem.active .trackItem__username, .trackItem.active .trackItem__trackTitle, .trackItem.active .trackItem__separator,
        .trackItem.active .trackItem__separator.sc-text-secondary, .sound.playing .soundTitle__title, .soundTitle__title.sc-link-primary:hover, .playing .soundTitle__usernameText { color: ${c} !important; }
        .sc-text-orange, .sc-text-special, .sc-link-primary.active { color: ${c} !important; }
        .sc-button-primary, .sc-button-primary * { color: ${contrastText(c)} !important; }
        .volume__sliderProgress, .volume__sliderHandle, .queue__itemsHeight .queueItemView.m-active .queueItemView__title { background-color: ${c} !important; }
        .sc-input:focus, .textfield__input:focus { box-shadow: inset 0 0 0 1px ${c} !important; }
    `;
    /** Contraste lisible du texte sur les boutons colorés, y compris en blanc ou jaune. */
    function contrastText(hex) {
        const rgb = hex.slice(1).match(/../g).map((part) => {
            const channel = parseInt(part, 16) / 255;
            return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        });
        return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 0.179 ? '#111' : '#fff';
    }
    /** Rotation de teinte depuis l'orange SoundCloud (≈ 20°) vers la couleur choisie, pour les canvas de waveform. */
    function hue(hex) {
        const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex); if (!m) return 0;
        const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16) / 255);
        const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
        let h = 0;
        if (d) { h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h = Math.round(h * 60); if (h < 0) h += 360; }
        return h - 20;
    }

    /** Fond noir OLED : ne s'applique qu'au thème sombre natif (body.theme-dark). Les surfaces
     *  transparentes héritent du fond ; seules les surfaces grises durcies sont reprises. */
    const OLED_CSS = `
        body.theme-dark, .theme-dark .header, .theme-dark .queue, .theme-dark .playbackSoundBadge__queueCircle, .theme-dark .uploadTarget__frame,
        .theme-dark .modal__modal, .theme-dark .modal__content, .theme-dark .dropdownMenu, .theme-dark .dropdownContent, .theme-dark .l-listen-hero,
        .theme-dark .fullHero__artwork, .theme-dark .profileHeaderBackground, .theme-dark .l-fluid-fixed, .theme-dark .sidebarModule.m-elevated { background-color: #000 !important; }
        .theme-dark .playControls__bg, .theme-dark .playControls__inner, .theme-dark .playControlsPanel, .theme-dark .sc-background-darkgrey,
        .theme-dark .headerSearch__input, .theme-dark .sc-input, .theme-dark .textfield__input, .theme-dark .volume__sliderBackground, .theme-dark .queue__hide,
        .theme-dark .sc-button-secondary:not(.sc-button-selected), .theme-dark .listDisplayToggle__badgeToggle, .theme-dark .listDisplayToggle__listToggle,
        .theme-dark .sound__artwork:has(.image__placeholder), .theme-dark .commentForm__wrapper, .theme-dark .listenEngagement__commentForm .sc-input { background-color: #181818 !important; }
        .theme-dark .playbackTimeline__progressBackground, .theme-dark .volume__sliderBackground { background-color: #2c2c2c !important; }
        .theme-dark .sc-button-secondary:not(.sc-button-selected):hover { background-color: #242424 !important; }
    `;

    const readSettings = () => { try { return JSON.parse(localStorage.getItem('scsp:settings') || '{}'); } catch { return {}; } };

    let styleEl = null;
    let artistObserver = null;
    let artistScanQueued = false;
    function markArtistTools() {
        if (!readSettings().hideArtistTools) {
            document.querySelectorAll(`.${NS}-artist-tools`).forEach((el) => el.classList.remove(`${NS}-artist-tools`));
            return;
        }
        const heading = [...document.querySelectorAll('h2, h3, h4, div, span')].find((el) =>
            [...el.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && /^(outils pour artistes|tools for artists)$/i.test(node.textContent.trim())));
        if (!heading) return;
        let panel = heading;
        while (panel.parentElement && !/uploads gratuits|free uploads/i.test(panel.parentElement.textContent || '')) {
            panel = panel.parentElement;
            if (/promouvez|promote/i.test(panel.textContent || '') && /remplace|replace/i.test(panel.textContent || '')) break;
        }
        if (!panel.classList.contains(`${NS}-artist-tools`)) panel.classList.add(`${NS}-artist-tools`);
    }
    function watchArtistTools(settings) {
        artistObserver?.disconnect();
        artistObserver = null;
        markArtistTools();
        markDebloat(settings);
        const dynamicKeys = [...Object.keys(PROFILE_TABS), ...Object.keys(NAV_ITEMS), ...Object.keys(PROFILE_ACTIONS), 'hideArtistProPrompt'];
        if (!settings.hideArtistTools && !dynamicKeys.some((key) => settings[key])) return;
        artistObserver = new MutationObserver(() => {
            if (artistScanQueued) return;
            artistScanQueued = true;
            requestAnimationFrame(() => { artistScanQueued = false; markArtistTools(); markDebloat(readSettings()); });
        });
        artistObserver.observe(document.documentElement, { childList: true, subtree: true });
    }
    function apply() {
        const s = readSettings();
        let css = '';
        for (const [key, sels] of Object.entries(HIDE)) if (s[key]) css += `${sels.join(', ')} { display: none !important; }\n`;
        // OneTrust injecte le bandeau et un voile séparé ; ne pas cacher le centre de préférences.
        if (s.hideCookieBanner !== false) css += '#onetrust-banner-sdk, #onetrust-consent-sdk > .onetrust-pc-dark-filter { display: none !important; }\n';
        if (s.hideArtistTools) css += `.${NS}-artist-tools { display: none !important; }\n`;
        for (const key of [...Object.keys(PROFILE_TABS), ...Object.keys(NAV_ITEMS), ...Object.keys(PROFILE_ACTIONS), 'hideArtistProPrompt']) {
            if (s[key]) css += `.${className(key)} { display: none !important; }\n`;
        }
        if (s.hideUpsell || s.hideUpload || s.hideArtistStudio || s.wideSearch) css += WIDE_SEARCH;
        if (s.oled) css += OLED_CSS;
        if (s.accent && /^#[0-9a-f]{6}$/i.test(s.accent) && s.accent.toLowerCase() !== '#ff5500') css += accentCSS(s.accent);
        // Nos propres composants (panneau Audio, Bibliothèque, lecteur épinglable, toasts) suivent la même couleur
        document.documentElement.style.setProperty('--sce-accent', /^#[0-9a-f]{6}$/i.test(s.accent || '') ? s.accent : '#ff5500');
        if (!styleEl) { styleEl = document.createElement('style'); styleEl.id = `${NS}-styles`; (document.head || document.documentElement).appendChild(styleEl); }
        if (styleEl.textContent !== css) styleEl.textContent = css;
        watchArtistTools(s);
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
    window.addEventListener('sce:settings-change', apply);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', homeRedirect, { once: true }); else homeRedirect();
})();
