# Journal des versions

## 0.9.0 — 16/09/2026
- Fil d'actualités : masquage des reposts et des playlists/albums (réglages).
- Shuffle+ sans répétition : chaque shuffle tire parmi les titres pas encore joués, tours successifs.
- Lecteur épinglable : repli en fenêtre popup sur les navigateurs sans Document Picture-in-Picture (Firefox).
- Interface popup et réglages en anglais pour les interfaces non francophones.
- Manifeste multi-navigateurs (Firefox 128+ : `browser_specific_settings`, `background.scripts`).

## 0.8.x
- Effets audio insérés dans le graphe Web Audio de SoundCloud (interception de `createMediaElementSource`), plus aucun conflit.
- Panneau Audio persistant, fermeture explicite ; preset recliqué = Normal. Popup sans historique.

## 0.7.x
- Vitesse 0,1× à 3× sur curseur logarithmique, aimant sur 1×. Analyse BPM et tonalité (Camelot) en direct.
- Bibliothèque intégrée à la rangée native : menus Tri et Genre, recherche à la place du Filtre, croix de retrait, badges ou liste selon « Afficher », clic = lecture du titre seul.
- Icône de l'extension : baguette magique.

## 0.6.0
- Module Audio : bass boost, réverb, presets Slowed + Reverb et Nightcore. Masquage des titres Go+. Barre de recherche élargie.

## 0.5.0
- Apparence : masquage à la carte, couleur d'accent, page d'accueil. Blocage optionnel des pubs tierces.

## 0.4.0
- Bibliothèque des likes : recherche, tri, genres, lecture, Shuffle+, création de playlists. Index IndexedDB.

## 0.3.x
- Popup transformé en lecteur, badge de lecture, commandes repeat/speed/seek. Playlist tampon jamais reprise comme source, tag et invite masquée.

## 0.2.0
- Lecteur épinglable (Document Picture-in-Picture). Bouton vitesse discret.

## 0.1.0
- Squelette : Shuffle+, vitesse, popup, raccourcis globaux, réglages synchronisés.
