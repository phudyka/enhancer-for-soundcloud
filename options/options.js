const DEFAULTS = {
    extensionDisabled: false,
    shuffleMode: 'queue', speedControl: true, showAnalysis: true, library: true, noRepeat: true, history: true, panelPinSide: 'left', sampler: true,
    hideUpsell: false, hidePromoted: false, hideUpload: false, hideUploadMeter: false, hideArtistStudio: false, hideArtistTools: false, hideNotifications: false, hideMessages: false,
    hideComments: false, hideRelated: false, hideRelatedTracks: false, hideRelatedPlaylists: false, hideRelatedArtists: false, hideTrackStations: false, hideFooter: false, hideGoPlus: false, wideSearch: false, hideFeedReposts: false, hideFeedPlaylists: false,
    hideUpsellHeader: false, hideUpsellBanners: false, hideUpsellPlayer: false, hideUpsellSidebar: false, hideUpsellTracks: false, hideUpsellUpload: false, hideUpsellArtistLink: false, hideUpsellTour: false,
    hideCookieBanner: true,
    hideProfileInformation: false, hideProfileStation: false, hideProfileAll: false, hideProfilePopular: false,
    hideProfileTracks: false, hideProfileAlbums: false, hideProfilePlaylists: false, hideProfileReposts: false, hideProfileVinyl: false,
    hideNavProfile: false, hideNavLikes: false, hideNavPlaylists: false, hideNavStations: false, hideNavFollowing: false,
    hideNavSuggestions: false, hideNavArtistPro: false, hideNavBenefits: false, hideNavTracks: false, hideNavInsights: false, hideNavDistribute: false,
    hideArtistProPrompt: false,
    hideNavHome: false, hideNavStream: false, hideNavLibrary: false, hideLocale: false,
    hideSidebarNewTracks: false, hideSidebarWhoToFollow: false, hideSidebarLikes: false, hideSidebarHistory: false, hideSidebarInsights: false, hideSidebarMobile: false, hideRecentlyPlayed: false,
    hideStationAutoplay: false, hideCastButton: false, hidePipButton: false,
    accent: '', homePage: '', blockAds: false, oled: false,
    hiddenCustom: [], customizeMode: false,
};
const NO_CHECKBOX = new Set(['customizeMode', 'extensionDisabled', 'hideRelated', 'hideUpsell']);
const CHECKS = Object.keys(DEFAULTS).filter((k) => typeof DEFAULTS[k] === 'boolean' && !NO_CHECKBOX.has(k));
const FEATURE_KEYS = ['speedControl', 'showAnalysis', 'library', 'noRepeat', 'history', 'sampler', 'oled', 'blockAds'];
const LEGACY_GROUPS = {
    hideRelated: ['hideRelatedTracks', 'hideRelatedPlaylists', 'hideRelatedArtists', 'hideTrackStations'],
    hideUpsell: ['hideUpsellHeader', 'hideUpsellBanners', 'hideUpsellPlayer', 'hideUpsellSidebar', 'hideUpsellTracks', 'hideUpsellUpload', 'hideUpsellArtistLink', 'hideUpsellTour'],
};
const SWATCHES = ['#1db954', '#e91e63', '#7c4dff', '#00b0ff', '#ffc107', '#ffffff'];
const $ = (id) => document.getElementById(id);
const T = (s) => (window.SCE_T || ((x) => x))(s);
const hideGroups = [...document.querySelectorAll('fieldset')].map((fieldset) => ({
    fieldset,
    keys: [...fieldset.querySelectorAll('input[type="checkbox"][id^="hide"]')].map((input) => input.id),
})).filter((group) => group.keys.length);
for (const group of hideGroups) {
    const actions = document.createElement('div');
    actions.className = 'hide-group-actions';
    actions.innerHTML = `<button class="link" type="button" data-hide-all="true">${T('Tout masquer')}</button><button class="link" type="button" data-hide-all="false">${T('Tout réafficher')}</button>`;   // créés après le passage d'i18n.js
    group.fieldset.querySelector('legend').after(actions);
    actions.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-hide-all]');
        if (!button) return;
        const hidden = button.dataset.hideAll === 'true';
        const patch = Object.fromEntries(group.keys.map((key) => [key, hidden]));
        group.keys.forEach((key) => { $(key).checked = hidden; });
        await save(patch);
    });
}
const embedded = new URLSearchParams(location.search).has('embedded');
if (embedded) document.documentElement.classList.add('embedded');
const closeEmbedded = () => { if (embedded) window.parent.postMessage({ sce: 'close-settings' }, 'https://soundcloud.com'); };
if (embedded) document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeEmbedded(); });
let settings = { ...DEFAULTS };

