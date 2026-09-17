/*
 * Enhancer for SoundCloud™ — module Shuffle+ (monde principal)
 * Dérivé du userscript SoundCloud Shuffle+ (MIT). Tourne dans le contexte de la
 * page ("world": "MAIN") : accès au cookie de session, aux requêtes de la page
 * et au DOM, exactement comme un userscript @grant none.
 *
 * Communication avec l'extension (monde isolé, content/bridge.js) :
 *   - réception : window.postMessage({ scsp: 'command', command: 'shuffle' })
 *   - émission   : window.postMessage({ scsp: 'event', ... })
 * Réglages : localStorage 'scsp:settings', synchronisé par le pont depuis chrome.storage.
 */
/*
 * FONCTIONNEMENT (v5, méthode API)
 * Basé à l'origine sur « soundcloud shuffle likes » de bhackel (MIT).
 * ────────────────────────────────
 * L'ancienne méthode (v1 → v4) faisait défiler la file d'attente jusqu'au bout
 * pour que le shuffle natif couvre toute la liste : lent, proportionnel au
 * nombre de titres. Ici :
 *
 *   1. Source → identifiants de titres, via api-v2.soundcloud.com avec la
 *      session du navigateur (cookie oauth_token + client_id de la page) :
 *        - Tes likes : /me/track_likes/ids (identifiants seuls, ~2 Ko par
 *          page de 200 → ~2 s pour 5 000 likes), mis en cache dans
 *          localStorage et rafraîchis incrémentalement (seuls les nouveaux
 *          likes sont récupérés).
 *        - Likes d'un autre profil : /users/{id}/track_likes (objets complets).
 *        - Playlist : /resolve?url=… → tous les identifiants en une requête.
 *   2. Fisher-Yates (crypto.getRandomValues), puis on garde au plus 500 titres
 *      (limite SoundCloud par playlist).
 *   3. Création d'une playlist privée « 🔀 Shuffle+ · <source> » NEUVE avec
 *      ces titres (POST /playlists, une requête). L'app SoundCloud met en cache
 *      les playlists par adresse : on impose une adresse (permalink) aléatoire,
 *      distincte du titre, donc jamais vue, donc des données fraîches sans
 *      recharger la page. L'ancienne playlist tampon est supprimée AVANT
 *      la création de la nouvelle : il n'en existe jamais deux à la fois. Un
 *      balayage quotidien en arrière-plan supprime d'éventuelles orphelines.
 *   4. Navigation interne (SPA) vers cette playlist et clic sur Lecture.
 *      Repli : rechargement complet + lecture automatique si le lecteur
 *      n'apparaît pas à temps.
 *
 * Le bouton n'apparaît pas sur la playlist tampon (on y arrive déjà mélangé).
 * Le bouton « Aléatoire » du lecteur (barre du bas) est lui aussi détourné :
 * un clic lance un vrai shuffle de ce qui est en cours (playlist du titre en
 * cours si connue, sinon page courante, sinon dernière source, sinon tes
 * Likes). Alt+clic conserve le shuffle natif.
 * Raccourcis : Maj+S = shuffle ; Maj+clic = forcer le rafraîchissement complet
 * du cache des likes.
 *
 * Coût pour l'utilisateur : un observateur DOM au callback O(1), un cache
 * d'identifiants (~10 octets par like), aucune ressource externe, aucun
 * timer permanent.
 */

