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
    try { if (JSON.parse(localStorage.getItem('scsp:settings') || '{}').extensionDisabled === true) return; } catch {}
    const NS = 'sce-look';

    /** clé de réglage → sélecteurs à masquer */
    const HIDE = {
        hideArtistTools:   ['.sidebarModule:has(.sidebarModule__webiEmbeddedModule)'],   // module « Outils pour artistes » intégré (iframe) ; le bloc textuel est repéré par son titre
        hideUpsell:        ['.header__upsellWrapper', '.l-product-banners', '.playControls__panel.m-upsell-styling', '.sidebarModule .upsellBanner', '.audibleTile__upsell', '.listenEngagement__upsell', '.spotlight__upsellBanner', '.quotaMeter__upsellText', 'a[href^="https://checkout.soundcloud.com/artist"]', `.${NS}-tour-upsell`],
        hideUpsellHeader:  ['.header__upsellWrapper'],
        hideUpsellBanners: ['.l-product-banners'],
        hideUpsellPlayer:  ['.playControls__panel.m-upsell-styling'],
        hideUpsellSidebar: ['.sidebarModule .upsellBanner'],
        hideUpsellTracks: ['.audibleTile__upsell', '.listenEngagement__upsell', '.spotlight__upsellBanner'],
        hideUpsellUpload: ['.quotaMeter__upsellText'],
        hideUpsellArtistLink: ['a[href^="https://checkout.soundcloud.com/artist"]'],
        hideUpsellTour: [`.${NS}-tour-upsell`],
        hideUploadMeter:   ['.quotaMeter'],
        hideUpload:        ['.header__soundInput', '.uploadButton'],
        hideArtistStudio:  ['.header__forArtistsButton'],
        hideLocale:        ['.footer__localeSelector', '.localeSelector'],
        // Fil d'actualités : modules de la colonne de droite
        hideSidebarNewTracks:   ['.sidebarModule.artistShortcutsModule'],
        hideSidebarWhoToFollow: ['.sidebarModule.whoToFollowModule'],
        hideSidebarLikes:       ['.sidebarModule.likesModule'],
        hideSidebarHistory:     ['.sidebarModule.historyModule'],
        hideSidebarInsights:    ['.insightsSidebarModule'],
        hideStationAutoplay:     ['.queueFallback__stationMode'],
        hideCastButton:         ['.playControls__cast', '.playControls__castControl', '.playControls .castControl', '.playControls [class*="castButton" i]', '.playControls [class*="castControl" i]', '.playControls [aria-label*="cast" i]', '.playControls [aria-label*="device" i]', '.playControls [title*="cast" i]', '.playControls [data-testid*="cast" i]', '.castControl'],
        hidePipButton:          ['.sce-pip-pin'],
        hideRecentlyPlayed:     ['.collection__historyContextsSection'],
        hideNotifications: ['.header__userNavItem:has(.notificationIcon.activities)'],
        hideMessages:      ['.header__userNavItem:has(.notificationIcon.messages)'],
        hideComments:      ['.listenEngagement__commentForm', '.commentForm', '.commentsList', '.listenEngagement__footer .commentsList', '.listenDetails__comments', '.sidebarModule.commentsModule'],
        hideRelated:       ['.l-sidebar-right .sidebarModule:has(.relatedSoundsModule)', '.l-sidebar-right .sidebarModule:has(.soundInSetsModule)', '.l-sidebar-right .sidebarModule:has(.creatorRecommendations)', '.trackStationsModule'],
        hideRelatedTracks: ['.l-sidebar-right .sidebarModule:has(.relatedSoundsModule)'],
        hideRelatedPlaylists: ['.l-sidebar-right .sidebarModule:has(.soundInSetsModule)'],
        hideRelatedArtists: ['.l-sidebar-right .sidebarModule:has(.creatorRecommendations)'],
        hideTrackStations: ['.trackStationsModule'],
        hideFooter:        ['.sidebarFooter', '.l-sidebar-right .sidebarModule:has(.sidebarFooter)', '.footer', '.l-sidebar-right .l-footer', '.l-sidebar-right .additional-footer'],
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
    // Onglets de l'en-tête (Accueil, Fil, Bibliothèque) : liens .header__navMenuItem
    const HEADER_LINKS = {
        hideNavHome: ['Accueil', 'Home'], hideNavStream: ["Fil d'actualités", 'Feed'], hideNavLibrary: ['Bibliothèque', 'Library'],
    };
    // Modules repérés par leur titre (fil, Découvrir, colonne de droite)
    const MODULE_HEADINGS = {
        hideSidebarMobile: ['Passer sur mobile', 'Go mobile'],
    };
    const MODULE_SEL = '.sidebarModule, .mixedSelectionModule, .l-sidebar-right > div, section';
    const HEADING_SEL = 'h1, h2, h3, h4, h5, h6, [class*="__title"], [class*="Title"]';
    /** Titre normalisé d'un module : minuscules, sans chiffres ni ponctuation, 40 caractères. */
    const headingKey = (text) => (text || '').toLocaleLowerCase().replace(/[\d.,'’«»"!?:()]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
    const moduleHeading = (module) => headingKey(module.querySelector(HEADING_SEL)?.textContent);
    /** Masquages libres (sélecteur d'éléments) : 'sel:<css>', 'text:<css>|<texte>', 'class:<classe>', 'heading:<titre normalisé>'. */
    const customEntries = (settings) => Array.isArray(settings.hiddenCustom) ? settings.hiddenCustom.filter((entry) => typeof entry === 'string') : [];
    const CUSTOM_CLASS = `${NS}-custom-hidden`;
    const className = (key) => `${NS}-${key.replace(/^hide/, '').replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).replace(/^-/, '')}`;
    const sameLabel = (value, labels) => labels.some((label) => value.toLocaleLowerCase() === label.toLocaleLowerCase());
    /** Éléments à examiner : seulement les zones concernées par les réglages actifs, plus ceux déjà marqués (pour retirer la marque). */
    function debloatCandidates(settings) {
        const scopes = [];
        if (Object.keys(HEADER_LINKS).some((key) => settings[key])) scopes.push('.header__navMenuItem');
        const custom = customEntries(settings);
        if (Object.keys(MODULE_HEADINGS).some((key) => settings[key]) || custom.some((entry) => entry.startsWith('heading:'))) scopes.push(MODULE_SEL);
        for (const entry of custom) if (entry.startsWith('text:')) { const sel = entry.slice(5).split('|')[0]; if (sel) scopes.push(sel); }
        if (Object.keys(PROFILE_TABS).some((key) => settings[key])) scopes.push('.g-tabs-link', '.tabs__tab');
        if (Object.keys(NAV_ITEMS).some((key) => settings[key])) scopes.push('.l-sidebar-left a', '.sidebarNav a', '.userSidebar a', 'nav a', '.l-sidebar-left button', '.sidebarNav button', '.userSidebar button', 'nav button', '.headerMenu__link');
        if (Object.keys(PROFILE_ACTIONS).some((key) => settings[key])) scopes.push('a', 'button');
        if (settings.hideArtistProPrompt) scopes.push('a', 'p');
        const elements = new Set(document.querySelectorAll(`[class*="${NS}-"]`));
        if (scopes.length) document.querySelectorAll([...new Set(scopes)].join(', ')).forEach((element) => elements.add(element));
        return elements;
    }
    function markDebloat(settings) {
        const keys = [...Object.keys(PROFILE_TABS), ...Object.keys(NAV_ITEMS), ...Object.keys(PROFILE_ACTIONS), ...Object.keys(HEADER_LINKS), ...Object.keys(MODULE_HEADINGS), 'hideArtistProPrompt'];
        const custom = customEntries(settings);
        const customHeadings = new Set(custom.filter((entry) => entry.startsWith('heading:')).map((entry) => entry.slice(8)));
        const customTexts = custom.filter((entry) => entry.startsWith('text:')).map((entry) => { const [sel, ...text] = entry.slice(5).split('|'); return { sel, text: text.join('|') }; });
        debloatCandidates(settings).forEach((element) => {
            const label = (element.textContent || '').replace(/\s+/g, ' ').trim();
            const active = new Set();
            let customHit = false;
            for (const [key, labels] of Object.entries(HEADER_LINKS)) {
                if (settings[key] && element.matches('.header__navMenuItem') && sameLabel(label, labels)) active.add(key);
            }
            if (element.matches(MODULE_SEL)) {
                const heading = moduleHeading(element);
                for (const [key, labels] of Object.entries(MODULE_HEADINGS)) if (settings[key] && heading && labels.some((l) => headingKey(l) === heading)) active.add(key);
                if (heading && customHeadings.has(heading)) customHit = true;
            }
            for (const { sel, text } of customTexts) { try { if (element.matches(sel) && label === text) customHit = true; } catch {} }
            if (customHit && !element.classList.contains(CUSTOM_CLASS)) element.classList.add(CUSTOM_CLASS);
            if (!customHit && element.classList.contains(CUSTOM_CLASS)) element.classList.remove(CUSTOM_CLASS);
            for (const [key, labels] of Object.entries(PROFILE_TABS)) {
                if (settings[key] && element.matches('.g-tabs-link, .tabs__tab') && sameLabel(label, labels)) active.add(key);
            }
            // Menu latéral et menu déroulant de l'avatar (.headerMenu__link) partagent les mêmes réglages
            for (const [key, labels] of Object.entries(NAV_ITEMS)) {
                if (settings[key] && element.closest('.l-sidebar-left, .sidebarNav, .userSidebar, nav, .dropdownMenu, .headerMenu') && sameLabel(label, labels)) active.add(key);
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
        .playbackTimeline__progressHandle { border-color: color-mix(in srgb, ${c} 72%, white) !important; }
        .playbackTimeline__progressBackground { background-color: #4a4a4a !important; }
        .playbackTimeline__timePassed, .playbackTimeline__timePassed span { color: ${c} !important; }
        .sc-button-selected, .sc-button-selected:hover, .shuffleControl.m-shuffling, .repeatControl.m-one, .repeatControl.m-all { color: ${c} !important; }
        .tabs__tab.active, .g-tabs-link.active, .g-nav-item.active > a, .header__navItem.active { border-color: ${c} !important; color: #fff; }
        .g-tabs-link.active::after, .tabs__tab.active::after { background-color: ${c} !important; }
        .sc-link-primary:hover, .soundTitle__title:hover, .sc-text-primary a:hover { color: ${c} !important; }
        .sc-button-like.sc-button-selected, .sc-button-like.sc-button-selected:hover, .playbackSoundBadge__like.sc-button-selected { color: ${c} !important; }
        .sc-badge, .badge-primary { background-color: ${c} !important; }
        .waveform__scene canvas, .waveform canvas.sceneLayer { filter: url(#sce-look-wave-tint); }
        .trackItem.active .trackItem__number, .trackItem.active .trackItem__username, .trackItem.active .trackItem__trackTitle, .trackItem.active .trackItem__separator,
        .trackItem.active .trackItem__separator.sc-text-secondary, .sound.playing .soundTitle__title, .soundTitle__title.sc-link-primary:hover, .playing .soundTitle__usernameText { color: ${c} !important; }
        .sc-text-orange, .sc-text-special, .sc-link-primary.active { color: ${c} !important; }
        .sc-button-primary, .sc-button-primary * { color: ${contrastText(c)} !important; }
        .queueFallback__stationMode .sc-toggle.sc-toggle-on::before { background-color: ${c} !important; }
        .volume__sliderProgress, .volume__sliderHandle, .queue__itemsHeight .queueItemView.m-active .queueItemView__title { background-color: ${c} !important; }
        .queue__itemsHeight .queueItemView.m-active .queueItemView__title,
        .queue__itemsHeight .queueItemView.m-active .queueItemView__title * { color: ${contrastText(c)} !important; }
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
    /** Recolore l'orange #f50 des canvas sans teinter leurs pixels gris ou blancs. */
    function waveTint(hex) {
        let svg = document.getElementById(`${NS}-wave-filter`);
        if (!svg) {
            svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.id = `${NS}-wave-filter`;
            svg.setAttribute('aria-hidden', 'true');
            svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
            const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
            filter.id = `${NS}-wave-tint`;
            filter.setAttribute('color-interpolation-filters', 'sRGB');
            filter.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'feColorMatrix'));
            svg.appendChild(filter);
            document.documentElement.appendChild(svg);
        }
        const target = hex.slice(1).match(/../g).map((part) => parseInt(part, 16));
        const rows = target.map((channel) => {
            const weight = (channel - 85) / 170;
            return `${weight} ${1 - weight} 0 0 0`;
        });
        svg.querySelector('feColorMatrix').setAttribute('values', `${rows.join(' ')} 0 0 0 1 0`);
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
    let lastArtistScan = 0, artistRetry = null;
    function markArtistTools(settings = readSettings()) {
        if (!settings.hideArtistTools) {
            document.querySelectorAll(`.${NS}-artist-tools`).forEach((el) => el.classList.remove(`${NS}-artist-tools`));
            return;
        }
        if (document.querySelector(`.${NS}-artist-tools`)) return;          // déjà repéré : pas de nouveau parcours de la page
        const now = Date.now();
        if (now - lastArtistScan < 400) {                                   // parcours coûteux : pas à chaque image pendant les rafales de mutations
            if (!artistRetry) artistRetry = setTimeout(() => { artistRetry = null; markArtistTools(); }, 400);
            return;
        }
        lastArtistScan = now;
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
    function markTourUpsell(settings) {
        document.querySelectorAll(`.${NS}-tour-upsell`).forEach((el) => el.classList.remove(`${NS}-tour-upsell`));
        if (!settings.hideUpsell && !settings.hideUpsellTour) return;
        for (const heading of document.querySelectorAll('h2, h3, h4, [class*="__title"]')) {
            if ((heading.textContent || '').trim().toLowerCase() !== 'on tour') continue;
            let panel = heading.closest('.sidebarModule');
            if (!panel || !/upgrade to artist pro/i.test(panel.textContent || '')) {
                panel = heading.parentElement;
                for (let depth = 0; panel && depth < 5 && !/upgrade to artist pro/i.test(panel.textContent || ''); depth++) panel = panel.parentElement;
            }
            if (panel && !panel.matches('body, main, .l-sidebar-right') && /upgrade to artist pro/i.test(panel.textContent || '')) panel.classList.add(`${NS}-tour-upsell`);
        }
    }
    function watchArtistTools(settings) {
        artistObserver?.disconnect();
        artistObserver = null;
        lastArtistScan = 0;
        markArtistTools(settings);
        markTourUpsell(settings);
        markDebloat(settings);
        const dynamicKeys = [...Object.keys(PROFILE_TABS), ...Object.keys(NAV_ITEMS), ...Object.keys(PROFILE_ACTIONS), ...Object.keys(HEADER_LINKS), ...Object.keys(MODULE_HEADINGS), 'hideArtistProPrompt'];
        const custom = customEntries(settings);
        if (!settings.hideArtistTools && !settings.hideUpsell && !settings.hideUpsellTour && !dynamicKeys.some((key) => settings[key]) && !custom.some((entry) => entry.startsWith('heading:') || entry.startsWith('text:'))) return;
        artistObserver = new MutationObserver(() => {
            if (artistScanQueued) return;
            artistScanQueued = true;
            requestAnimationFrame(() => { artistScanQueued = false; const current = readSettings(); markArtistTools(current); markTourUpsell(current); markDebloat(current); });
        });
        artistObserver.observe(document.documentElement, { childList: true, subtree: true });
    }
    function apply() {
        const s = readSettings();
        let css = '';
        for (const [key, sels] of Object.entries(HIDE)) if (s[key]) css += `${sels.join(', ')} { display: none !important; }\n`;
        // SoundCloud espace le dernier rang sur toute la largeur. Après le filtre Go+, cela
        // ressemble à des cases vides pendant que le lot suivant se charge.
        if (s.hideGoPlus) css += '.badgeList .lazyLoadingList__list:has(> .badgeList__item) { justify-content: flex-start !important; column-gap: 24px; }\n';
        // OneTrust injecte le bandeau et un voile séparé ; ne pas cacher le centre de préférences.
        if (s.hideCookieBanner !== false) css += '#onetrust-banner-sdk, #onetrust-consent-sdk > .onetrust-pc-dark-filter { display: none !important; }\n';
        if (s.hideArtistTools) css += `.${NS}-artist-tools { display: none !important; }\n`;
        for (const key of [...Object.keys(PROFILE_TABS), ...Object.keys(NAV_ITEMS), ...Object.keys(PROFILE_ACTIONS), ...Object.keys(HEADER_LINKS), ...Object.keys(MODULE_HEADINGS), 'hideArtistProPrompt']) {
            if (s[key]) css += `.${className(key)} { display: none !important; }\n`;
        }
        // Masquages libres : sélecteurs directs et classes en CSS, titres et textes via la classe posée par markDebloat
        const direct = [];
        for (const entry of customEntries(s)) {
            if (entry.startsWith('sel:')) direct.push(entry.slice(4));
            else if (entry.startsWith('class:') && /^[\w-]+$/.test(entry.slice(6))) direct.push(`.${entry.slice(6)}`);
        }
        const safeDirect = direct.filter((selector) => {
            try {
                if (/^(?:[\w-]+)?\.playControls$/.test(selector.trim())) return false;
                const bar = document.querySelector?.('.playControls');
                return ![...document.querySelectorAll(selector)].some((el) => el.matches?.('.playControls') || (bar && el.contains?.(bar)));
            }
            catch { return false; }
        });
        if (safeDirect.length) css += `${safeDirect.join(', ')} { display: none !important; }\n`;
        css += `.${CUSTOM_CLASS} { display: none !important; }\n`;
        if (s.hideUpsell || s.hideUpsellHeader || s.hideUpload || s.hideArtistStudio || s.wideSearch) css += WIDE_SEARCH;
        if (s.oled) css += OLED_CSS;
        if (s.accent && /^#[0-9a-f]{6}$/i.test(s.accent) && s.accent.toLowerCase() !== '#ff5500') {
            waveTint(s.accent);
            css += accentCSS(s.accent);
        }
        // Nos propres composants (panneau Audio, Bibliothèque, lecteur épinglable, toasts) suivent la même couleur
        document.documentElement.style.setProperty('--sce-accent', /^#[0-9a-f]{6}$/i.test(s.accent || '') ? s.accent : '#ff5500');
        document.documentElement.style.setProperty('--sce-on-accent', contrastText(/^#[0-9a-f]{6}$/i.test(s.accent || '') ? s.accent : '#ff5500'));
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
        const a = document.createElement('a'); a.href = home; a.style.display = 'none';
        (document.body || document.documentElement).appendChild(a); a.click(); a.remove();
    }

    apply();
    window.addEventListener('storage', (e) => { if (e.key === 'scsp:settings') apply(); });
    window.addEventListener('sce:settings-change', apply);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', homeRedirect, { once: true }); else homeRedirect();
})();
