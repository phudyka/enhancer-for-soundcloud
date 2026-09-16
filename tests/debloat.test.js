const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('profile and promotional items can be hidden independently and restored', () => {
    const classes = () => {
        const active = new Set();
        return { active, add: (name) => active.add(name), remove: (name) => active.delete(name), contains: (name) => active.has(name) };
    };
    const item = (text, kind) => ({ textContent: text, kind, classList: classes(), matches(selector) { return selector.includes(this.kind); }, closest(selector) { return this.kind === 'nav' && selector.includes('nav') ? this : null; } });
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
    const document = {
        readyState: 'loading',
        documentElement: { style: { setProperty() {} } },
        head: { appendChild() {} },
        createElement: () => style,
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

    values.set('scsp:settings', JSON.stringify({ hideUploadMeter: true }));
    listeners.storage({ key: 'scsp:settings' });
    assert.equal(style.textContent.includes('.quotaMeter { display: none !important; }'), true);

    values.set('scsp:settings', '{}');
    listeners.storage({ key: 'scsp:settings' });
    assert.equal(style.textContent.includes('.quotaMeter { display: none !important; }'), false);

    values.set('scsp:settings', JSON.stringify({ accent: '#ffffff' }));
    listeners.storage({ key: 'scsp:settings' });
    assert.match(style.textContent, /\.sc-button-primary, \.sc-button-primary \* \{ color: #111 !important; \}/);

    values.set('scsp:settings', JSON.stringify({ accent: '#222222' }));
    listeners.storage({ key: 'scsp:settings' });
    assert.match(style.textContent, /\.sc-button-primary, \.sc-button-primary \* \{ color: #fff !important; \}/);
});