(function () {
    'use strict';
    try { if (JSON.parse(localStorage.getItem('scsp:settings') || '{}').extensionDisabled === true) return; } catch {}

    // ═══════════════════════════════════════════════════════════════
    //  CONFIG
    // ═══════════════════════════════════════════════════════════════
    const NS = 'scsp';
    const CFG = Object.freeze({
        BUFFER_TITLE:     '🔀 Shuffle+',
        BUFFER_DESC:      'Playlist tampon générée par Shuffle+. Recréée à chaque shuffle, ne pas modifier à la main.',
        BUFFER_TAGS:      'shuffle',    // évite l'invite « Ajoutez des tags » de SoundCloud sur la playlist tampon
        MAX_TRACKS:       500,          // limite SoundCloud par playlist
        PAGE_SIZE:        200,
        CACHE_TTL_MS:     7 * 864e5,    // re-synchro complète des likes après 7 jours
        API:              'https://api-v2.soundcloud.com',
        HOTKEY:           'S',
        TOAST_MS:         2600,
        ERROR_RESET_MS:   3000,
        DONE_RESET_MS:    1500,
        MOUNT_DEBOUNCE_MS:250,
        PLAY_HASH:        '#scsp-play',
        NAV_TIMEOUT_MS:   8000,         // attente du lecteur après navigation SPA, sinon repli
        MAX_CLEANUP:      10,           // orphelines supprimées par balayage
        SWEEP_EVERY_MS:   864e5,        // balayage des orphelines : une fois par jour
    });
    const State = Object.freeze({ IDLE: 'idle', LOADING: 'loading', DONE: 'done', ERROR: 'error' });

    const SEL = Object.freeze({
        anchors: {
            Likes:        '.collectionSection__top .listDisplayToggle__options',
            GenericLikes: '.userNetworkTabs',
            Playlist:     '.soundActions .sc-button-group, .soundActions',
            Discover:     '.systemPlaylistDetails__controls',
        },
        // Repli si la rangée « Afficher » n'apparaît pas (mise en page différente)
        anchorsFallback: {
            Likes:        '.collectionSection__top',
        },
        heroPlay:       '.fullHero .sc-button-play, .heroPlayButton, .sc-button-play.sc-button-xxlarge',
        badgeLink:      '.playbackSoundBadge__titleLink',
        discoverDesc:   '.systemPlaylistDetails__description',
        shuffleControl: '.shuffleControl',
        button:         `.${NS}-btn`,
    });

    // ═══════════════════════════════════════════════════════════════
    //  UTILITAIRES
    // ═══════════════════════════════════════════════════════════════
    const $ = (sel, root = document) => root.querySelector(sel);
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const log = (...a) => console.debug('[Shuffle+]', ...a);

    const store = {
        get(k, d = null) { try { const v = localStorage.getItem(`${NS}:${k}`); return v ? JSON.parse(v) : d; } catch { return d; } },
        set(k, v)        { try { localStorage.setItem(`${NS}:${k}`, JSON.stringify(v)); } catch (e) { log('localStorage', e); } },
        del(k)           { try { localStorage.removeItem(`${NS}:${k}`); } catch {} },
    };

    /** Adresse de playlist sans le jeton secret « /s-xxxx » ni barre finale, pour comparer. */
    const normPath = (p) => (p || '').replace(/\/s-[A-Za-z0-9]+\/?$/, '').replace(/\/+$/, '');
    /** La page (ou l'adresse donnée) est-elle la playlist tampon ? */
    let bufferPath = normPath(store.get('buffer_path'));   // en mémoire : consulté à chaque mutation du DOM
    window.addEventListener('storage', (e) => { if (e.key === `${NS}:buffer_path`) bufferPath = normPath(store.get('buffer_path')); });
    const isBufferPath = (p = location.pathname) => !!bufferPath && normPath(p) === bufferPath;

    function detectPageType(pathname = location.pathname) {
        const p = pathname.replace(/\/+$/, '');
        if (p === '/you/likes' || p.startsWith('/you/likes/')) return 'Likes';
        if (/^\/[^/]+\/likes$/.test(p))                        return 'GenericLikes';
        if (p.includes('/discover/sets/'))                      return 'Discover';
        if (/^\/[^/]+\/sets\/[^/]+/.test(p))                    return 'Playlist';
        return null;
    }

    function waitFor(selector, { root = document.body, timeout = 8000 } = {}) {
        return new Promise((resolve, reject) => {
            const found = root.querySelector(selector);
            if (found) return resolve(found);
            const obs = new MutationObserver(() => {
                const el = root.querySelector(selector);
                if (el) { clearTimeout(timer); obs.disconnect(); resolve(el); }
            });
            obs.observe(root, { childList: true, subtree: true });
            const timer = setTimeout(() => { obs.disconnect(); reject(new Error(`timeout: ${selector}`)); }, timeout);
        });
    }

    /** Fisher-Yates ; source cryptographique quand disponible, Math.random sinon. */
    function shuffle(arr) {
        const a = arr.slice();
        const hasCrypto = typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function';
        const buf = hasCrypto ? new Uint32Array(Math.max(1, a.length)) : null;
        if (hasCrypto) {
            // un seul appel (par tranches de 16 Ko max, limite navigateur)
            for (let off = 0; off < buf.length; off += 16384) crypto.getRandomValues(buf.subarray(off, Math.min(off + 16384, buf.length)));
        }
        for (let i = a.length - 1; i > 0; i--) {
            const r = hasCrypto ? buf[i] / 4294967296 : Math.random();
            const j = Math.floor(r * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    // ═══════════════════════════════════════════════════════════════
    //  I18N — suit la langue de l'interface SoundCloud (<html lang>)
    // ═══════════════════════════════════════════════════════════════
    const I18N = {
        en: {
            tip:        'True shuffle of the whole list  (Shift+{k} · Shift+click = resync likes)',
            tipBuffer:  'Reshuffle {src}  (Shift+{k})',
            busy:       'Shuffle in progress…',
            syncing:    'Syncing likes… {n} / {t}',
            syncingN:   'Syncing likes… {n}',
            reading:    'Reading {src}…',
            writing:    'Writing buffer playlist…',
            launching:  'Starting…',
            ready:      'Playlist ready: press Play',
            tooFew:     'Too few tracks',
            notLogged:  'Not logged in to SoundCloud',
            noSource:   'No source remembered: start a shuffle from your Likes or a playlist',
            noPlaylist: 'Playlist not found',
            noUser:     'Profile not found',
            noClient:   'client_id not found',
            discover:   'Discover sets are not supported',
            drawn:      '{n} tracks drawn from {t}',
            shuffled:   '{n} tracks shuffled',
            yourLikes:  'your Likes',
            userLikes:  "{u}'s Likes",
            shuffle:    'Shuffle',
            playerPlus: 'Shuffle+ (private playlist) · Alt+click = native shuffle',
            playerNative: 'SoundCloud shuffle',
            playerQueue: 'Full shuffle of the queue (no API) · Alt+click = native shuffle',
            error: 'Error', noQueue: 'Play queue not found', queueIncomplete: 'Queue loading incomplete',
            cardShuffle: 'Play this playlist shuffled', noPlay: 'Could not start the playlist',
            likesName:  'Likes',
            userLikesName: 'Likes · {u}',
            round: 'round {n}', remaining: '{n} left',
        },
        fr: {
            tip:        'Shuffle réel de toute la liste  (Maj+{k} · Maj+clic = resynchro des likes)',
            tipBuffer:  'Remélanger {src}  (Maj+{k})',
            busy:       'Shuffle en cours…',
            syncing:    'Synchronisation des likes… {n} / {t}',
            syncingN:   'Synchronisation des likes… {n}',
            reading:    'Lecture de {src}…',
            writing:    'Écriture de la playlist tampon…',
            launching:  'Lancement…',
            ready:      'Playlist prête : clique sur Lecture',
            tooFew:     'Trop peu de titres',
            notLogged:  'Non connecté à SoundCloud',
            noSource:   'Aucune source mémorisée : lance le shuffle depuis tes Likes ou une playlist',
            noPlaylist: 'Playlist introuvable',
            noUser:     'Profil introuvable',
            noClient:   'client_id introuvable',
            discover:   'Sets Discover non supportés',
            drawn:      '{n} titres tirés au sort parmi {t}',
            shuffled:   '{n} titres mélangés',
            yourLikes:  'tes Likes',
            userLikes:  'les Likes de {u}',
            shuffle:    'Shuffle',
            playerPlus: 'Shuffle+ (playlist privée) · Alt+clic = shuffle natif',
            playerNative: 'Aléatoire SoundCloud',
            playerQueue: 'Shuffle complet de la file (sans API) · Alt+clic = shuffle natif',
            error: 'Erreur', noQueue: 'File de lecture introuvable', queueIncomplete: 'Chargement de la file incomplet',
            cardShuffle: 'Lire cette playlist en aléatoire', noPlay: 'Lecture de la playlist introuvable',
            likesName:  'Likes',
            userLikesName: 'Likes · {u}',
            round: 'tour {n}', remaining: '{n} restants',
        },
        de: {
            tip:        'Echtes Shuffle der ganzen Liste  (Umschalt+{k} · Umschalt+Klick = Likes neu laden)',
            tipBuffer:  '{src} neu mischen  (Umschalt+{k})',
            busy:       'Shuffle läuft…',
            syncing:    'Likes werden geladen… {n} / {t}',
            syncingN:   'Likes werden geladen… {n}',
            reading:    '{src} wird gelesen…',
            writing:    'Puffer-Playlist wird geschrieben…',
            launching:  'Wird gestartet…',
            ready:      'Playlist bereit: auf Play drücken',
            tooFew:     'Zu wenige Titel',
            notLogged:  'Nicht bei SoundCloud angemeldet',
            noSource:   'Keine Quelle gespeichert: Shuffle von deinen Likes oder einer Playlist starten',
            noPlaylist: 'Playlist nicht gefunden',
            noUser:     'Profil nicht gefunden',
            noClient:   'client_id nicht gefunden',
            discover:   'Discover-Sets werden nicht unterstützt',
            drawn:      '{n} Titel aus {t} gezogen',
            shuffled:   '{n} Titel gemischt',
            yourLikes:  'deine Likes',
            userLikes:  'Likes von {u}',
            shuffle:    'Shuffle',
        },
        es: {
            tip:        'Shuffle real de toda la lista  (Mayús+{k} · Mayús+clic = resincronizar likes)',
            tipBuffer:  'Volver a mezclar {src}  (Mayús+{k})',
            busy:       'Shuffle en curso…',
            syncing:    'Sincronizando likes… {n} / {t}',
            syncingN:   'Sincronizando likes… {n}',
            reading:    'Leyendo {src}…',
            writing:    'Escribiendo la playlist temporal…',
            launching:  'Iniciando…',
            ready:      'Playlist lista: pulsa Reproducir',
            tooFew:     'Muy pocas pistas',
            notLogged:  'No has iniciado sesión en SoundCloud',
            noSource:   'Ninguna fuente guardada: inicia el shuffle desde tus Likes o una playlist',
            noPlaylist: 'Playlist no encontrada',
            noUser:     'Perfil no encontrado',
            noClient:   'client_id no encontrado',
            discover:   'Los sets de Discover no están soportados',
            drawn:      '{n} pistas elegidas al azar entre {t}',
            shuffled:   '{n} pistas mezcladas',
            yourLikes:  'tus Likes',
            userLikes:  'los Likes de {u}',
            shuffle:    'Shuffle',
        },
        it: {
            tip:        'Shuffle reale di tutta la lista  (Maiusc+{k} · Maiusc+clic = risincronizza i like)',
            tipBuffer:  'Rimescola {src}  (Maiusc+{k})',
            busy:       'Shuffle in corso…',
            syncing:    'Sincronizzazione dei like… {n} / {t}',
            syncingN:   'Sincronizzazione dei like… {n}',
            reading:    'Lettura di {src}…',
            writing:    'Scrittura della playlist temporanea…',
            launching:  'Avvio…',
            ready:      'Playlist pronta: premi Play',
            tooFew:     'Troppo pochi brani',
            notLogged:  'Non hai effettuato l\'accesso a SoundCloud',
            noSource:   'Nessuna sorgente memorizzata: avvia lo shuffle dai tuoi Like o da una playlist',
            noPlaylist: 'Playlist non trovata',
            noUser:     'Profilo non trovato',
            noClient:   'client_id non trovato',
            discover:   'I set Discover non sono supportati',
            drawn:      '{n} brani estratti tra {t}',
            shuffled:   '{n} brani mescolati',
            yourLikes:  'i tuoi Like',
            userLikes:  'i Like di {u}',
            shuffle:    'Shuffle',
        },
        pt: {
            tip:        'Shuffle real de toda a lista  (Shift+{k} · Shift+clique = ressincronizar likes)',
            tipBuffer:  'Embaralhar {src} de novo  (Shift+{k})',
            busy:       'Shuffle em andamento…',
            syncing:    'Sincronizando likes… {n} / {t}',
            syncingN:   'Sincronizando likes… {n}',
            reading:    'Lendo {src}…',
            writing:    'Gravando a playlist temporária…',
            launching:  'Iniciando…',
            ready:      'Playlist pronta: aperte Play',
            tooFew:     'Poucas faixas',
            notLogged:  'Não conectado ao SoundCloud',
            noSource:   'Nenhuma fonte memorizada: inicie o shuffle a partir dos seus Likes ou de uma playlist',
            noPlaylist: 'Playlist não encontrada',
            noUser:     'Perfil não encontrado',
            noClient:   'client_id não encontrado',
            discover:   'Sets do Discover não são suportados',
            drawn:      '{n} faixas sorteadas entre {t}',
            shuffled:   '{n} faixas embaralhadas',
            yourLikes:  'seus Likes',
            userLikes:  'os Likes de {u}',
            shuffle:    'Shuffle',
        },
    };
    const LANG = (document.documentElement.lang || navigator.language || 'en').slice(0, 2).toLowerCase();
    const STR  = I18N[LANG] || I18N.en;
    const fmt  = (n) => Number(n).toLocaleString(document.documentElement.lang || undefined);
    /** t('drawn', { n: 500, t: 4829 }) — les nombres sont formatés selon la locale. */
    const t = (key, vars = {}) => (STR[key] ?? I18N.en[key] ?? key)
        .replace(/\{(\w+)\}/g, (_, k) => (typeof vars[k] === 'number' ? fmt(vars[k]) : (vars[k] ?? '')));

    // ═══════════════════════════════════════════════════════════════
    //  API SOUNDCLOUD (session du navigateur)
    // ═══════════════════════════════════════════════════════════════
    const API = (() => {
        let clientId = null;

        function token() {
            const m = document.cookie.match(/(?:^|;\s*)oauth_token=([^;]+)/);
            return m ? decodeURIComponent(m[1]) : null;
        }

        async function call(path, { method = 'GET', body, retryAuth = true } = {}) {
            const tok = token();
            if (!tok) throw new Error(t('notLogged'));
            if (!clientId) clientId = await window.__sceShared.clientId(!retryAuth);   // après un 401 : ni historique ni cache
            if (!clientId) throw new Error(t('noClient'));

            const sep = path.includes('?') ? '&' : '?';
            const url = `${CFG.API}${path}${sep}client_id=${clientId}`;
            const headers = { Authorization: `OAuth ${tok}` };
            if (body !== undefined) headers['Content-Type'] = 'application/json';

            const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
            if (res.status === 401 && retryAuth) {
                // client_id périmé → on le re-résout une fois
                clientId = null;
                return call(path, { method, body, retryAuth: false });
            }
            if (res.status === 204) return null;
            const text = await res.text();
            let data = null;
            try { data = text ? JSON.parse(text) : null; } catch { data = text; }
            if (!res.ok) {
                const msg = data?.errors?.join?.(', ') || (typeof data === 'string' ? data.slice(0, 120) : res.statusText);
                throw new Error(`API ${res.status} ${method} ${path.split('?')[0]} : ${msg}`);
            }
            return data;
        }

        /** Transforme un next_href absolu en chemin relatif sans client_id. */
        const rel = window.__sceShared.nextPath;

        return { call, rel };
    })();

    // ═══════════════════════════════════════════════════════════════
    //  SOURCES → identifiants de titres
    // ═══════════════════════════════════════════════════════════════
    const playable = (t) => t && t.id && t.policy !== 'BLOCK';

    /**
     * Likes d'un utilisateur, avec cache + rafraîchissement incrémental.
     * Les likes sont renvoyés du plus récent au plus ancien : on lit des pages
     * jusqu'à retomber sur un identifiant déjà connu.
     */
    async function fetchLikes(userId, expectedCount, { own = false, force = false, onProgress } = {}) {
        const key = `likes:${userId}`;
        const cache = store.get(key);
        const fresh = !!cache && !force && (Date.now() - cache.at) < CFG.CACHE_TTL_MS;

        if (fresh && cache.count === expectedCount) { log('likes: cache OK', cache.ids.length); return cache.ids; }

        const full  = !fresh || expectedCount < cache.count; // un « unlike » → resynchro complète
        const known = new Set(full ? [] : cache.ids);
        const fetched = [];
        // Ses propres likes : endpoint « ids » (identifiants seuls, 20× plus léger et 5× plus rapide)
        let url = own
            ? `/me/track_likes/ids?limit=${CFG.PAGE_SIZE}&linked_partitioning=1`
            : `/users/${userId}/track_likes?limit=${CFG.PAGE_SIZE}`;
        let hitKnown = false;

        while (url && !hitKnown) {
            const page = await API.call(url);
            for (const item of page.collection || []) {
                const id = own ? item : item.track?.id;
                if (!id) continue;
                if (!full && known.has(id)) { hitKnown = true; continue; }
                if (own || playable(item.track)) fetched.push(id);
            }
            onProgress?.(fetched.length + known.size, expectedCount);
            url = page.next_href ? API.rel(page.next_href) : null;
        }

        const seen = new Set();
        const ids = (full ? fetched : [...fetched, ...cache.ids]).filter((id) => !seen.has(id) && seen.add(id));
        store.set(key, { ids, count: expectedCount, at: Date.now() });
        log(`likes: ${full ? 'resynchro complète' : 'incrémental'} →`, ids.length);
        return ids;
    }

    /** Résout une page (par défaut la courante) en une source { key, label, getIds() }. */
    async function resolveSource(pageType, opts, pageUrl = location.origin + location.pathname) {

        if (pageType === 'Likes') {
            const me = await API.call('/me');
            return {
                key: `likes:${me.id}`, label: t('yourLikes'), name: t('likesName'),
                getIds: () => fetchLikes(me.id, me.likes_count ?? -1, { ...opts, own: true }),
            };
        }
        if (pageType === 'GenericLikes') {
            const user = await API.call(`/resolve?url=${encodeURIComponent(pageUrl.replace(/\/likes$/, ''))}`);
            if (user.kind !== 'user') throw new Error(t('noUser'));
            const own = String(user.id) === String(opts.meId);
            return {
                key: `likes:${user.id}`, label: own ? t('yourLikes') : t('userLikes', { u: user.username }),
                name: own ? t('likesName') : t('userLikesName', { u: user.username }),
                getIds: () => fetchLikes(user.id, user.likes_count ?? -1, { ...opts, own }),
            };
        }
        // Playlist ou Discover : /resolve renvoie tous les identifiants
        const pl = await API.call(`/resolve?url=${encodeURIComponent(pageUrl)}`);
        if (!pl?.tracks) throw new Error(t(pageType === 'Discover' ? 'discover' : 'noPlaylist'));
        return {
            key: `playlist:${pl.id}`, label: `« ${pl.title} »`, name: pl.title, playlistId: pl.id,
            getIds: async () => pl.tracks.filter(playable).map((t) => t.id),
        };
    }

    // ═══════════════════════════════════════════════════════════════
    //  PLAYLIST TAMPON — neuve à chaque shuffle (contourne le cache SPA)
    // ═══════════════════════════════════════════════════════════════
    /** Titre : « 🔀 Shuffle+ · <source> ». */
    function bufferTitle(sourceName) {
        const prefix = new RegExp(`^(?:${CFG.BUFFER_TITLE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*·\\s*)+`);
        const name = (sourceName || '').replace(/\s+/g, ' ').trim().replace(prefix, '').slice(0, 60);
        return `${CFG.BUFFER_TITLE}${name ? ` · ${name}` : ''}`;
    }

    /** Adresse aléatoire, distincte du titre : l'app SoundCloud cache les playlists par adresse. */
    const bufferPermalink = () => `shuffle-plus-${Math.random().toString(36).slice(2, 8)}`;

    async function createBuffer(ids, sourceName) {
        const base = { title: bufferTitle(sourceName), permalink: bufferPermalink(), sharing: 'private', description: CFG.BUFFER_DESC, tag_list: CFG.BUFFER_TAGS };
        let pl;
        try {
            pl = await API.call('/playlists', { method: 'POST', body: { playlist: { ...base, tracks: ids } } });
        } catch (e) {
            // Certains comptes/limites refusent la création avec titres : on crée vide puis on remplit
            log('POST avec titres refusé, repli POST+PUT :', e.message);
            pl = await API.call('/playlists', { method: 'POST', body: { playlist: base } });
            await API.call(`/playlists/${pl.id}`, { method: 'PUT', body: { playlist: { tracks: ids } } });
        }
        const path = new URL(pl.permalink_url, location.origin).pathname;
        store.set('buffer_id', pl.id);
        store.set('buffer_path', path); bufferPath = normPath(path);
        return { id: pl.id, path };
    }

    /** Supprime la playlist tampon courante (avant d'en créer une nouvelle). */
    async function deleteBuffer() {
        const id = store.get('buffer_id');
        if (!id) return;
        try { await API.call(`/playlists/${id}`, { method: 'DELETE' }); }
        catch (e) { if (!/API 404/.test(e.message)) log('suppression tampon', e.message); }
        store.del('buffer_id');
        store.del('buffer_path'); bufferPath = '';
    }

    /** Balayage des orphelines (au plus une fois par jour, en arrière-plan). */
    async function sweepBuffers(userId, keepId) {
        const last = store.get('last_sweep', 0);
        if (Date.now() - last < CFG.SWEEP_EVERY_MS) return;
        store.set('last_sweep', Date.now());
        try {
            let url = `/users/${userId}/playlists_without_albums?limit=200`;
            const victims = [];
            while (url && victims.length < CFG.MAX_CLEANUP) {
                const page = await API.call(url);
                for (const p of page.collection || []) {
                    if (p.title?.startsWith(CFG.BUFFER_TITLE) && p.id !== keepId) victims.push(p.id);
                }
                url = page.next_href ? API.rel(page.next_href) : null;
            }
            for (const id of victims.slice(0, CFG.MAX_CLEANUP)) {
                await API.call(`/playlists/${id}`, { method: 'DELETE' });
            }
            if (victims.length) log('playlists tampon orphelines supprimées :', victims.length);
        } catch (e) { log('balayage', e.message); }
    }

    // ═══════════════════════════════════════════════════════════════
    //  STYLES — le bouton reprend les classes natives SoundCloud
    // ═══════════════════════════════════════════════════════════════
    const CSS = `
        .sc-button.${NS}-btn { position: relative; }
        .collectionSection__top > .${NS}-btn, .userNetworkTabs > .${NS}-btn { margin-left: 8px; }
        .listDisplayToggle__options > li > .${NS}-btn { margin: 0; }
        .${NS}-btn svg { width: 16px; height: 16px; display: block; }
        .${NS}-btn[data-state="loading"] svg { animation: ${NS}-mix .8s ease-in-out infinite; }
        .sc-button.${NS}-btn[data-state="done"]  { color: #2ecc71; }
        .sc-button.${NS}-btn[data-state="error"] { color: #ff6b6b; animation: ${NS}-shake .32s ease; }
        .${NS}-btn .${NS}-count {
            position: absolute; top: -6px; right: -6px; min-width: 16px; height: 16px; padding: 0 4px;
            border-radius: 8px; background: var(--sce-accent, #f50); color: #fff; font: 700 9px/16px sans-serif; text-align: center;
            display: none; pointer-events: none;
        }
        .${NS}-btn[data-state="loading"] .${NS}-count:not(:empty) { display: block; }
        @keyframes ${NS}-mix { 0%, 100% { transform: translateX(-2px); } 50% { transform: translateX(2px); } }
        @keyframes ${NS}-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
        @keyframes ${NS}-shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-4px)} 60%{transform:translateX(4px)} }

        /* Bouton « Aléatoire » du lecteur détourné : va-et-vient discret pendant le mélange. */
        .shuffleControl.${NS}-player { position: relative; }
        .shuffleControl.${NS}-player::before {
            content: ''; position: absolute; top: 3px; right: 3px; width: 5px; height: 5px;
            border-radius: 50%; background: var(--sce-accent, #f50); pointer-events: none;
        }
        .shuffleControl.${NS}-player.${NS}-loading svg { animation: ${NS}-mix .8s ease-in-out infinite; }
        .shuffleControl.${NS}-player.${NS}-loading::before { animation: ${NS}-pulse .8s ease-in-out infinite; }

        .${NS}-card-art { position: relative !important; }
        .${NS}-card-action {
            position: absolute; bottom: 8px; width: 34px; height: 34px;
            display: grid; place-items: center; padding: 8px; border: 0; border-radius: 50%;
            background: #fff; color: #111; cursor: pointer; opacity: 0; pointer-events: none;
            box-shadow: 0 2px 8px #0006;
        }
        .${NS}-card-action svg { width: 18px; height: 18px; }
        .${NS}-card-shuffle {
            right: 8px; z-index: 5;
        }
        .audibleTile:hover .${NS}-card-action,
        .soundList__item:hover .${NS}-card-action,
        .searchList__item:hover .${NS}-card-action,
        .sound:hover .${NS}-card-action,
        .playlist:hover .${NS}-card-action,
        .${NS}-card-art:hover > .${NS}-card-action,
        .${NS}-card-action:focus-visible { opacity: 1; pointer-events: auto; }
        .${NS}-card-action:hover { color: var(--sce-accent, #f50); }

        .${NS}-toast {
            position: fixed; left: 50%; bottom: 64px; transform: translate(-50%, 12px);
            max-width: min(560px, calc(100vw - 32px)); padding: 9px 14px; border-radius: 6px;
            background: #1f1f1f; color: #fff; font: 500 13px/1.4 Söhne, system-ui, -apple-system, "Segoe UI", Roboto, Ubuntu, Cantarell, "Noto Sans", sans-serif;
            box-shadow: 0 6px 24px rgba(0,0,0,.45); border: 1px solid rgba(255,255,255,.08);
            opacity: 0; transition: opacity .18s, transform .18s; z-index: 99999; pointer-events: none;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .${NS}-toast.m-visible { opacity: 1; transform: translate(-50%, 0); }
        .${NS}-toast.m-error   { border-color: rgba(255,107,107,.5); color: #ffb3b3; }
        @media (prefers-reduced-motion: reduce) {
            .${NS}-btn svg, .${NS}-toast, .shuffleControl.${NS}-player svg, .shuffleControl.${NS}-player::before { animation: none !important; transition: none !important; }
        }
    `;

    function injectStyles() {
        if (document.getElementById(`${NS}-styles`)) return;
        const s = document.createElement('style');
        s.id = `${NS}-styles`;
        s.textContent = CSS;
        document.head.appendChild(s);
    }

    // ═══════════════════════════════════════════════════════════════
    //  TOAST
    // ═══════════════════════════════════════════════════════════════
    const Toast = (() => {
        let el = null, timer = null;
        function show(msg, { error = false, sticky = false } = {}) {
            if (!el) { el = document.createElement('div'); el.className = `${NS}-toast`; document.body.appendChild(el); }
            el.textContent = msg;
            el.classList.toggle('m-error', error);
            requestAnimationFrame(() => el.classList.add('m-visible'));
            clearTimeout(timer);
            if (!sticky) timer = setTimeout(hide, CFG.TOAST_MS);
        }
        function hide() { clearTimeout(timer); el?.classList.remove('m-visible'); }
        return { show, hide };
    })();

    // ═══════════════════════════════════════════════════════════════
    //  BOUTON
    // ═══════════════════════════════════════════════════════════════
    const ICON = `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M11.5 1.5l3 3-3 3V5.75h-1.2c-.5 0-.97.25-1.25.66L7.9 8l-1.15-1.6.6-.84A3 3 0 0 1 10.3 4.25h1.2V1.5zM1 4.25h2.3a3 3 0 0 1 2.45 1.27l3.3 4.62c.28.41.75.66 1.25.66h1.2V8.5l3 3-3 3v-2.25h-1.2a3 3 0 0 1-2.45-1.27L4.55 6.36a1.5 1.5 0 0 0-1.25-.61H1v-1.5zM1 10.25h2.3c.5 0 .97-.25 1.25-.66l.6-.84L6.3 10.35l-.55.77A3 3 0 0 1 3.3 12.4H1v-1.5z" fill="currentColor"/>
    </svg>`;

    function buildButton() {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `${NS}-btn sc-button-secondary sc-button sc-button-medium sc-button-icon sc-button-responsive`;
        btn.dataset.state = State.IDLE;
        btn.innerHTML = `<div>${ICON}</div><span class="sc-button-label sc-visuallyhidden">${t('shuffle')}</span><span class="${NS}-count"></span>`;
        return btn;
    }

    // ═══════════════════════════════════════════════════════════════
    //  CONTRÔLEUR
    // ═══════════════════════════════════════════════════════════════
    class ShuffleController {
        constructor(btn, pageType) {
            this.btn = btn;
            this.pageType = pageType;
            this.state = State.IDLE;
            this.count = btn.querySelector(`.${NS}-count`);
            this.resetTimer = null;
            this.busy = false;
            this.isBufferPage = pageType === 'Playlist' && isBufferPath();
            this.setTip();
        }

        setTip(text) {
            const last = store.get('last_source');
            this.btn.title = text ?? (this.isBufferPage && last
                ? t('tipBuffer', { src: last.label, k: CFG.HOTKEY })
                : t('tip', { k: CFG.HOTKEY }));
        }

        setState(state) {
            this.state = state;
            this.btn.dataset.state = state;
            if (state !== State.LOADING) this.count.textContent = '';
        }

        flash(state, ms) {
            this.setState(state);
            clearTimeout(this.resetTimer);
            this.resetTimer = setTimeout(() => { this.setState(State.IDLE); this.setTip(); }, ms);
        }

        async toggle({ force = false } = {}) {
            if (this.busy) { Toast.show(t('busy')); return; }
            this.busy = true;
            clearTimeout(this.resetTimer);
            this.setState(State.LOADING);
            this.setTip(t('busy'));
            try {
                await this.run({ force });
            } catch (err) {
                console.warn('[Shuffle+]', err);
                Toast.show(err.message || t('error'), { error: true });
                this.flash(State.ERROR, CFG.ERROR_RESET_MS);
            } finally {
                this.busy = false;
            }
        }

        run({ force }) {
            return doShuffle({
                force,
                pickSource: (me, opts) => this.isBufferPage ? sourceFromLast(me, opts) : resolveSource(this.pageType, opts),
                onProgress: (n) => { this.count.textContent = n > 999 ? `${Math.round(n / 100) / 10}k` : String(n); },
                onDone: () => this.flash(State.DONE, CFG.DONE_RESET_MS),
            });
        }
    }

    /** Source = dernière source mémorisée (utilisée depuis la playlist tampon ou le lecteur). */
    async function sourceFromLast(me, opts) {
        const last = store.get('last_source');
        if (!last) return null;
        if (last.key.startsWith('likes:')) {
            const uid = last.key.slice(6);
            const user = String(uid) === String(me.id) ? me : await API.call(`/users/${uid}`);
            return { key: last.key, label: last.label, name: last.name, getIds: () => fetchLikes(uid, user.likes_count ?? -1, { ...opts, own: user === me }) };
        }
        const pl = await API.call(`/playlists/${last.key.slice(9)}`);
        return { key: last.key, label: last.label, name: last.name || pl.title, getIds: async () => pl.tracks.filter(playable).map((t) => t.id) };
    }

    /**
     * Séquence complète : source → identifiants → mélange → playlist tampon → lecture.
     * @param {object} o
     * @param {boolean}  o.force        resynchro complète du cache des likes
     * @param {Function} o.pickSource   (me, opts) => source | null
     * @param {Function} [o.onProgress] (n, total)
     * @param {Function} [o.onDone]
     */
    async function doShuffle({ force = false, pickSource, onProgress, onDone }) {
        const progress = (n, total) => {
            onProgress?.(n, total);
            Toast.show(total > 0 ? t('syncing', { n, t: total }) : t('syncingN', { n }), { sticky: true });
        };

        const me = await API.call('/me');
        const opts = { force, onProgress: progress, meId: me.id };
        let source = await pickSource(me, opts);
        const isBufferSource = (src) => !!src && (src.key === `playlist:${store.get('buffer_id')}` || (src.name || '').startsWith(CFG.BUFFER_TITLE));
        const fromLast = () => sourceFromLast(me, opts).catch((e) => { log('dernière source indisponible', e.message); store.del('last_source'); return null; });
        if (isBufferSource(source)) source = await fromLast(); // jamais la playlist tampon comme source
        if (!source) source = await fromLast();
        if (!source) source = await resolveSource('Likes', opts); // dernier recours : tes Likes

        Toast.show(t('reading', { src: source.label }), { sticky: true });
        const ids = await source.getIds();
        if (ids.length < 2) throw new Error(t('tooFew'));
        store.set('last_source', { key: source.key, label: source.label, name: source.name });

        // Tours sans répétition : on ne retire que des titres pas encore joués dans le tour courant ;
        // quand la bibliothèque est épuisée, un nouveau tour commence.
        let picked, roundInfo = '';
        if (settings().noRepeat !== false && ids.length > CFG.MAX_TRACKS) {
            const rk = `round:${source.key}`;
            const round = store.get(rk) || { drawn: [], n: 1 };
            const drawnSet = new Set(round.drawn);
            let pool = ids.filter((id) => !drawnSet.has(id));
            if (!pool.length) { round.drawn = []; round.n += 1; drawnSet.clear(); pool = ids; }
            picked = shuffle(pool).slice(0, CFG.MAX_TRACKS);
            const idSet = new Set(ids);                                   // O(n) et non O(n²) sur les grandes bibliothèques
            round.drawn = [...drawnSet, ...picked].filter((id) => idSet.has(id));
            if (round.drawn.length >= ids.length) { round.drawn = []; round.n += 1; }
            store.set(rk, round);
            const remaining = ids.length - (round.drawn.length || 0);
            roundInfo = ` · ${t('round', { n: round.drawn.length ? round.n : round.n - 1 })}${round.drawn.length ? ` · ${t('remaining', { n: remaining })}` : ''}`;
        } else {
            picked = shuffle(ids).slice(0, CFG.MAX_TRACKS);
        }
        const summary = (picked.length < ids.length
            ? t('drawn', { n: picked.length, t: ids.length })
            : t('shuffled', { n: picked.length })) + roundInfo;
        await playIds(me, picked, { name: source.name, label: source.label, summary, onDone });
    }

    /**
     * Joue une liste d'identifiants dans l'ordre donné via la playlist tampon.
     * Utilisé par le shuffle et par la Bibliothèque (lecture d'une sélection triée).
     */
    async function playIds(me, ids, { name, label, summary, onDone } = {}) {
        me = me || await API.call('/me');
        const picked = ids.slice(0, CFG.MAX_TRACKS);
        summary = summary || t('shuffled', { n: picked.length }).replace(/\S+$/, '').trim() || `${fmt(picked.length)}`;
        Toast.show(t('writing'), { sticky: true });
        await deleteBuffer();                       // jamais deux playlists tampon à la fois
        const buffer = await createBuffer(picked, name);
        onDone?.();
        Toast.show(t('launching'), { sticky: true });

        // Navigation interne (pas de rechargement : la playlist est neuve,
        // l'app n'en a aucune version en cache), puis Lecture.
        const played = await navigateAndPlay(buffer.path);
        emit({ type: 'shuffled', source: name || label, count: picked.length, total: ids.length, at: Date.now() });
        if (played) {
            Toast.show(`🔀 ${summary}${label ? ` · ${label}` : ''}`);
            sweepBuffers(me.id, buffer.id); // arrière-plan, au plus une fois par jour
        } else {
            // Repli : rechargement complet avec lecture automatique au chargement
            store.set('pending_toast', `🔀 ${summary}${label ? ` · ${label}` : ''}`);
            location.assign(buffer.path + CFG.PLAY_HASH);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  BOUTON « ALÉATOIRE » DU LECTEUR — trois modes au choix
    // ═══════════════════════════════════════════════════════════════
    const PlayerShuffle = (() => {
        let btn = null, busy = false, nativeClicks = false;

        function mode() {
            const s = store.get('settings') || {};
            return ['queue', 'native', 'plus'].includes(s.shuffleMode) ? s.shuffleMode : s.hijackPlayerShuffle === false ? 'native' : 'queue';
        }

        function nativeClick() {
            nativeClicks = true;
            try { btn?.click(); } finally { nativeClicks = false; }
        }

        /** Charge progressivement toute la file, puis relance le mélange du lecteur sans requête API. */
        async function shuffleLoadedQueue() {
            const queue = $('.queue');
            const toggle = $('.playbackSoundBadge__showQueue');
            if (!queue || !toggle || !btn) throw new Error(t('noQueue'));
            const wasOpen = queue.classList.contains('m-visible');
            let hidden = false;
            if (!wasOpen) {
                let style = document.getElementById(`${NS}-queue-style`);
                if (!style) {
                    style = document.createElement('style'); style.id = `${NS}-queue-style`;
                    style.textContent = `.queue.${NS}-queue-loading { visibility: hidden !important; pointer-events: none !important; transition: none !important; }`;
                    document.head.appendChild(style);
                }
                queue.classList.add(`${NS}-queue-loading`); hidden = true;
                toggle.click();
                await sleep(500);
            }
            try {
                const scroller = $('.queue__scrollableInner, .queue__scrollable', queue);
                if (!scroller) throw new Error(t('noQueue'));
                let previous = -1, unchanged = 0;
                const start = Date.now();
                while (unchanged < 4 && Date.now() - start < 90000) {
                    const height = scroller.scrollHeight;
                    scroller.scrollTop = height;
                    scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
                    await sleep(700);
                    const next = scroller.scrollHeight;
                    unchanged = next === previous && scroller.scrollTop + scroller.clientHeight >= next - 2 ? unchanged + 1 : 0;
                    previous = next;
                }
                if (unchanged < 4) throw new Error(t('queueIncomplete'));
                if (btn.classList.contains('m-shuffling')) { nativeClick(); await sleep(80); }
                nativeClick();
            } finally {
                if (!wasOpen) $('.queue__hide')?.click();
                if (hidden) queue.classList.remove(`${NS}-queue-loading`);
            }
        }

        /** Contexte de lecture : playlist du titre en cours (?in=…), sinon page courante. */
        async function pickSource(me, opts) {
            const href = $(SEL.badgeLink)?.getAttribute('href') || '';
            const inCtx = new URL(href, location.origin).searchParams.get('in');
            if (inCtx) {
                const path = '/' + inCtx.replace(/^\/+/, '').replace(/\/+$/, '');
                if (!isBufferPath(path)) {                         // pas la playlist tampon elle-même
                    const type = detectPageType(path);
                    if (type === 'Playlist' || type === 'Discover') {
                        try { return await resolveSource(type, opts, location.origin + path); }
                        catch (e) { log('contexte lecteur non résolu', e.message); }
                    }
                }
            }
            const pageType = detectPageType();
            if (pageType && !isBufferPath()) return resolveSource(pageType, opts);
            return null; // → dernière source, puis Likes
        }

        async function onClick(e) {
            const selected = mode();
            if (nativeClicks || e.altKey || selected === 'native') return;
            e.preventDefault();
            e.stopImmediatePropagation();
            if (busy) { Toast.show(t('busy')); return; }
            busy = true;
            btn?.classList.add(`${NS}-loading`);
            try {
                if (selected === 'plus') await doShuffle({ force: e.shiftKey, pickSource });
                else await shuffleLoadedQueue();
            } catch (err) {
                console.warn('[Shuffle+]', err);
                Toast.show(err.message || t('error'), { error: true });
            } finally {
                busy = false;
                btn?.classList.remove(`${NS}-loading`);
            }
        }

        function mark() {
            const el = $(SEL.shuffleControl);
            if (!el) return;
            btn = el;
            btn.classList.add(`${NS}-player`);
            btn.title = t({ plus: 'playerPlus', native: 'playerNative', queue: 'playerQueue' }[mode()]);
        }

        return {
            start() {
                // Écoute en phase de capture pour passer avant le gestionnaire SoundCloud
                document.addEventListener('click', (e) => {
                    if (e.target?.closest?.(SEL.shuffleControl)) onClick(e);
                }, true);
                mark();
                window.addEventListener('sce:settings-change', mark);   // l'infobulle suit le mode choisi
            },
            /** Appelé par l'observateur DOM : coût nul si le bouton est toujours là. */
            ensure() { if (!btn?.isConnected) mark(); },
            /** Shuffle de la lecture en cours, sans passer par un clic. */
            trigger(force = false) {
                mark();
                if (mode() === 'native') { nativeClick(); return; }
                return onClick({ altKey: false, shiftKey: force, preventDefault() {}, stopImmediatePropagation() {} });
            },
            mode,
            enableNative() { mark(); if (btn && !btn.classList.contains('m-shuffling')) nativeClick(); },
            disableNative() { mark(); if (btn?.classList.contains('m-shuffling')) nativeClick(); },
        };
    })();

    /** Bouton sur les pochettes de playlists, ajouté lors du survol (les cartes sont chargées à la demande). */
    function setupPlaylistCardShuffle() {
        const cardSelector = '.soundList__item, .searchList__item, .audibleTile, .sound, .playlist';
        const artSelector = '.playableTile__artwork, .sound__artwork, .audibleTile__artwork, .playlist__artwork, .sound__coverArt, .image';
        const add = (target) => {
            const card = target.closest?.(cardSelector);
            if (!card) return;
            const link = card.querySelector('a[href*="/sets/"]');
            if (!link) return;
            const path = new URL(link.href, location.origin).pathname;
            if (detectPageType(path) !== 'Playlist' || isBufferPath(path)) return;
            const art = card.querySelector(artSelector);
            if (!art || art.querySelector(`.${NS}-card-shuffle`)) return;
            art.classList.add(`${NS}-card-art`);
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `${NS}-card-action ${NS}-card-shuffle`;
            button.title = t('cardShuffle');
            button.setAttribute('aria-label', button.title);
            button.innerHTML = ICON;
            button.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (button.disabled) return;
                button.disabled = true;
                try {
                    if (PlayerShuffle.mode() === 'plus') {
                        await doShuffle({ pickSource: (_me, opts) => resolveSource('Playlist', opts, link.href) });
                    } else {
                        const play = card.querySelector('.sc-button-play, .playButton');
                        if (play && !play.classList.contains('sc-button-pause')) play.click();
                        else if (!await navigateAndPlay(path)) throw new Error(t('noPlay'));
                        await waitFor(SEL.shuffleControl, { timeout: 8000 });
                        await sleep(500);
                        if (PlayerShuffle.mode() === 'native') PlayerShuffle.enableNative();
                        else await PlayerShuffle.trigger();
                    }
                } catch (error) {
                    Toast.show(error.message || t('error'), { error: true });
                } finally { button.disabled = false; }
            });
            art.appendChild(button);
        };
        document.addEventListener('mouseover', (event) => add(event.target));
        document.addEventListener('focusin', (event) => add(event.target));
    }

    /** Clique sur un lien interne (routeur SPA), attend le gros bouton Lecture, clique. */
    async function navigateAndPlay(path) {
        const oldPlay = $(SEL.heroPlay); // bouton de la page courante, à ignorer
        const a = document.createElement('a');
        a.href = path;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
        try {
            const play = await new Promise((resolve, reject) => {
                const check = () => {
                    if (location.pathname !== path) return null;
                    const el = $(SEL.heroPlay);
                    return el && el !== oldPlay ? el : null;
                };
                const first = check();
                if (first) return resolve(first);
                const obs = new MutationObserver(() => { const el = check(); if (el) { clearTimeout(timer); obs.disconnect(); resolve(el); } });
                obs.observe(document.body, { childList: true, subtree: true });
                const timer = setTimeout(() => { obs.disconnect(); reject(new Error('lecteur introuvable')); }, CFG.NAV_TIMEOUT_MS);
            });
            await sleep(120);
            play.click();
            await sleep(600);
            PlayerShuffle.disableNative(); // ordre déjà mélangé
            return true;
        } catch (e) {
            log('navigation SPA sans lecteur, repli rechargement :', e.message);
            return false;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  AUTOPLAY après rechargement sur la playlist tampon
    // ═══════════════════════════════════════════════════════════════
    async function autoplayIfRequested() {
        if (location.hash !== CFG.PLAY_HASH) return;
        history.replaceState(null, '', location.pathname + location.search);
        try {
            const play = await waitFor(SEL.heroPlay, { timeout: 15000 });
            await sleep(150);
            play.click();
            // Ordre déjà mélangé : on désactive le shuffle natif pour que la
            // liste affichée corresponde à l'ordre de lecture.
            await sleep(800);
            PlayerShuffle.disableNative();
            const msg = store.get('pending_toast');
            if (msg) { store.del('pending_toast'); Toast.show(msg); }
        } catch (e) {
            log('autoplay', e.message);
            Toast.show(t('ready'), { error: true });
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  MONTAGE / ROUTAGE SPA
    // ═══════════════════════════════════════════════════════════════
    let current = null;
    let mountSeq = 0;

    function unmount() {
        if (!current) return;
        const btn = current.ctrl.btn;
        (btn.parentElement?.matches('li.sc-mr-1x, div.systemPlaylistDetails__button') ? btn.parentElement : btn).remove();
        current = null;
    }

    function insertButton(pageType, anchor, btn) {
        switch (pageType) {
            case 'Likes':
                if (anchor.classList.contains('listDisplayToggle__options')) {
                    // Même rangée que les boutons « Afficher » (grille / liste), même espacement
                    const li = document.createElement('li');
                    li.className = 'sc-mr-1x';
                    li.appendChild(btn);
                    anchor.appendChild(li);
                } else {
                    anchor.insertBefore(btn, anchor.children[2] || null);
                }
                break;
            case 'Playlist': (anchor.classList.contains('sc-button-group') ? anchor : (anchor.children[0] || anchor)).appendChild(btn); break;
            case 'Discover': {
                // Même enveloppe que les boutons voisins, avant la description qui prend l'espace restant
                const wrap = document.createElement('div');
                wrap.className = 'systemPlaylistDetails__button';
                wrap.appendChild(btn);
                anchor.insertBefore(wrap, anchor.querySelector(SEL.discoverDesc));
                break;
            }
            default:         anchor.appendChild(btn);
        }
    }

    async function mount() {
        const pageType = detectPageType();
        const pathname = location.pathname;
        if (current && current.pathname === pathname && current.ctrl.btn.isConnected) return;
        unmount();
        if (!pageType) return;
        // Pas de bouton sur la playlist tampon elle-même : on y arrive déjà mélangé.
        if (pageType === 'Playlist' && isBufferPath()) return;

        const seq = ++mountSeq;
        let anchor;
        try { anchor = await waitFor(SEL.anchors[pageType], { timeout: 15000 }); }
        catch {
            const fb = SEL.anchorsFallback[pageType];
            if (!fb) return;
            try { anchor = await waitFor(fb, { timeout: 3000 }); } catch { return; }
        }
        if (seq !== mountSeq || location.pathname !== pathname || $(SEL.button)) return;

        const btn = buildButton();
        const ctrl = new ShuffleController(btn, pageType);
        btn.addEventListener('click', (e) => ctrl.toggle({ force: e.shiftKey }));
        insertButton(pageType, anchor, btn);
        current = { ctrl, pageType, pathname };
        log('bouton monté :', pageType);
    }

    /** Sur la playlist tampon, masque l'invite « Voici quelques tags pour vous aider à démarrer ». */
    function hideTagPrompt() {
        if (!isBufferPath()) return;
        const re = /tags pour vous aider|tags to help|tags to get you started|Tags hinzu|etiquetas para|tag per aiut|tags para ajud/i;
        for (const el of document.querySelectorAll('h2, h3, h4, p, strong')) {
            if (el.children.length || !re.test(el.textContent) || el.dataset.scspHidden) continue;
            // remonte jusqu'au bloc d'invite (classe contenant « tag »), au plus 6 niveaux
            let box = el, n = 0;
            while (box.parentElement && n < 6 && !/tag/i.test(box.className)) { box = box.parentElement; n++; }
            (n < 6 ? box : el.parentElement?.parentElement || el).style.display = 'none';
            el.dataset.scspHidden = '1';
        }
    }

    function setupRouter() {
        let timer = null;
        const schedule = () => { clearTimeout(timer); timer = setTimeout(mount, CFG.MOUNT_DEBOUNCE_MS); };
        for (const fn of ['pushState', 'replaceState']) {
            const orig = history[fn];
            history[fn] = function (...a) { const r = orig.apply(this, a); schedule(); return r; };
        }
        window.addEventListener('popstate', schedule);
        window.__sceShared.onDom(() => {
            hideTagPrompt();
            if (current ? !current.ctrl.btn.isConnected : !!detectPageType()) schedule();   // hors page concernée : aucun minuteur relancé
            PlayerShuffle.ensure();
        });
    }

    function setupHotkeys() {
        document.addEventListener('keydown', (e) => {
            const el = document.activeElement;
            if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
            if (e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && e.key?.toUpperCase() === CFG.HOTKEY && current) {
                e.preventDefault();
                current.ctrl.toggle();
            }
        });
    }

    // ═══════════════════════════════════════════════════════════════
    //  RÉGLAGES (synchronisés par le pont) + COMMANDES EXTERNES
    // ═══════════════════════════════════════════════════════════════
    const settings = () => ({ shuffleMode: 'queue', noRepeat: true, ...(store.get('settings') || {}) });

    /** Déclenche un shuffle depuis l'extérieur (popup, raccourci global). */
    function triggerShuffle(force = false) {
        PlayerShuffle.trigger(force);
    }

    window.addEventListener('message', (e) => {
        if (e.source !== window || !e.data || e.data.scsp !== 'command') return;
        if (e.data.command === 'shuffle') triggerShuffle(!!e.data.force);
    });

    const emit = (payload) => window.postMessage({ scsp: 'event', ...payload }, location.origin);

    /** API interne partagée avec les autres modules du monde principal (library.js). */
    window.__scsp = Object.freeze({
        api: API.call,
        me: () => API.call('/me'),
        likesIds: (userId, count, opts) => fetchLikes(userId, count, { own: true, ...opts }),
        playIds: (ids, opts) => playIds(null, ids, opts),
        shuffleIds: async (ids, opts = {}) => playIds(null, shuffle(ids), { ...opts, summary: t(ids.length > CFG.MAX_TRACKS ? 'drawn' : 'shuffled', { n: Math.min(ids.length, CFG.MAX_TRACKS), t: ids.length }) }),
        toast: (msg, o) => Toast.show(msg, o),
        /** Ouvre une page SoundCloud (SPA) et clique sur Lecture : lire un titre seul, une playlist… */
        openAndPlay: (path) => navigateAndPlay(path),
        maxTracks: CFG.MAX_TRACKS,
        lang: LANG,
    });

    // ═══════════════════════════════════════════════════════════════
    //  INIT
    // ═══════════════════════════════════════════════════════════════
    injectStyles();
    setupRouter();
    setupHotkeys();
    PlayerShuffle.start();
    setupPlaylistCardShuffle();
    mount();
    autoplayIfRequested();
})();
