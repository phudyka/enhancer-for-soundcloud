# Enhancer for SoundCloud™

Extension navigateur (Manifest V3) qui améliore l'écoute sur soundcloud.com. Tout tourne localement, aucune donnée ne quitte le navigateur.

## Fonctions (v0.9.0)

- **Shuffle+** : vrai shuffle instantané des Likes, playlists et sets Discover via l'API interne, playlist tampon privée, bouton du lecteur détourné. **Sans répétition** : chaque shuffle tire parmi les titres pas encore joués, tour après tour. Reprise du userscript [soundcloud-shuffle-plus](https://github.com/phudyka/soundcloud-shuffle-plus).
- **Audio** : bouton jauge à gauche du volume, orange quand actif. Vitesse 0,1× à 3× sur un curseur logarithmique avec aimant sur 1×, conservation de la hauteur, bass boost jusqu'à +12 dB, réverbération, presets Slowed + Reverb, Nightcore, Bass boost. **Analyse en direct : BPM et tonalité avec code Camelot**, affinés sur les 30 premières secondes, corrigés de la vitesse, mémorisés par titre. Traitement Web Audio sur le flux SoundCloud. Raccourcis Maj+, Maj+. Maj+0.
- **Lecteur épinglable** : fenêtre Picture-in-Picture toujours au premier plan (Chromium 116+, repli en fenêtre popup ailleurs), pochette, titre, progression cliquable, précédent / lecture / suivant / Shuffle+ / répéter, dans le langage visuel du lecteur SoundCloud. Bouton 📌 dans la barre du lecteur, depuis le popup, ou par raccourci.
- **Popup** : titre en cours, précédent / lecture / suivant / Shuffle+, historique des derniers shuffles.
- **Raccourcis globaux** : Shuffle+ et lecture/pause même quand l'onglet n'a pas le focus.
- **Bibliothèque des likes** sur `/you/likes` : recherche instantanée sur titre, artiste et tags, tri par date d'ajout, titre, artiste, durée, écoutes ou année, filtre par genre. Résultats en badges ou en liste selon le choix natif « Afficher » ; un clic sur un titre le lit seul. Sur la sélection : lire dans l'ordre, Shuffle+, ou créer une playlist. Index local dans IndexedDB, construit en quelques secondes puis mis à jour incrémentalement.
- **Apparence** : masquage à la carte (promotions Go+ et Artist Pro, titres sponsorisés, titres Go+ sans abonnement, reposts et playlists du fil d'actualités, Uploader, Studio de l'artiste, notifications, messages, commentaires, modules latéraux, pied de page), couleur d'accent personnalisée, page d'accueil au choix.
- **Publicités** : blocage optionnel des domaines publicitaires et traceurs tiers via declarativeNetRequest, sans lecture des pages. Désactivé par défaut, inutile sur Brave.
- **Réglages** synchronisés entre appareils.

## Installer en mode développeur

1. `brave://extensions` (ou `chrome://extensions`), activer le **Mode développeur**.
2. **Charger l'extension non empaquetée**, choisir ce dossier.
3. Ouvrir soundcloud.com. Désactiver le userscript Shuffle+ dans Tampermonkey pour éviter le doublon.

## Architecture

```
manifest.json
content/
  media-hook.js   document_start, monde principal : capture l'<audio> de SoundCloud (créé hors DOM)
  appearance.js   document_start, monde principal : masquage, couleur d'accent, page d'accueil
  shuffle.js      monde principal : module Shuffle+ (dérivé du userscript), expose window.__scsp aux autres modules
  library.js      monde principal : bibliothèque des likes (recherche, tri, genres, création de playlists)
  audio.js        monde principal : vitesse et effets audio (Web Audio API)
  player-api.js   monde principal : état et commandes du lecteur natif
  pip.js          monde principal : lecteur épinglable (Document Picture-in-Picture)
  bridge.js       monde isolé : seul accès à chrome.*, relais page ⇄ extension
background/
  service-worker.js  raccourcis globaux, historique, état du lecteur
popup/  options/  ui/i18n.js  icons/  rules/ads.json (blocage optionnel)
```

Les scripts du **monde principal** voient la page comme un userscript `@grant none` : cookie de session, requêtes, DOM. Ils n'ont pas accès à `chrome.*`. Le **pont** (monde isolé) fait le lien par `window.postMessage`, et synchronise `chrome.storage.sync` vers `localStorage` pour les réglages.

## Feuille de route

1. **Thème complet** (clair / sombre / OLED) au-delà de la couleur d'accent.
2. **Historique et statistiques** d'écoute locaux.
3. **Guide intégré** et pages de support.
4. Publication : Chrome Web Store, Edge Add-ons, Firefox AMO.

Déjà exposés par SoundCloud, donc non dupliqués : téléchargement des titres autorisés par l'artiste et lien d'achat, présents nativement sur la page du titre.

Hors périmètre, volontairement : extraction des flux audio (rip MP3/M4A), contraire aux conditions de SoundCloud et au droit des artistes.

## Licence

MIT.
