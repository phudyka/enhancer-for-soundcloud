const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('profile and promotional items can be hidden independently and restored', () => {
    const classes = () => {
        const active = new Set();
        return { active, add: (name) => active.add(name), remove: (name) => active.delete(name), contains: (name) => active.has(name) };
    };
    const item = (text, kind) => ({ textContent: text, kind, classList: classes(), matches(selector) { return selector.split(',').some((part) => part.trim() === this.kind || part.trim().endsWith(` ${this.kind}`) || part.trim() === `.${this.kind}`); }, closest(selector) { return this.kind === 'nav' && selector.includes('nav') ? this : null; }, querySelector() { return null; } });
    const station = item('Station', 'button');
    const information = item('Vos informations', 'button');
    const popular = item('Titres populaires', '.g-tabs-link');
    const tracks = item('Titres', '.g-tabs-link');
    const promo = item('Essayez Artist Pro pour bénéficier d’uploads illimités.', 'p');
    const promoLink = item('Essayez Artist Pro', 'a');
    const promoContainer = item('Essayez Artist Pro pour bénéficier d’uploads illimités.', 'div');
    promoLink.parentElement = promoContainer;
    const navLikes = item('Favoris', 'nav');
    const nodes = [station, information, popular, tracks, promo, promoLink, navLikes];
    const values = new Map([['scsp:settings', JSON.stringify({ hideProfileStation: true, hideProfilePopular: true, hideArtistProPrompt: true, hideNavLikes: true })]]);
    const listeners = {};
    const style = { textContent: '' };
    const matrix = { setAttribute(name, value) { if (name === 'values') this.values = value; } };
    let waveFilter;
    const document = {
        readyState: 'loading',
        documentElement: { style: { setProperty() {} }, appendChild(node) { waveFilter = node; } },
        head: { appendChild() {} },
        createElement: () => style,
        createElementNS(_namespace, tag) { return tag === 'feColorMatrix' ? matrix : { style: {}, setAttribute() {}, appendChild() {}, querySelector() { return matrix; } }; },
        getElementById() { return waveFilter; },
        querySelectorAll(selector) { return selector.includes('h2, h3') ? [] : nodes; },
        addEventListener() {},
    };
    const window = { addEventListener: (name, callback) => { listeners[name] = callback; } };
    const context = { window, document, localStorage: { getItem: (key) => values.get(key) ?? null }, location: { pathname: '/example' }, MutationObserver: class { observe() {} disconnect() {} }, requestAnimationFrame: (callback) => callback(), Node: { TEXT_NODE: 3 } };
    vm.runInNewContext(fs.readFileSync('content/appearance.js', 'utf8'), context);
    assert.equal(typeof listeners['sce:settings-change'], 'function');

    assert.equal(station.classList.active.has('sce-look-profile-station'), true);
    assert.equal(popular.classList.active.has('sce-look-profile-popular'), true);
    assert.equal(promo.classList.active.has('sce-look-artist-pro-prompt'), true);
    assert.equal(promoContainer.classList.active.has('sce-look-artist-pro-prompt'), true);
    assert.equal(navLikes.classList.active.has('sce-look-nav-likes'), true);
    assert.equal(information.classList.active.size, 0);
    assert.equal(tracks.classList.active.size, 0);

    values.set('scsp:settings', '{}');
    listeners.storage({ key: 'scsp:settings' });
    assert.equal(station.classList.active.size, 0);
    assert.equal(popular.classList.active.size, 0);
    assert.equal(promo.classList.active.size, 0);
    assert.equal(promoContainer.classList.active.size, 0);
    assert.equal(navLikes.classList.active.size, 0);

    values.set('scsp:settings', JSON.stringify({ hideUpsell: true }));
    listeners.storage({ key: 'scsp:settings' });
    assert.equal(style.textContent.includes('.spotlight__upsellBanner'), true);
    assert.equal(style.textContent.includes('a[href^="https://checkout.soundcloud.com/artist"]'), true);
    assert.equal(style.textContent.includes('.quotaMeter__upsellText'), true);

    values.set('scsp:settings', '{}');
    listeners.storage({ key: 'scsp:settings' });
    assert.equal(style.textContent.includes('.spotlight__upsellBanner'), false);
    assert.equal(style.textContent.includes('a[href^="https://checkout.soundcloud.com/artist"]'), false);
    assert.equal(style.textContent.includes('.quotaMeter__upsellText'), false);

    values.set('scsp:settings', JSON.stringify({ hideUpsellTour: true, hideRelatedTracks: true }));
    listeners.storage({ key: 'scsp:settings' });
    assert.equal(style.textContent.includes('.sce-look-tour-upsell { display: none !important; }'), true);
    assert.equal(style.textContent.includes('.l-sidebar-right .sidebarModule:has(.relatedSoundsModule) { display: none !important; }'), true);
    assert.equal(style.textContent.includes('.l-sidebar-right .sidebarModule:has(.soundInSetsModule)'), false);
    assert.equal(style.textContent.includes('.quotaMeter__upsellText'), false);

    values.set('scsp:settings', JSON.stringify({ hideUploadMeter: true }));
    listeners.storage({ key: 'scsp:settings' });
    assert.equal(style.textContent.includes('.quotaMeter { display: none !important; }'), true);

    values.set('scsp:settings', '{}');
    listeners.storage({ key: 'scsp:settings' });
    assert.equal(style.textContent.includes('.quotaMeter { display: none !important; }'), false);

    values.set('scsp:settings', JSON.stringify({ hideRecentlyPlayed: true }));
    listeners.storage({ key: 'scsp:settings' });
    assert.equal(style.textContent.includes('.collection__historyContextsSection { display: none !important; }'), true);
    values.set('scsp:settings', '{}');
    listeners.storage({ key: 'scsp:settings' });
    assert.equal(style.textContent.includes('.collection__historyContextsSection { display: none !important; }'), false);

    values.set('scsp:settings', JSON.stringify({ hideSidebarInsights: true, hideStationAutoplay: true }));
    listeners.storage({ key: 'scsp:settings' });
    assert.equal(style.textContent.includes('.insightsSidebarModule { display: none !important; }'), true);
    assert.equal(style.textContent.includes('.queueFallback__stationMode { display: none !important; }'), true);
    values.set('scsp:settings', '{}');
    listeners.storage({ key: 'scsp:settings' });
    assert.equal(style.textContent.includes('.insightsSidebarModule { display: none !important; }'), false);
    assert.equal(style.textContent.includes('.queueFallback__stationMode { display: none !important; }'), false);

    values.set('scsp:settings', JSON.stringify({ accent: '#ffffff' }));
    listeners.storage({ key: 'scsp:settings' });
    assert.match(style.textContent, /\.sc-button-primary, \.sc-button-primary \* \{ color: #111 !important; \}/);
    assert.match(style.textContent, /\.queueItemView__title \* \{ color: #111 !important; \}/);

    values.set('scsp:settings', JSON.stringify({ accent: '#222222' }));
    listeners.storage({ key: 'scsp:settings' });
    assert.match(style.textContent, /\.sc-button-primary, \.sc-button-primary \* \{ color: #fff !important; \}/);
    assert.match(style.textContent, /\.queueFallback__stationMode \.sc-toggle\.sc-toggle-on::before \{ background-color: #222222 !important; \}/);
    const coefficients = matrix.values.split(' ').map(Number);
    assert.equal(coefficients.length, 20);
    for (let channel = 0; channel < 3; channel++) {
        const row = coefficients.slice(channel * 5, channel * 5 + 5);
        assert.ok(Math.abs((row[0] * 255 + row[1] * 85 + row[4] * 255) - 34) < 0.001);
        assert.ok(Math.abs((row[0] + row[1] + row[2]) * 128 + row[4] * 255 - 128) < 0.001);
    }
});


test('header tabs, titled modules and free-form entries are hidden and restored', () => {
    const classes = () => { const active = new Set(); return { active, add: (n) => active.add(n), remove: (n) => active.delete(n), contains: (n) => active.has(n) }; };
    const item = (text, kinds, heading) => ({ textContent: text, kinds, classList: classes(), matches(selector) { return kinds.some((k) => selector.includes(k)); }, closest() { return null; }, querySelector(sel) { return sel.includes('h1') && heading ? { textContent: heading } : null; } });
    const home = item('Accueil', ['.header__navMenuItem', 'a.header__navMenuItem']);
    const feed = item("Fil d'actualités", ['.header__navMenuItem', 'a.header__navMenuItem']);
    const mobile = item('Passer sur mobile Téléchargez', ['.sidebarModule'], 'Passer sur mobile');
    const mixed = item('Mixé pour SNAVUS MIX 1', ['.mixedSelectionModule'], 'Mixé pour SNAVUS');
    const nodes = [home, feed, mobile, mixed];
    const values = new Map([['scsp:settings', JSON.stringify({ hideNavHome: true, hideSidebarMobile: true, hiddenCustom: ['heading:mixé pour snavus', "text:a.header__navMenuItem|Fil d'actualités", 'sel:div.footer__localeSelector', 'class:whoToFollowModule'] })]]);
    const listeners = {};
    const style = { textContent: '' };
    const document = { readyState: 'loading', documentElement: { style: { setProperty() {} } }, head: { appendChild() {} }, createElement: () => style, querySelectorAll(selector) { return selector.includes('h2, h3') ? [] : nodes; }, addEventListener() {} };
    const window = { addEventListener: (name, callback) => { listeners[name] = callback; } };
    const context = { window, document, localStorage: { getItem: (key) => values.get(key) ?? null }, location: { pathname: '/discover' }, MutationObserver: class { observe() {} disconnect() {} }, requestAnimationFrame: (callback) => callback(), Node: { TEXT_NODE: 3 } };
    vm.runInNewContext(fs.readFileSync('content/appearance.js', 'utf8'), context);
    assert.equal(home.classList.active.has('sce-look-nav-home'), true);
    assert.equal(feed.classList.active.has('sce-look-nav-home'), false);
    assert.equal(feed.classList.active.has('sce-look-custom-hidden'), true);
    assert.equal(mobile.classList.active.has('sce-look-sidebar-mobile'), true);
    assert.equal(mixed.classList.active.has('sce-look-custom-hidden'), true);
    assert.match(style.textContent, /div\.footer__localeSelector, \.whoToFollowModule \{ display: none !important; \}/);
    assert.match(style.textContent, /\.sce-look-nav-home \{ display: none !important; \}/);
    values.set('scsp:settings', '{}');
    listeners.storage({ key: 'scsp:settings' });
    assert.equal(home.classList.active.size, 0);
    assert.equal(feed.classList.active.size, 0);
    assert.equal(mixed.classList.active.size, 0);
});
