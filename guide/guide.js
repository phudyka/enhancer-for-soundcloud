/* Guide intégré : bascule de langue et liens vers les pages de l'extension. */
const uiLang = (chrome.i18n?.getUILanguage?.() || navigator.language || 'en').slice(0, 2).toLowerCase() === 'fr' ? 'fr' : 'en';
function showLang(lang) {
    document.documentElement.lang = lang;
    document.querySelectorAll('section[data-lang]').forEach((s) => { s.hidden = s.dataset.lang !== lang; });
    document.querySelectorAll('.lang button').forEach((b) => b.classList.toggle('on', b.dataset.lang === lang));
    document.title = lang === 'fr' ? 'Enhancer for SoundCloud™ — Guide' : 'Enhancer for SoundCloud™ — Guide';
}
document.querySelectorAll('.lang button').forEach((b) => b.addEventListener('click', () => showLang(b.dataset.lang)));
document.querySelectorAll('[data-open]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    const what = a.dataset.open;
    if (what === 'options') chrome.runtime.openOptionsPage();
    else if (what === 'stats') chrome.tabs.create({ url: chrome.runtime.getURL('stats/stats.html') });
    else if (what === 'shortcuts') chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
}));
chrome.storage?.sync?.get('settings').then(({ settings }) => {
    if (settings?.accent) document.documentElement.style.setProperty('--accent', settings.accent);
}).catch(() => {});
showLang(uiLang);
