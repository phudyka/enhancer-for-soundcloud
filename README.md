# Enhancer for SoundCloud™

Extension navigateur (Manifest V3) qui améliore l'écoute sur soundcloud.com. Tout tourne localement, aucune donnée ne quitte le navigateur.

## Fonctions du squelette (v0.1.0)

- **Shuffle+** : vrai shuffle instantané des Likes, playlists et sets Discover via l'API interne, playlist tampon privée, bouton du lecteur détourné. Reprise du userscript [soundcloud-shuffle-plus](https://github.com/phudyka/soundcloud-shuffle-plus).
- **Vitesse de lecture** : bouton « 1.00× » à côté du volume, 0,5× à 2×, conservation de la hauteur, persistant. Raccourcis Maj+, Maj+. Maj+0.
- **Popup** : titre en cours, précédent / lecture / suivant / Shuffle+, historique des derniers shuffles.
- **Raccourcis globaux** : Shuffle+ et lecture/pause même quand l'onglet n'a pas le focus.
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
  shuffle.js      monde principal : module Shuffle+ (dérivé du userscript)
  speed.js        monde principal : vitesse de lecture
  player-api.js   monde principal : état et commandes du lecteur natif
  bridge.js       monde isolé : seul accès à chrome.*, relais page ⇄ extension
background/
  service-worker.js  raccourcis globaux, historique, état du lecteur
popup/  options/  icons/  pip/ (lecteur épinglable, à venir)
```

Les scripts du **monde principal** voient la page comme un userscript `@grant none` : cookie de session, requêtes, DOM. Ils n'ont pas accès à `chrome.*`. Le **pont** (monde isolé) fait le lien par `window.postMessage`, et synchronise `chrome.storage.sync` vers `localStorage` pour les réglages.

## Feuille de route

1. **Tours sans répétition** : chaque shuffle tire parmi les titres pas encore joués, jusqu'à épuisement de la bibliothèque.
2. **Lecteur épinglable** (Document Picture-in-Picture, Chromium 116+) : fenêtre flottante toujours au premier plan, télécommande du lecteur natif. Repli fenêtre popup sur Firefox.
3. **Fil « Stream » sans reposts** : masquer reposts et playlists pour ne voir que les nouveautés des artistes suivis.
4. **Obtenir ce titre** : bouton de téléchargement officiel quand l'artiste l'autorise (fichier d'origine, souvent WAV/FLAC, avec tags), sinon lien d'achat de l'artiste.
5. **Historique et statistiques** d'écoute locaux.
6. **Interface multilingue** (fr, en, de, es, it, pt) et **guide intégré**.
7. Publication : Chrome Web Store, Edge Add-ons, Firefox AMO (`world: "MAIN"` requiert Firefox 128+).

Hors périmètre, volontairement : extraction des flux audio (rip MP3/M4A), contraire aux conditions de SoundCloud et au droit des artistes.

## Licence

MIT.
