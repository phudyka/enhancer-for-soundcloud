# Enhancer for SoundCloud™

Extension navigateur (Manifest V3) qui améliore l'écoute sur soundcloud.com. Tout tourne localement, aucune donnée ne quitte le navigateur.

## Fonctions (v0.16.0)

- **Lecture aléatoire** : par défaut, charge entièrement la file de lecture puis active le shuffle SoundCloud sans API ; les réglages permettent de choisir le shuffle natif ou **Shuffle+**, qui mélange les Likes et playlists via une playlist privée. Un bouton de lecture aléatoire apparaît au survol des playlists. **Sans répétition** dans Shuffle+ : chaque mélange tire parmi les titres pas encore joués, tour après tour. Reprise du userscript [soundcloud-shuffle-plus](https://github.com/phudyka/soundcloud-shuffle-plus).
- **Audio** : le bouton haut-parleur ouvre un panneau unique. Volume linéaire 0–100 % avec sourdine (molette sur le bouton) et option désactivée par défaut pour monter jusqu'à 200 %, vitesse 0,1× à 3× sur un curseur logarithmique avec aimant sur 1×, boutons ±0,01, flèches et saisie directe de la valeur, conservation de la hauteur, bass boost jusqu'à +12 dB, réverbération, presets Slowed + Reverb, Nightcore, Bass boost. Choix de conserver vitesse et effets au titre suivant ou de revenir à Normal ; presets personnels nommés où chaque réglage peut être inclus ou exclu. **Analyse en direct : BPM et tonalité avec code Camelot sur la barre de lecture**, facultative dans les réglages, affinée sur les 30 premières secondes, corrigée de la vitesse, mémorisée par titre. Traitement Web Audio sur le flux SoundCloud. Raccourcis Maj+, Maj+. Maj+0.
- **Lecteur épinglable** : fenêtre Picture-in-Picture toujours au premier plan (Chromium 116+, repli en fenêtre popup ailleurs), pochette, titre, progression cliquable, précédent / lecture / suivant / Shuffle+ / répéter, vitesse, hauteur, basses, réverbération et presets. Bouton 📌 dans la barre du lecteur, depuis le popup, ou par raccourci.
- **Panneau latéral** : un clic sur l'icône ouvre ou ferme le lecteur intégré au navigateur, avec pochette, progression, précédent / lecture / suivant, Shuffle+, vitesse, un bouton d'options audio (volume, hauteur, basses, réverbération, presets et volume jusqu'à 200 % sur activation), **minuteur d'arrêt** (15 à 90 min avec fondu de 8 s avant la pause, ou fin du titre en cours) et **file d'attente** « À suivre » : clic pour lire un titre, croix pour le retirer ; BPM et code Camelot des titres déjà analysés, en couleur quand l'enchaînement avec le titre en cours est harmonique. Le contenu s'adapte jusqu'à 120 px de large et reste défilable sans barre visible, sous réserve de la largeur minimale imposée par le navigateur. La file se recharge automatiquement toutes les 10 secondes lorsque le panneau est visible. Sans onglet SoundCloud, le panneau propose le lecteur intégré officiel pour un titre ou une playlist publics ; le dernier titre est repris comme lien proposé. Ce mode possède les commandes du lecteur intégré SoundCloud, tandis que les commandes avancées de l'extension nécessitent un onglet SoundCloud. Il reste accessible pendant la navigation ; les mises à jour d'état sont événementielles, avec un contrôle léger toutes les 5 secondes lorsque le panneau est visible. Repli en petite fenêtre sur les navigateurs sans API de panneau. Progression continue ; au clavier : espace = lecture/pause, ← → = ±5 s, Maj+← → = titre précédent/suivant.
- **Raccourcis globaux** : Shuffle+ et lecture/pause même quand l'onglet n'a pas le focus.
- **Bibliothèque des likes** sur `/you/likes` : recherche instantanée sur titre, artiste et tags, tri par date d'ajout, titre, artiste, durée, écoutes, année, BPM ou tonalité, filtre par genre. **Mix harmonique** : menu « Titres analysés » ou « Compatibles avec le titre en cours » (roue de Camelot : même clé, clé voisine ou relative ; tempo à 6 % près, demi et double tempo compris), meilleurs enchaînements d'abord, BPM et code Camelot affichés sur chaque titre. Les valeurs viennent de l'analyse en direct : seuls les titres déjà écoutés avec l'affichage BPM/tonalité sont connus, aucun flux n'est téléchargé pour les analyser. Résultats en badges ou en liste selon le choix natif « Afficher » ; un clic sur un titre le lit seul. Sélection individuelle ou de tous les résultats filtrés (ou de tous les favoris, même non chargés) pour créer une playlist, ajouter à une playlist existante, retirer des favoris ou retirer des titres d'une playlist personnelle après confirmation. Sur une playlist personnelle, « Gérer les titres » donne accès au retrait individuel et aux actions groupées. Les playlists sont limitées à 500 titres sans troncature silencieuse. Index local dans IndexedDB, construit en quelques secondes puis mis à jour incrémentalement. Confirmations, nom de playlist et choix de la playlist cible passent par des boîtes de dialogue intégrées (liste filtrable), sans fenêtre du navigateur.
- **Sampler** : points A et B (touches `[` et `]`), boucle entre les deux (`\`), réglage fin ±0,1 s, boucles nommées mémorisées par titre dans la section « Samples » du panneau Audio, repères sur la barre du lecteur, liste copiable (horodatages + lien). Aucune extraction audio.
- **Loupe de timeline** : molette sur la forme d'onde ou la barre du lecteur, zoom 2× à 32× avec la forme d'onde redessinée, règle de temps, placement au centième de seconde, flèches ±1 s / Maj ±0,1 s / Alt ±0,01 s.
- **Transitions automatiques** (option) : à l'approche de la fin d'un titre, le suivant de la file démarre en fondu croisé à puissance constante (6 à 24 s) avec échange des basses à mi-parcours ; SoundCloud enchaîne ensuite normalement, calé sur la position du fondu.
- **Historique et statistiques d'écoute** : le temps réellement écouté par titre est mesuré sur le flux audio et conservé dans le navigateur (24 mois au plus, désactivable). Page Statistiques avec période au choix : temps d'écoute, écoutes, titres et artistes distincts, titres écoutés en entier, écoute par jour, par heure et par jour de semaine, top titres, top artistes, dernières écoutes, export CSV / JSON, effacement en deux clics. Ouverture depuis les réglages ou le panneau latéral.
- **Personnalisation libre** : « Masquer des éléments à la souris » dans les réglages ouvre SoundCloud en mode personnalisation ; survolez, cliquez, l'élément est masqué durablement (sections de Découvrir, modules, onglets, boutons…). Chaque masquage est listé dans les réglages et réaffichable.
- **Debloat et apparence** : réglages séparés pour les éléments du profil (boutons et onglets), les entrées du menu (latéral et déroulant de l'avatar), la lecture, le fil et les promotions. Chaque masquage est local et réversible ; aucun contenu du compte n'est supprimé. Fond noir OLED pour le thème sombre natif, couleur d'accent personnalisée avec saisie hexadécimale, page d'accueil au choix.
- **Bandeau cookies** : masque par défaut le dialogue répétitif de SoundCloud sans effacer les cookies ni enregistrer un choix de consentement ; désactivable dans Promotions.
- **Publicités** : blocage optionnel des domaines publicitaires et traceurs tiers via declarativeNetRequest, sans lecture des pages. Désactivé par défaut, inutile sur Brave.
- **Guide intégré** (français / anglais) ouvert à l'installation, accessible depuis les réglages.
- **Réglages** accessibles depuis l'en-tête SoundCloud ou le panneau latéral, synchronisés entre appareils. Packs recommandés ou complets, commande pour tout désactiver en conservant les choix et retour immédiat aux réglages par défaut. Un champ de recherche filtre les réglages par mot-clé.
- **Lecteur latéral** : une épingle sur le bord de SoundCloud ouvre ou ferme le panneau sans passer par l'icône de l'extension. Le panneau possède aussi une fermeture et un accès permanent à l'onglet SoundCloud ; sans onglet, il peut afficher le lecteur intégré d'un titre ou d'une playlist publics.
- **Téléchargements** : depuis le lecteur, le panneau latéral ou une playlist/un album, sélection de 10 titres maximum par lot avec progression. Les flux publics disponibles sont décodés et convertis localement en MP3 avec titre, artiste, album, genre et pochette ID3 ; la pochette peut aussi être enregistrée en JPG. Le choix de qualité dépend des transcodages proposés pour chaque titre.

## Installer en mode développeur

1. `brave://extensions` (ou `chrome://extensions`), activer le **Mode développeur**.
2. **Charger l'extension non empaquetée**, choisir ce dossier.
3. Ouvrir soundcloud.com. Désactiver le userscript Shuffle+ dans Tampermonkey pour éviter le doublon.

## Architecture

```
manifest.json
content/
  media-hook.js   document_start, monde principal : capture l'<audio> de SoundCloud (créé hors DOM)
  appearance.js   document_start, monde principal : masquage (cases et masquages libres), OLED, accent, page d'accueil
  customize.js    monde principal : mode « masquer à la souris » (sélecteur d'éléments)
  shuffle.js      monde principal : module Shuffle+ (dérivé du userscript), expose window.__scsp aux autres modules
  shared.js       utilitaires communs (icônes, temps, pagination, client_id), aussi chargés par le panneau latéral
  dialog.js       monde principal : boîtes de dialogue intégrées (confirmation, saisie, choix de playlist)
  library.js      monde principal : bibliothèque des likes (recherche, tri, genres, sélection)
  library-bulk.js sélection et opérations groupées sur favoris et playlists
  playlist-manager.js  monde principal : gestion des titres des playlists personnelles
  pitch-shifter.js  transposition en demi-tons (lecture et export)
  audio.js        monde principal : vitesse, effets, analyse BPM/tonalité (inséré dans le graphe SoundCloud)
  scrub.js        monde principal : loupe de timeline
  transitions.js  monde principal : transitions automatiques (second flux en fondu croisé)
  sampler.js      monde principal : boucles A/B mémorisées par titre, section du panneau Audio
  player-api.js   monde principal : état et commandes du lecteur natif
  download-entry.js  boutons de téléchargement sur SoundCloud
  history.js      monde principal : temps écouté par titre, remonté au service worker
  pip.js          monde principal : lecteur épinglable (Document Picture-in-Picture)
  bridge.js       monde isolé : seul accès à chrome.*, relais page ⇄ extension
background/
  service-worker.js  raccourcis globaux, historique d'écoute (storage.local), état du lecteur
popup/  options/  stats/ (statistiques d'écoute)  guide/ (guide intégré)  downloads/ (conversion locale MP3)  ui/i18n.js  icons/  rules/ads.json (blocage optionnel)
scripts/package.sh  archive zip pour les boutiques  ·  PRIVACY.md  politique de confidentialité
```

Les scripts du **monde principal** voient la page comme un userscript `@grant none` : cookie de session, requêtes, DOM. Ils n'ont pas accès à `chrome.*`. Le **pont** (monde isolé) fait le lien par `window.postMessage`, et synchronise `chrome.storage.sync` vers `localStorage` pour les réglages.

## Feuille de route

1. Publication : Chrome Web Store, Edge Add-ons, Firefox AMO (`scripts/package.sh` produit l'archive, `PRIVACY.md` la politique demandée par les boutiques).

Faits : thème (SoundCloud gère clair / sombre nativement ; l'extension ajoute le fond OLED), historique et statistiques d'écoute locaux, guide intégré.

Le téléchargement local utilise les flux publics que SoundCloud fournit au navigateur. Certains titres ou formats peuvent rester indisponibles. Respectez les droits des artistes et les conditions applicables à votre usage.

## Licence

MIT.

Le convertisseur MP3 embarque `lamejs` sous LGPL 2.1 ; sa licence figure dans `downloads/vendor/LAME-LICENSE.txt`.
