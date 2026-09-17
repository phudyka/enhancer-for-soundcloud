# Journal des versions

## 0.15.3 — 17/09/2026
- Installation : les réglages déjà synchronisés depuis un autre appareil ne sont plus écrasés par les valeurs par défaut.
- Analyse audio, samples, transitions, statistiques : un titre lancé depuis une playlist (adresse en `?in=…`) est reconnu comme le même titre. L'analyse BPM/tonalité n'est plus refaite, les samples mémorisés sont regroupés et le classement des titres les plus écoutés ne compte plus le même titre en double.
- Historique : une écoute déjà enregistrée n'est plus renvoyée à chaque pause ou changement d'onglet, et le mois stocké n'est réécrit que si le temps écouté progresse.
- Performances : masquages de la page (profil, menus, modules) recalculés au plus quatre fois par seconde pendant les chargements, sans retirer puis reposer les marques ; boutons de téléchargement déjà posés ignorés ; commande du son désactivée sans travail à chaque changement de la page ; transitions sans relecture des réglages à chaque progression ; bouton de réglages de l'en-tête arrêté proprement après une mise à jour de l'extension.

## 0.15.2 — 17/09/2026
- Performances : un seul observateur de la page pour tous les modules (au lieu d'un par module), au plus un passage par image affichée ; aucun travail d'interface tant que l'onglet n'est pas affiché, un seul rattrapage au retour. Shuffle+ ne relance plus de minuteur hors des pages concernées.
- Analyse audio : le calcul à 50 Hz ne tourne que pendant l'analyse ; en pause, affichage BPM/tonalité désactivé ou résultat déjà connu, il ne reste que deux réveils par seconde, et l'analyse s'arrête dès le résultat acquis jusqu'au titre suivant.
- Lecteur : l'état (titre suivant, pause) est transmis à l'historique et au panneau latéral même quand l'onglet SoundCloud est masqué.

## 0.15.1 — 17/09/2026
- Bibliothèque et playlists personnelles : les fenêtres du navigateur (confirmation, saisie, numéro de playlist à taper) laissent place à des boîtes de dialogue intégrées : liste des playlists cliquable avec nombre de titres et filtre, bouton d'action explicite, Échap pour annuler.
- Panneau latéral : la progression avance en continu au lieu de sauter toutes les 5 s ; clavier : espace = lecture/pause, ← → = ±5 s, Maj+← → = titre précédent/suivant ; la barre de progression est accessible au clavier et aux lecteurs d'écran.
- Analyse audio : moins de lectures du DOM pendant la lecture. Loupe de timeline : infobulle traduite.
- Réglages : champ de recherche (sans accents, Échap pour effacer) qui ne garde que les lignes ou rubriques correspondantes ; « Tout réafficher » de la personnalisation libre n'apparaît plus quand la liste est vide.
- Paquet : l'archive des boutiques inclut désormais la page de téléchargement (`downloads/`), absente jusque-là.
- En-tête SoundCloud : libellés du bouton de réglages et de sa fermeture traduits en anglais.

## 0.15.0 — 17/09/2026
- Transitions : choisir un autre titre, mettre en pause ou répéter le titre en cours pendant un fondu ne laisse plus le lecteur muet ; une erreur de préparation n'immobilise plus la transition suivante.
- Audio : le décalage de hauteur n'est calculé que lorsqu'il est utilisé (moins de charge processeur), un navigateur sans ce traitement ne coupe plus le son, et l'avertissement « effets indisponibles » n'apparaît qu'une fois par titre.
- Réglages : le sélecteur de couleur n'épuise plus le quota d'écritures synchronisées, les boutons « Tout masquer / Tout réafficher » et les libellés restants sont traduits en anglais, et la page suit les changements faits ailleurs.
- Bibliothèque : plus d'erreur en quittant la page pendant l'indexation ou une action groupée ; tri par titre ou artiste nettement plus rapide sur les grandes collections.
- Playlists personnelles : plus de requêtes répétées quand la page n'est pas prête ou après une erreur réseau.
- Shuffle+ : une dernière source supprimée renvoie vers les Likes au lieu d'échouer ; un identifiant client périmé est réellement renouvelé ; infobulles du bouton du lecteur traduites et à jour après un changement de mode.
- Performances : moins de lectures des réglages et de parcours de la page à chaque mutation du DOM ; l'historique n'est élagué qu'à l'ouverture d'un nouveau mois.
- Service worker : toute erreur renvoie une réponse au lieu de laisser l'appelant en attente. Personnalisation : le bouton de fin s'intitule « Terminer » en français.
- Panneau latéral : épingle sur le bord de SoundCloud pour ouvrir et fermer le lecteur, commande de fermeture dans le panneau et accès direct à l'onglet SoundCloud en permanence.
- Audio : les options de son sont accessibles depuis la barre du panneau latéral et restent synchronisées avec le lecteur SoundCloud. Le volume peut atteindre 200 % après activation explicite, désactivée par défaut, depuis les deux panneaux audio. Textes français et anglais ajoutés.
- Panneau latéral : sans onglet SoundCloud, lecture des titres et playlists publics avec le lecteur intégré officiel et mémorisation du dernier lien. La barre de défilement est masquée, le contenu peut descendre à 120 px et le bouton sur la pochette redevient cliquable. Le réglage de masquage Cast reconnaît davantage de formes du bouton.
- Téléchargement : le renouvellement de l'identifiant SoundCloud ignore les anciennes requêtes et actualise le cache ; les entrées indisponibles d'une playlist ne bloquent plus son chargement et les longs noms conservent l'extension du fichier. Volume : le clic sur le haut-parleur bloque aussi les événements natifs précédant le clic pour éviter une sourdine involontaire.
- Réglages : « Tout désactiver » conserve les préférences pour plus tard et « Réglages par défaut » rétablit immédiatement toutes les valeurs initiales.
- Apparence : la forme d’onde dessinée sur canvas reprend la couleur d’accent sans modifier ses niveaux gris.
- Panneau latéral : la largeur minimale du contenu passe de 220 à 180 px.
- Volume : le curseur au survol ne déclenche plus la sourdine native quand on le manipule.
- Lecture aléatoire : le bouton indique le mélange par un va-et-vient discret, sans rotation.
- Téléchargement : le bouton reprend la couleur et l'espacement des actions SoundCloud voisines.
- Apparence : le contour du curseur de progression prend une teinte liée à la couleur d'accent choisie.
- File d'attente native : un clic en dehors du panneau le ferme, sans interférer avec son bouton d'ouverture ni avec les commandes de la file.
- Téléchargement : bouton intégré aux actions du lecteur, des titres en liste, des pochettes et de la file d'attente ; page de téléchargement des titres publics, sélection de 10 titres maximum par playlist ou album, choix du transcodage disponible, conversion MP3 locale, métadonnées ID3 et sauvegarde JPG de la pochette.
- Volume : curseur vertical au survol du haut-parleur, réglage immédiat ; le clic ouvre toujours les options audio. Les boutons Cast et lecteur épinglable ont chacun un réglage de masquage.
- Fil : le module « Vos statistiques » peut être masqué. File d'attente : le commutateur de lecture automatique suit la couleur d'accent et peut être masqué séparément.
- Audio : la barre de défilement du panneau est invisible, tout en conservant le défilement.
- Réglages : bouton d'accès direct dans l'en-tête SoundCloud, sans ouvrir le panneau latéral.
- Analyse audio : correction du décalage des notes et des tempos détectés à mi-cadence ; anciens résultats mis en cache recalculés. Affichage du bloc BPM/tonalité facultatif depuis les réglages.
- En-tête : les badges de notifications et de messages retrouvent leur affichage natif et ne simulent plus des éléments non lus.
- Audio : choix de conserver vitesse et effets au titre suivant ou de revenir à Normal, presets personnels nommés avec sélection des réglages inclus, analyse BPM/tonalité/Camelot compacte dans la barre de lecture.
- Bibliothèque : « Récemment écouté » peut être masqué depuis les réglages.
- Playlists personnelles : gestion directe des titres avec retrait individuel, sélection multiple, ajout à une autre playlist, création d'une playlist et retrait des likes. Depuis la bibliothèque des likes, la sélection peut aussi être retirée d'une playlist personnelle.
- Panneau latéral : la file d'attente s'actualise automatiquement quand le panneau est visible et reconnaît davantage de formats de pochettes ; la largeur minimale du contenu passe de 300 à 220 px.
- Personnalisation : le bouton rond de fin remplace le bandeau pour libérer le haut de la page ; les masquages s'appliquent immédiatement. Le pied de page latéral est pris en charge par son réglage existant.
- Apparence : le logo des réglages suit la couleur d'accent, avec un motif contrasté ; l'orange devient le contrôle « Défaut » à gauche du champ hexadécimal.
- Lecture aléatoire : mode complet sans API par défaut, avec choix du mode natif ou de Shuffle+ dans les réglages. Un bouton apparaît au survol des pochettes de playlists pour lancer leur lecture aléatoire.
- Personnalisation : la barre de lecture reste visible, mais ses commandes peuvent être masquées individuellement. La promotion « On Tour » suit le réglage Artist Pro.
- Audio : un clic hors du panneau le ferme.

## 0.14.0 — 16/09/2026
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