function paintSwatches() {
    const color = settings.accent || '#ff5500';
    const rgb = color.slice(1).match(/../g).map((part) => {
        const channel = parseInt(part, 16) / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    document.documentElement.style.setProperty('--brand-mark', rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 0.179 ? '#111' : '#fff');
    $('swatches').innerHTML = SWATCHES.map((c) => `<button type="button" data-c="${c}" style="background:${c}" class="${(settings.accent || '#ff5500').toLowerCase() === c ? 'on' : ''}" title="${c}"></button>`).join('');
    $('accent').value = settings.accent || '#ff5500';
    $('accentHex').value = (settings.accent || '#ff5500').toUpperCase();
    $('custom').classList.toggle('on', !!settings.accent && !SWATCHES.includes(settings.accent.toLowerCase()));
    $('accent-reset').classList.toggle('on', !settings.accent);
}

/** Liste des masquages libres faits à la souris, avec réaffichage individuel. */
function customLabel(entry) {
    const [kind, rest] = [entry.slice(0, entry.indexOf(':')), entry.slice(entry.indexOf(':') + 1)];
    if (kind === 'text') { const i = rest.indexOf('|'); return { text: rest.slice(i + 1), detail: rest.slice(0, i) }; }
    if (kind === 'heading') return { text: rest, detail: T('module par titre') };
    if (kind === 'class') return { text: rest, detail: 'module' };
    return { text: rest, detail: T('sélecteur') };
}
function renderCustom() {
    const list = Array.isArray(settings.hiddenCustom) ? settings.hiddenCustom : [];
    $('custom-list').innerHTML = list.map((entry, i) => { const l = customLabel(entry); return `<div class="custom-item"><span title="${esc(entry)}">${esc(l.text)} <code>${esc(l.detail)}</code></span><button class="link" data-restore="${i}" type="button">${T('Réafficher')}</button></div>`; }).join('');
    $('custom-actions').hidden = list.length === 0;
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Reporte `settings` dans tous les champs (chargement, et modification depuis une autre page). */
function fill() {
    for (const k of CHECKS) $(k).checked = !!settings[k];
    $('extensionEnabled').checked = !settings.extensionDisabled;
    renderCustom();
    $('homePage').value = settings.homePage || '';
    $('shuffleMode').value = settings.shuffleMode || (settings.hijackPlayerShuffle === false ? 'native' : 'queue');
    $('panelPinSide').value = settings.panelPinSide === 'right' ? 'right' : 'left';
    paintSwatches();
    document.documentElement.style.setProperty('--accent', settings.accent || '#ff5500');
}

async function load() {
    const { settings: saved } = await chrome.storage.sync.get('settings');
    settings = { ...DEFAULTS, ...(saved || {}) };
    const migration = {};
    for (const [oldKey, keys] of Object.entries(LEGACY_GROUPS)) {
        if (!settings[oldKey]) continue;
        for (const key of keys) if (saved?.[key] === undefined) migration[key] = true;
        migration[oldKey] = false;
    }
    if (Object.keys(migration).length) {
        settings = { ...settings, ...migration };
        await chrome.storage.sync.set({ settings });
    }
    fill();
    const isBrave = !!(navigator.brave && await navigator.brave.isBrave?.());
    if (isBrave) $('ads-note').textContent = T('Brave bloque déjà les publicités avec ses Shields : laissez désactivé.');
}

async function save(patch) {
    settings = { ...settings, ...patch };
    if ('accent' in patch) document.documentElement.style.setProperty('--accent', settings.accent || '#ff5500');
    try { await chrome.storage.sync.set({ settings }); }
    catch (error) { console.warn('[SCE] réglages', error); $('saved').textContent = T('Enregistrement impossible, réessayez dans un instant'); return; }   // quota d'écritures de chrome.storage.sync
    if ('blockAds' in patch || 'extensionDisabled' in patch) chrome.runtime.sendMessage({ type: 'set-ad-blocking', enabled: !!settings.blockAds && !settings.extensionDisabled }).catch(() => {});
    $('saved').textContent = T('Enregistré');
    setTimeout(() => { $('saved').textContent = ''; }, 1500);
}

CHECKS.forEach((k) => $(k).addEventListener('change', () => save({ [k]: $(k).checked })));
$('extensionEnabled').addEventListener('change', () => save({ extensionDisabled: !$('extensionEnabled').checked }));
function activatePack(all) {
    const patch = { extensionDisabled: false, shuffleMode: 'queue' };
    for (const key of FEATURE_KEYS) patch[key] = all ? true : !!DEFAULTS[key];
    for (const key of FEATURE_KEYS) $(key).checked = patch[key];
    $('extensionEnabled').checked = true;
    $('shuffleMode').value = patch.shuffleMode;
    save(patch);
}
$('enable-recommended').addEventListener('click', () => activatePack(false));
$('enable-all').addEventListener('click', () => activatePack(true));
$('disable-all').addEventListener('click', () => {
    // Conserve les préférences pour pouvoir les retrouver avec un profil rapide.
    $('extensionEnabled').checked = false;
    save({ extensionDisabled: true, customizeMode: false });
});
$('restore-defaults').addEventListener('click', async () => {
    settings = { ...DEFAULTS };
    await chrome.storage.sync.set({ settings });
    chrome.runtime.sendMessage({ type: 'set-ad-blocking', enabled: !!settings.blockAds }).catch(() => {});
    await load();
    $('saved').textContent = T('Réglages par défaut rétablis');
});
$('shuffleMode').addEventListener('change', () => save({ shuffleMode: $('shuffleMode').value }));
$('homePage').addEventListener('change', () => save({ homePage: $('homePage').value }));
$('panelPinSide').addEventListener('change', () => save({ panelPinSide: $('panelPinSide').value === 'right' ? 'right' : 'left' }));
// Le sélecteur émet « input » en continu : aperçu immédiat, une seule écriture à la fin (chrome.storage.sync limite les écritures par minute).
let accentTimer = null;
$('accent').addEventListener('input', () => {
    const accent = $('accent').value.toLowerCase() === '#ff5500' ? '' : $('accent').value.toLowerCase();
    settings = { ...settings, accent };
    document.documentElement.style.setProperty('--accent', accent || '#ff5500');
    paintSwatches();
    clearTimeout(accentTimer); accentTimer = setTimeout(() => { accentTimer = null; save({ accent }); }, 300);
});
function saveHex() {
    const value = $('accentHex').value.trim();
    const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
    if (!match) { $('accentHex').setCustomValidity(T('Saisissez une couleur hexadécimale, par exemple #FF5500.')); $('accentHex').reportValidity(); return; }
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
$('start-pick').addEventListener('click', async () => { await save({ customizeMode: true }); closeEmbedded(); if (!embedded) chrome.runtime.sendMessage({ type: 'popup-focus-tab' }).catch(() => {}); });
$('custom-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-restore]'); if (!b) return;
    const list = (settings.hiddenCustom || []).filter((_, i) => i !== Number(b.dataset.restore));
    save({ hiddenCustom: list }); renderCustom();
});
$('custom-clear').addEventListener('click', () => { save({ hiddenCustom: [] }); renderCustom(); });
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.settings) {
        settings = { ...DEFAULTS, ...(changes.settings.newValue || {}), ...(accentTimer ? { accent: settings.accent } : {}) };   // couleur en cours de choix : l'aperçu local prime
        if (document.activeElement !== $('accentHex')) fill();
    }
});
// Recherche : ne garde que les lignes (ou les rubriques entières) dont le texte correspond, sans accents.
const fold = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function filterSettings() {
    const terms = fold($('settings-search').value).split(/\s+/).filter(Boolean);
    const matches = (text) => { const folded = fold(text); return terms.every((term) => folded.includes(term)); };
    let shown = 0;
    for (const fieldset of document.querySelectorAll('fieldset')) {
        const whole = !terms.length || matches(fieldset.querySelector('legend')?.textContent);
        let any = whole;
        for (const item of fieldset.children) {
            if (item.tagName === 'LEGEND') continue;
            const extra = item.matches('.hide-group-actions, .note');               // commandes et intertitres : seulement avec la rubrique entière
            const visible = whole || (!extra && matches(item.textContent));
            item.classList.toggle('filtered', !visible);
            if (visible && !extra) any = true;
        }
        fieldset.classList.toggle('filtered', !any);
        if (any) shown++;
    }
    $('settings-empty').hidden = shown > 0;
}
$('settings-search').addEventListener('input', filterSettings);
$('settings-search').addEventListener('keydown', (event) => { if (event.key === 'Escape' && $('settings-search').value) { event.stopPropagation(); $('settings-search').value = ''; filterSettings(); } });

$('open-guide').addEventListener('click', (e) => { e.preventDefault(); chrome.tabs.create({ url: chrome.runtime.getURL('guide/guide.html') }); });
load();
