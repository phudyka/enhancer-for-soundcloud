const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const plain = (value) => JSON.parse(JSON.stringify(value));

/* DOM minimal : éléments avec classes, parent, texte, closest/matches par classes. */
function el(tag, classes = [], { text = '', children = [], heading = null } = {}) {
    const node = {
        tagName: tag.toUpperCase(), classList: new Set(classes), textContent: text, parentElement: null, children, style: { setProperty() {}, removeProperty() {} },
        matches(sel) { return sel.split(',').some((part) => part.trim().split('.').slice(1).every((c) => node.classList.has(c)) && (part.trim().startsWith('.') || part.trim().split('.')[0] === tag)); },
        closest(sel) { let cur = node; while (cur) { if (cur.matches(sel)) return cur; cur = cur.parentElement; } return null; },
        querySelector(sel) { return sel.includes('h1') ? heading : null; },
    };
    for (const c of children) c.parentElement = node;
    return node;
}

function load(all) {
    const document = {
        documentElement: { lang: 'fr' }, body: el('body'),
        querySelectorAll(sel) { return all.filter((n) => { try { return n.matches(sel.replace(/\s+/g, ' ').split(' ').pop()); } catch { return false; } }); },
        getElementById: () => null, createElement: () => ({ style: {}, addEventListener() {}, remove() {} }), addEventListener() {}, removeEventListener() {}, head: { appendChild() {} },
    };
    const window = { addEventListener() {}, postMessage() {} };
    const context = { window, document, localStorage: { getItem: () => '{}' }, location: { origin: 'https://soundcloud.com' }, CSS: { escape: (s) => s }, setTimeout, console };
    vm.runInNewContext(fs.readFileSync('content/customize.js', 'utf8'), context);
    return window.__scePick;
}

test('a known SoundCloud module is stored by its class, a titled module by its heading', () => {
    const who = el('div', ['sidebarModule', 'whoToFollowModule', 'g-all-transitions-200-linear'], { text: 'Artistes que vous devriez suivre. slooon Suivre' });
    const mobile = el('div', ['sidebarModule'], { text: 'Passer sur mobile Téléchargez', heading: { textContent: ' Passer sur mobile ' } });
    const pick = load([who, mobile]);
    assert.deepEqual(plain(pick.entryFor(who)), { entry: 'class:whoToFollowModule', label: 'Artistes que vous devriez suivre. slooon' });
    assert.deepEqual(plain(pick.entryFor(mobile)), { entry: 'heading:passer sur mobile', label: 'Passer sur mobile' });
});

test('a link among siblings is stored by selector and text, a unique element by selector alone', () => {
    const home = el('a', ['header__navMenuItem', 'sc-mr-1x'], { text: 'Accueil' });
    const feed = el('a', ['header__navMenuItem', 'sc-mr-1x', 'selected'], { text: "Fil d'actualités" });
    const nav = el('div', ['header__middle'], { children: [home, feed] });
    const locale = el('div', ['footer__localeSelector', 'sc-mt-3x'], { text: 'Langue : Français' });
    const pick = load([home, feed, nav, locale]);
    assert.deepEqual(plain(pick.entryFor(home)), { entry: 'text:a.header__navMenuItem|Accueil', label: 'Accueil' });
    assert.deepEqual(plain(pick.entryFor(locale)), { entry: 'sel:div.footer__localeSelector', label: 'Langue : Français' });
});

test('hovering a fragment targets its enclosing module', () => {
    const inner = el('span', ['sc-text'], { text: 'x' });
    const module = el('div', ['sidebarModule', 'likesModule'], { children: [el('div', ['sc-p'], { children: [inner] })] });
    module.children[0].parentElement = module;
    const pick = load([module]);
    assert.equal(pick.target(inner), module);
});

test('the player bar stays visible while an extension control can be selected', () => {
    const icon = el('span', ['sc-icon']);
    const pin = el('button', ['sce-pip-pin', 'sc-button'], { children: [icon] });
    const bar = el('div', ['playControls'], { children: [pin] });
    const pick = load([bar, pin, icon]);
    assert.equal(pick.target(bar), null);
    assert.equal(pick.target(icon), pin);
    assert.equal(pick.entryFor(pin).entry, 'sel:button.sce-pip-pin');
});
