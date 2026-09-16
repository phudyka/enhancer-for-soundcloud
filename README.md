# Enhancer for SoundCloud™

Extension navigateur (Manifest V3) qui améliore l'écoute sur soundcloud.com. Tout tourne localement, aucune donnée ne quitte le navigateur.

## Fonctions (v0.4.0)

- **Shuffle+** : vrai shuffle instantané des Likes, playlists et sets Discover via l'API interne, playlist tampon privée, bouton du lecteur détourné. Reprise du userscript [soundcloud-shuffle-plus](https://github.com/phudyka/soundcloud-shuffle-plus).
- **Vitesse de lecture** : libellé discret « 1× » à gauche du volume, orange quand modifié, panneau 0,5× à 2× avec préréglages et conservation de la hauteur. Raccourcis Maj+, Maj+. Maj+0.
- **Lecteur épinglable** : fenêtre Picture-in-Picture toujours au premier plan (Chromium 116+), pochette, titre, progression cliquable, précédent / lecture / suivant / Shuffle+ / répéter, dans le langage visuel du lecteur SoundCloud. Bouton 📌 dans la barre du lecteur, depuis le popup, ou par raccourci.
- **Popup** : titre en cours, précédent / lecture / suivant / Shuffle+, historique des derniers shuffles.
- **Raccourcis globaux** : Shuffle+ et lecture/pause même quand l'onglet n'a pas le focus.
- **Bibliothèque des likes** sur `/you/likes` : recherche instantanée sur titre, artiste et tags, tri par date d'ajout, titre, artiste, durée, écoutes ou année, filtre par genre. Sur la sélection : lire dans l'ordre, Shuffle+, ou créer une playlist. Index local dans IndexedDB, construit en quelques secondes puis mis à jour incrémentalement.
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
  shuffle.js      monde principal : module Shuffle+ (dérivé du userscript), expose window.__scsp aux autres modules
  library.js      monde principal : bibliothèque des likes (recherche, tri, genres, création de playlists)
  speed.js        monde principal : vitesse de lecture
  player-api.js   monde principal : état et commandes du lecteur natif
  pip.js          monde principal : lecteur épinglable (Document Picture-in-Picture)
  bridge.js       monde isolé : seul accès à chrome.*, relais page ⇄ extension
background/
  service-worker.js  raccourcis globaux, historique, état du lecteur
popup/  options/  icons/  pip/ (lecteur épinglable, à venir)
```

Les scripts du **monde principal** voient la page comme un userscript `@grant none` : cookie de session, requêtes, DOM. Ils n'ont pas accès à `chrome.*`. Le **pont** (monde isolé) fait le lien par `window.postMessage`, et synchronise `chrome.storage.sync` vers `localStorage` pour les réglages.

## Feuille de route

1. **Tours sans répétition** : chaque shuffle tire parmi les titres pas encore joués, jusqu'à épuisement de la bibliothèque.
2. **Lecteur épinglable** : repli fenêtre popup sur Firefox, qui n'a pas Document Picture-in-Picture.
3. **Fil « Stream » sans reposts** : masquer reposts et playlists pour ne voir que les nouveautés des artistes suivis.
4. **Obtenir ce titre** : bouton de téléchargement officiel quand l'artiste l'autorise (fichier d'origine, souvent WAV/FLAC, avec tags), sinon lien d'achat de l'artiste.
5. **Historique et statistiques** d'écoute locaux.
6. **Interface multilingue** (fr, en, de, es, it, pt) et **guide intégré**.
7. Publication : Chrome Web Store, Edge Add-ons, Firefox AMO (`world: "MAIN"` requiert Firefox 128+).

Hors périmètre, volontairement : extraction des flux audio (rip MP3/M4A), contraire aux conditions de SoundCloud et au droit des artistes.

## Licence

MIT.
