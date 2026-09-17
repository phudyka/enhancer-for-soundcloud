const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

/* DOM minimal : arbre d'éléments, écouteurs, recherche par balise. */
class El {
    constructor(tag) { this.tag = tag; this.children = []; this.listeners = {}; this.isConnected = false; this.textContent = ''; this.className = ''; }
    setAttribute() {}
    append(...nodes) { nodes.forEach((n) => this.appendChild(n)); }
    appendChild(node) { node.parent = this; node.isConnected = true; this.children.push(node); return node; }
    replaceChildren() { this.children = []; }
    remove() { this.isConnected = false; if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); }
    addEventListener(type, fn) { this.listeners[type] = fn; }
    focus() {} select() {}
    all(tag) { return this.children.flatMap((c) => [...(c.tag === tag ? [c] : []), ...c.all(tag)]); }
    querySelector(sel) { return this.all(sel)[0] || null; }
    querySelectorAll(sel) { return sel.split(',').flatMap((s) => this.all(s.trim())); }
    click() { this.listeners.click?.({}); }
}
function dialog(lang = 'fr') {
    const body = new El('body');
    const document = { documentElement: { lang }, body, head: new El('head'), activeElement: null, createElement: (tag) => new El(tag), getElementById: () => null };
    const window = {};
    vm.runInNewContext(fs.readFileSync('content/dialog.js', 'utf8'), { window, document, localStorage: { getItem: () => '{}' }, Promise });
    return { api: window.__sceDialog, body };
}

test('confirm resolves true on the action button, false on cancel and on Escape', async () => {
    const { api, body } = dialog();
    let answer = api.confirm('Retirer 3 titres ?', { ok: 'Retirer', danger: true });
    const [cancel, ok] = body.all('button');
    assert.deepEqual([cancel.textContent, ok.textContent, ok.className], ['Annuler', 'Retirer', 'm-ok m-danger']);
    ok.click();
    assert.equal(await answer, true);
    assert.equal(body.children.length, 0);
    answer = api.confirm('Encore ?'); body.all('button')[0].click();
    assert.equal(await answer, false);
    answer = api.confirm('Encore ?');
    body.children[0].listeners.keydown({ key: 'Escape', stopPropagation() {}, preventDefault() {} });
    assert.equal(await answer, false);
});

test('pick filters long lists without accents and returns the index in the original list', async () => {
    const { api, body } = dialog('en');
    const items = ['Été 2024', 'House', 'Techno', 'Ambient', 'Drum & Bass', 'Jazz', 'Disco', 'Dub', 'Électro'].map((label, i) => ({ label, detail: i }));
    const answer = api.pick('Add to playlist', items);
    const filter = body.all('input')[0];
    assert.equal(filter.placeholder, 'Filter…');
    filter.value = 'elec'; filter.listeners.input();
    const rows = body.all('li');
    assert.equal(rows.length, 1);
    rows[0].all('button')[0].click();
    assert.equal(await answer, 8);
});

test('input returns the typed text, null when cancelled, and a new dialog cancels the previous one', async () => {
    const { api, body } = dialog();
    const first = api.input('Nom de la playlist', 'Likes');
    const second = api.input('Nom de la playlist', 'Likes');
    assert.equal(await first, null);
    const field = body.all('input')[0];
    assert.equal(field.value, 'Likes');
    field.value = 'Ma sélection';
    field.listeners.keydown({ key: 'Enter', preventDefault() {} });
    assert.equal(await second, 'Ma sélection');
});
