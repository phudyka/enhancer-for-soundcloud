# Journal des versions

## En cours
- Sampler : points A/B au clavier ([ et ]), boucle (\), réglage fin, boucles nommées mémorisées par titre dans le panneau Audio, repères sur la barre du lecteur, liste copiable. Sans extraction audio.
- Le mode DJ (deux platines) est retiré, remplacé par des **transitions automatiques** : fondu croisé avec le titre suivant de la file (6 à 24 s), basses échangées à mi-parcours, calage du lecteur natif à la fin. Option dans les réglages, désactivée par défaut.
- Personnalisation libre : depuis les réglages, « Masquer des éléments à la souris » ouvre SoundCloud en mode personnalisation ; survolez, cliquez, l'élément est masqué durablement (sections de Découvrir, modules, onglets, boutons…). Liste des masquages dans les réglages avec réaffichage individuel ou total.
- Debloat : nouvelles cases pour les onglets de l'en-tête (Accueil, Fil d'actualités, Bibliothèque), les modules de la colonne de droite du fil (Nouveaux titres, Artistes à suivre, Mentions J'aime, Historique d'écoute, Passer sur mobile), le sélecteur de langue ; le bloc « Outils pour artistes » intégré est aussi masqué.
- Audio : le bouton haut-parleur de SoundCloud ouvre un seul panneau réunissant le volume et les réglages audio. Volume linéaire 0–100 % (le volume natif est fixé à 100 %, l'ancienne valeur devient le volume initial), sourdine, molette sur le bouton. Vitesse plus précise : boutons ±0,01, flèches ±0,01 (Maj ±0,1), saisie directe de la valeur, aimant sur 1× réduit.
- Panneau latéral : file d'attente « À suivre » sous le lecteur, lue depuis la file native de SoundCloud (ouverte invisible le temps de la lecture) ; clic pour lire un titre, croix pour le retirer, bouton d'actualisation.
- Debloat : les masquages des entrées du menu latéral s'appliquent aussi au menu déroulant de l'avatar.

## 0.13.0 — 16/09/2026
- Minuteur d'arrêt dans le panneau latéral : arrêt dans 15 à 90 minutes avec fondu de 8 s avant la pause, ou pause à la fin du titre en cours ; temps restant affiché.
- Guide intégré (français / anglais) ouvert à l'installation et accessible depuis les réglages.
- Publication : script d'empaquetage `scripts/package.sh` et politique de confidentialité `PRIVACY.md`.

## 0.12.0 — 16/09/2026
- Historique et statistiques d'écoute locaux : temps réellement écouté par titre, mesuré sur le flux audio et conservé dans le navigateur (24 mois au plus). Page Statistiques : période, temps d'écoute, écoutes, titres et artistes distincts, écoute par jour, par heure et par jour de semaine, top titres, top artistes, dernières écoutes, export CSV et JSON, effacement. Accessible depuis les réglages et le panneau latéral ; désactivable.
- Apparence : fond noir (OLED) pour le thème sombre natif de SoundCloud.

## 0.11.0 — 16/09/2026
- Bibliothèque des favoris : sélection individuelle, de tous les résultats filtrés ou de tous les favoris indexés ; création et ajout à une playlist (500 titres maximum), retrait des favoris avec confirmation et bilan des échecs.
- Debloat par catégories : masquage individuel des boutons et onglets du profil, des entrées du menu, du fil et des promotions, sans suppression de données.
- Le réglage Promotions masque aussi les offres de titres épinglés et les boutons Artist Pro présents dans les listes de titres, sans cacher les morceaux.
- Les changements de réglages d'apparence sont appliqués à l'onglet SoundCloud sans le recharger.
- Contrôles Audio dans le lecteur Picture-in-Picture ; lecteur intégré au panneau latéral du navigateur à la place du popup compact, avec actualisation allégée.
- Contraste automatique du texte des boutons principaux avec la couleur d'accent personnalisée.
- L'icône de l'extension ouvre et ferme désormais le panneau latéral au lieu de seulement l'ouvrir.
- Le panneau ouvre automatiquement un onglet SoundCloud si nécessaire, sans en créer de doublon ; un bouton permet d'y revenir pour choisir un titre.

## 0.10.0 — 16/09/2026
- Loupe de timeline : zoom 2–32× à la molette, forme d'onde redessinée, placement précis.
- Mode DJ : deux platines, crossfader, kill basses, pitch, cue, Sync, Auto-mix.
- Accent : forme d'onde, titre en cours des listes, volume, composants de l'extension, réglages. Barre de progression lisible.
- Panneau Audio : en-tête avec fermeture, analyse en tuiles.

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
