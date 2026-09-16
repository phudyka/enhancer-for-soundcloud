const DEFAULTS = {
    hijackPlayerShuffle: true, speedControl: true, library: true, noRepeat: true, history: true, autoMix: false, autoMixSeconds: '12', sampler: true,
    hideUpsell: false, hidePromoted: false, hideUpload: false, hideUploadMeter: false, hideArtistStudio: false, hideArtistTools: false, hideNotifications: false, hideMessages: false,
    hideComments: false, hideRelated: false, hideFooter: false, hideGoPlus: false, wideSearch: false, hideFeedReposts: false, hideFeedPlaylists: false,
    hideCookieBanner: true,
    hideProfileInformation: false, hideProfileStation: false, hideProfileAll: false, hideProfilePopular: false,
    hideProfileTracks: false, hideProfileAlbums: false, hideProfilePlaylists: false, hideProfileReposts: false, hideProfileVinyl: false,
    hideNavProfile: false, hideNavLikes: false, hideNavPlaylists: false, hideNavStations: false, hideNavFollowing: false,
    hideNavSuggestions: false, hideNavArtistPro: false, hideNavBenefits: false, hideNavTracks: false, hideNavInsights: false, hideNavDistribute: false,
    hideArtistProPrompt: false,
    hideNavHome: false, hideNavStream: false, hideNavLibrary: false, hideLocale: false,
    hideSidebarNewTracks: false, hideSidebarWhoToFollow: false, hideSidebarLikes: false, hideSidebarHistory: false, hideSidebarMobile: false,
    accent: '', homePage: '', blockAds: false, oled: false,
    hiddenCustom: [], customizeMode: false,
};
const NO_CHECKBOX = new Set(['customizeMode']);
const CHECKS = Object.keys(DEFAULTS).filter((k) => typeof DEFAULTS[k] === 'boolean' && !NO_CHECKBOX.has(k));
const SWATCHES = ['#ff5500', '#1db954', '#e91e63', '#7c4dff', '#00b0ff', '#ffc107', '#ffffff'];
const $ = (id) => document.getElementById(id);
let settings = { ...DEFAULTS };

function paintSwatches() {
    $('swatches').innerHTML = SWATCHES.map((c) => `<button type="button" data-c="${c}" style="background:${c}" class="${(settings.accent || '#ff5500').toLowerCase() === c ? 'on' : ''}" title="${c}"></button>`).join('');
    $('accent').value = settings.accent || '#ff5500';
    $('accentHex').value = (settings.accent || '#ff5500').toUpperCase();
    $('custom').classList.toggle('on', !!settings.accent && !SWATCHES.includes(settings.accent.toLowerCase()));
}

/** Liste des masquages libres faits à la souris, avec réaffichage individuel. */
function customLabel(entry) {
    const [kind, rest] = [entry.slice(0, entry.indexOf(':')), entry.slice(entry.indexOf(':') + 1)];
    if (kind === 'text') { const i = rest.indexOf('|'); return { text: rest.slice(i + 1), detail: rest.slice(0, i) }; }
    if (kind === 'heading') return { text: rest, detail: (window.SCE_T || ((x) => x))('module par titre') };
    if (kind === 'class') return { text: rest, detail: 'module' };
    return { text: rest, detail: (window.SCE_T || ((x) => x))('sélecteur') };
}
function renderCustom() {
    const list = Array.isArray(settings.hiddenCustom) ? settings.hiddenCustom : [];
    const T = window.SCE_T || ((x) => x);
    $('custom-list').innerHTML = list.map((entry, i) => { const l = customLabel(entry); return `<div class="custom-item"><span title="${esc(entry)}">${esc(l.text)} <code>${esc(l.detail)}</code></span><button class="link" data-restore="${i}" type="button">${T('Réafficher')}</button></div>`; }).join('');
    $('custom-actions').hidden = list.length === 0;
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function load() {
    const { settings: saved } = await chrome.storage.sync.get('settings');
    settings = { ...DEFAULTS, ...(saved || {}) };
    for (const k of CHECKS) $(k).checked = !!settings[k];
    renderCustom();
    $('homePage').value = settings.homePage || '';
    $('autoMixSeconds').value = String(settings.autoMixSeconds || '12');
    paintSwatches();
    document.documentElement.style.setProperty('--accent', settings.accent || '#ff5500');
    const isBrave = !!(navigator.brave && await navigator.brave.isBrave?.());
    if (isBrave) $('ads-note').textContent = (window.SCE_T || ((x) => x))('Brave bloque déjà les publicités avec ses Shields : laissez désactivé.');
}

async function save(patch) {
    settings = { ...settings, ...patch };
    if ('accent' in patch) document.documentElement.style.setProperty('--accent', settings.accent || '#ff5500');
    await chrome.storage.sync.set({ settings });
    if ('blockAds' in patch) chrome.runtime.sendMessage({ type: 'set-ad-blocking', enabled: !!patch.blockAds }).catch(() => {});
    $('saved').textContent = (window.SCE_T || ((x) => x))('Enregistré');
    setTimeout(() => { $('saved').textContent = ''; }, 1500);
}

CHECKS.forEach((k) => $(k).addEventListener('change', () => save({ [k]: $(k).checked })));
$('homePage').addEventListener('change', () => save({ homePage: $('homePage').value }));
$('autoMixSeconds').addEventListener('change', () => save({ autoMixSeconds: $('autoMixSeconds').value }));
$('accent').addEventListener('input', () => { save({ accent: $('accent').value.toLowerCase() === '#ff5500' ? '' : $('accent').value }); paintSwatches(); });
function saveHex() {
    const value = $('accentHex').value.trim();
    const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
    if (!match) { $('accentHex').setCustomValidity('Saisissez une couleur hexadécimale, par exemple #FF5500.'); $('accentHex').reportValidity(); return; }
    $('accentHex').setCustomValidity('');
    const digits = match[1].length === 3 ? [...match[1]].map((c) => c + c).join('') : match[1];
    const color = `#${digits.toLowerCase()}`;
    save({ accent: color === '#ff5500' ? '' : color });
    paintSwatches();
}
$('accentHex').addEventListener('change', saveHex);
$('accentHex').addEventListener('input', () => $('accentHex').setCustomValidity(''));
$('accentHex').addEventListener('blur', () => { if ($('accentHex').validity.customError) { $('accentHex').setCustomValidity(''); paintSwatches(); } });
$('accent-reset').addEventListener('click', () => { save({ accent: '' }); paintSwatches(); });
$('swatches').addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (!b) return; save({ accent: b.dataset.c === '#ff5500' ? '' : b.dataset.c }); paintSwatches(); });
$('shortcuts').addEventListener('click', (e) => { e.preventDefault(); chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }); });
$('open-stats').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('stats/stats.html') }));
$('start-pick').addEventListener('click', async () => { await save({ customizeMode: true }); chrome.runtime.sendMessage({ type: 'popup-focus-tab' }).catch(() => {}); });
$('custom-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-restore]'); if (!b) return;
    const list = (settings.hiddenCustom || []).filter((_, i) => i !== Number(b.dataset.restore));
    save({ hiddenCustom: list }); renderCustom();
});
$('custom-clear').addEventListener('click', () => { save({ hiddenCustom: [] }); renderCustom(); });
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.settings) { settings = { ...DEFAULTS, ...(changes.settings.newValue || {}) }; renderCustom(); }
});
$('open-guide').addEventListener('click', (e) => { e.preventDefault(); chrome.tabs.create({ url: chrome.runtime.getURL('guide/guide.html') }); });
load();
