const DEFAULTS = {
    hijackPlayerShuffle: true, speedControl: true, library: true,
    hideUpsell: false, hidePromoted: false, hideUpload: false, hideArtistStudio: false, hideNotifications: false, hideMessages: false,
    hideComments: false, hideRelated: false, hideFooter: false,
    accent: '', homePage: '', blockAds: false,
};
const CHECKS = Object.keys(DEFAULTS).filter((k) => typeof DEFAULTS[k] === 'boolean');
const SWATCHES = ['#ff5500', '#1db954', '#e91e63', '#7c4dff', '#00b0ff', '#ffc107', '#ffffff'];
const $ = (id) => document.getElementById(id);
let settings = { ...DEFAULTS };

function paintSwatches() {
    $('swatches').innerHTML = SWATCHES.map((c) => `<button type="button" data-c="${c}" style="background:${c}" class="${(settings.accent || '#ff5500').toLowerCase() === c ? 'on' : ''}" title="${c}"></button>`).join('');
    $('accent').value = settings.accent || '#ff5500';
}

async function load() {
    const { settings: saved } = await chrome.storage.sync.get('settings');
    settings = { ...DEFAULTS, ...(saved || {}) };
    for (const k of CHECKS) $(k).checked = !!settings[k];
    $('homePage').value = settings.homePage || '';
    paintSwatches();
    const isBrave = !!(navigator.brave && await navigator.brave.isBrave?.());
    if (isBrave) $('ads-note').textContent = 'Brave bloque déjà les publicités avec ses Shields : laissez désactivé.';
}

async function save(patch) {
    settings = { ...settings, ...patch };
    await chrome.storage.sync.set({ settings });
    if ('blockAds' in patch) chrome.runtime.sendMessage({ type: 'set-ad-blocking', enabled: !!patch.blockAds }).catch(() => {});
    $('saved').textContent = 'Enregistré';
    setTimeout(() => { $('saved').textContent = ''; }, 1500);
}

CHECKS.forEach((k) => $(k).addEventListener('change', () => save({ [k]: $(k).checked })));
$('homePage').addEventListener('change', () => save({ homePage: $('homePage').value }));
$('accent').addEventListener('input', () => { save({ accent: $('accent').value.toLowerCase() === '#ff5500' ? '' : $('accent').value }); paintSwatches(); });
$('accent-reset').addEventListener('click', () => { save({ accent: '' }); paintSwatches(); });
$('swatches').addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (!b) return; save({ accent: b.dataset.c === '#ff5500' ? '' : b.dataset.c }); paintSwatches(); });
$('shortcuts').addEventListener('click', (e) => { e.preventDefault(); chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }); });
load();
