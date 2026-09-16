/* Enhancer for SoundCloud™ — i18n des pages de l'extension. Les pages sont écrites en français ;
   pour toute autre langue d'interface, les chaînes connues sont remplacées par leur version anglaise.
   (Les modules injectés dans soundcloud.com ont leur propre dictionnaire multilingue.) */
const SCE_I18N = {
 "Réglages": "Settings",
 "Raccourcis clavier": "Keyboard shortcuts",
 "Aller à l'onglet SoundCloud": "Go to the SoundCloud tab",
 "Shuffle+ de la lecture en cours (Maj+clic : resynchro)": "True shuffle of what is playing (Shift+click: resync)",
 "Précédent": "Previous",
 "Lecture / pause": "Play / pause",
 "Suivant": "Next",
 "Répéter": "Repeat",
 "Vitesse de lecture (clic : suivante, Maj+clic : précédente)": "Playback speed (click: next, Shift+click: previous)",
 "Lecteur épinglable, toujours au premier plan": "Pinnable player, always on top",
 "Aucune lecture SoundCloud en cours.": "Nothing playing on SoundCloud.",
 "Ouvrir SoundCloud": "Open SoundCloud",
 "Tout tourne dans votre navigateur. Aucune donnée n'est envoyée ailleurs. Les changements s'appliquent immédiatement.": "Everything runs in your browser. No data is sent anywhere. Changes apply immediately.",
 "Lecture": "Playback",
 "Le bouton « Aléatoire » du lecteur lance un vrai shuffle": "The player's Shuffle button starts a true shuffle",
 "Alt+clic conserve le shuffle natif de SoundCloud.": "Alt+click keeps SoundCloud's native shuffle.",
 "Shuffle+ sans répétition": "Shuffle+ without repeats",
 "Chaque shuffle tire parmi les titres pas encore joués, jusqu'à épuisement de la bibliothèque, puis nouveau tour.": "Each shuffle draws from tracks not played yet, until the library is exhausted, then a new round starts.",
 "Panneau Audio à gauche du volume : vitesse, bass boost, réverb, presets": "Audio panel left of the volume: speed, bass boost, reverb, presets",
 "Slowed + Reverb, Nightcore, Bass boost. Raccourcis : Maj+, Maj+. Maj+0.": "Slowed + Reverb, Nightcore, Bass boost. Shortcuts: Shift+, Shift+. Shift+0.",
 "Bibliothèque des likes : recherche, tri, genres, création de playlists": "Likes library: search, sort, genres, playlist creation",
 "Sur la page Favoris. L'index local se construit en quelques secondes la première fois.": "On the Likes page. The local index builds in a few seconds the first time.",
 "Masquer": "Hide",
 "Promotions Go+ et Artist Pro": "Go+ and Artist Pro promotions",
 "Liens de l'en-tête, bannières produit, panneau du lecteur.": "Header links, product banners, player panel.",
 "Titres sponsorisés dans les listes": "Promoted tracks in lists",
 "Titres Go+ dans les recherches et les listes": "Go+ tracks in search results and lists",
 "Utile sans abonnement : ces titres ne jouent que 30 secondes.": "Useful without a subscription: these tracks only play 30 seconds.",
 "Barre de recherche élargie": "Wider search bar",
 "Automatique dès qu'un élément de l'en-tête est masqué.": "Automatic as soon as a header item is hidden.",
 "Bouton « Uploader »": "“Upload” button",
 "Lien « Studio de l'artiste »": "“Artist studio” link",
 "Cloche des notifications": "Notifications bell",
 "Icône des messages": "Messages icon",
 "Commentaires sous les titres": "Comments under tracks",
 "Modules latéraux : titres similaires, dans les playlists, artistes à suivre": "Sidebar modules: related tracks, in playlists, artists to follow",
 "Liens de pied de page dans la colonne de droite": "Footer links in the right column",
 "Reposts dans le fil d'actualités": "Reposts in the Feed",
 "Ne garder que les nouveautés des artistes suivis.": "Keep only new releases from artists you follow.",
 "Playlists et albums dans le fil d'actualités": "Playlists and albums in the Feed",
 "Apparence": "Appearance",
 "Couleur d'accent": "Accent color",
 "Remplace l'orange sur les boutons de lecture, la progression, les états actifs.": "Replaces the orange on play buttons, progress and active states.",
 "Couleur personnalisée": "Custom color",
 "Revenir à l'orange SoundCloud": "Back to SoundCloud orange",
 "Défaut": "Default",
 "Page d'accueil": "Home page",
 "Page ouverte à l'arrivée sur soundcloud.com, à la place de Découvrir.": "Page opened when arriving on soundcloud.com, instead of Discover.",
 "Découvrir (défaut)": "Discover (default)",
 "Fil d'actualités": "Feed",
 "Favoris": "Likes",
 "Bibliothèque": "Library",
 "Playlists": "Playlists",
 "Historique": "History",
 "Publicités": "Ads",
 "Bloquer les publicités et traceurs tiers sur soundcloud.com": "Block third-party ads and trackers on soundcloud.com",
 "Liste de domaines publicitaires tiers, appliquée par le navigateur sans lire les pages. Inutile si un bloqueur est déjà actif.": "A list of third-party ad domains, enforced by the browser without reading pages. Unnecessary if a blocker is already active.",
 "Raccourcis globaux": "Global shortcuts",
 "Shuffle+, lecture/pause, lecteur épinglable : fonctionnent même quand l'onglet n'a pas le focus. Modifiez-les dans": "Shuffle+, play/pause, pinnable player: work even when the tab is not focused. Edit them in",
 "Enregistré": "Saved",
 "Enhancer for SoundCloud™ est un projet indépendant, sans lien avec SoundCloud. SoundCloud est une marque de SoundCloud Global Limited & Co. KG.": "Enhancer for SoundCloud™ is an independent project, not affiliated with SoundCloud. SoundCloud is a trademark of SoundCloud Global Limited & Co. KG.",
 "Brave bloque déjà les publicités avec ses Shields : laissez désactivé.": "Brave already blocks ads with Shields: leave this off."
};

(function () {
    const lang = (chrome.i18n?.getUILanguage?.() || navigator.language || 'en').slice(0, 2).toLowerCase();
    if (lang === 'fr') return;
    document.documentElement.lang = 'en';
    const tr = (s) => { const k = s.trim(); return k && SCE_I18N[k] !== undefined ? s.replace(k, SCE_I18N[k]) : s; };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const n of nodes) { const v = tr(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; }
    for (const el of document.querySelectorAll('[title], [placeholder]')) {
        for (const a of ['title', 'placeholder']) { const v = el.getAttribute(a); if (v && SCE_I18N[v]) el.setAttribute(a, SCE_I18N[v]); }
    }
    window.SCE_T = (s) => SCE_I18N[s] || s;
})();
