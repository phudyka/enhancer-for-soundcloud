const DEFAULTS = { hijackPlayerShuffle: true, speedControl: true };
const ids = Object.keys(DEFAULTS);

async function load() {
    const { settings } = await chrome.storage.sync.get('settings');
    const s = { ...DEFAULTS, ...(settings || {}) };
    for (const id of ids) document.getElementById(id).checked = !!s[id];
}

async function save() {
    const settings = Object.fromEntries(ids.map((id) => [id, document.getElementById(id).checked]));
    await chrome.storage.sync.set({ settings });
    const el = document.getElementById('saved');
    el.textContent = 'Enregistré';
    setTimeout(() => { el.textContent = ''; }, 1500);
}

ids.forEach((id) => document.getElementById(id).addEventListener('change', save));
document.getElementById('shortcuts').addEventListener('click', (e) => { e.preventDefault(); chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }); });
load();
