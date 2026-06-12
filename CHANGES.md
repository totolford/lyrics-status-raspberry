# Modifications apportées au fork — Lyrics Status V2

Projet original : [OvalQuilter/lyrics-status](https://github.com/OvalQuilter/lyrics-status)

---

## Suppression complète du système Spotify API

**Original** : Le script tentait de capturer le Bearer token Spotify (via `fetch`, `XHR`, Service Worker) pour appeler l'API `/v1/me/player` et récupérer la chanson en cours, la progression, et les paroles via `sp-lyrics`.

**Raison de la suppression** : L'API Spotify ajoute les headers d'authentification au niveau du Service Worker (niveau réseau), inaccessible depuis le contexte page. Les tentatives de hook n'ont jamais réussi à capturer un token valide.

**Remplacement** : Lecture directe du DOM de Spotify.

---

## Lecture du DOM Spotify à la place de l'API

Nouvelles sources de données :

| Donnée | Sélecteur DOM utilisé |
|---|---|
| Titre de la chanson | `[data-testid="context-item-info-title"]` |
| Artiste | `a[href*="/artist/"]` dans la zone now-playing |
| ID de la piste | `href` du lien `/track/` dans le titre |
| État lecture/pause | `button[aria-label*="ause"]` (pause) / `button[aria-label*="Play"]` (play) |
| Progression | `[data-testid="playback-progressbar"] input[type="range"]` → `aria-valuenow` / `aria-valuemax` |

---

## Remplacement du système de paroles

**Original** : Paroles via l'API interne Spotify (`/lyrics`) nécessitant le token.

**Nouveau** : API publique gratuite **LRCLib** (`lrclib.net`).

- Requête principale : `GET /api/get?track_name=...&artist_name=...&duration=...`
- Fallback si échec : `GET /api/search?q=artist+title`
- Support du format **LRC** (timestamps `[MM:SS.xx]`) → paroles synchronisées
- Support des paroles **non-synchronisées** (plain text) avec découpage uniforme dans le temps
- Parseur LRC ajouté : fonction `parseLRC(lrc)`
- Aucune authentification requise

---

## Cache de paroles

- `Map` en mémoire keyed par track ID
- Entrée `{ found: true, syncType, lines }` ou `{ found: false }`
- Chargement instantané si la chanson a déjà été jouée dans la session
- Onglet **Paroles** dans l'UI : liste les tracks avec indicateur ✓ (paroles trouvées) ou ✗ (non trouvées)
- Logs dans l'onglet Run : `Paroles trouvées — Titre` / `Paroles non trouvées — Titre`

---

## Nouvelle logique de synchronisation des paroles

**Problèmes originaux corrigés :**

1. **Paroles à rebours / oscillation** : Remplacement de la sélection naïve par un scan déterministe — dernière parole dont `time ≤ trackProgress + offset`. Garde anti-retour : bloque les sauts en arrière < 1500ms (jitter DOM), autorise les vrais seeks utilisateur.

2. **Dérive de progression** : Suppression de `trackProgress += 150` (s'accumulait même en pause). Remplacement par `readProgress()` appelé toutes les 150ms qui lit la vraie valeur du slider DOM.

3. **Progression figée à 0 / bug `ended()`** : `ended()` retournait `true` quand `trackDuration = 0` (0 ≥ 0), bloquant tout envoi. Corrigé : `if (trackDuration > 0 && ended())`.

4. **Jitter du seekbar** : `readProgress()` accepte uniquement les mouvements en avant ou les grands sauts arrière (seeks). Les micro-variations < 500ms en arrière sont filtrées.

---

## Nouveau format du statut Discord

**Original** : `🎵 Song lyrics - Lyrics text 🎵` avec timestamp optionnel.

**Nouveau** :
- **Paroles en cours** : `"𝘭𝘺𝘳𝘪𝘤𝘴 𝘵𝘦𝘹𝘵"` — texte en italique Unicode (Math Sans-Serif Italic U+1D608–1D63B), entre guillemets, aucun emoji
- **Recherche en cours** : `🔍 𝘛𝘪𝘵𝘳𝘦 — 𝘈𝘶𝘵𝘦𝘶𝘳` (dès la détection de la chanson, pendant le fetch LRCLib)
- **Paroles non trouvées** : `♪ 𝘛𝘪𝘵𝘳𝘦 — 𝘈𝘶𝘵𝘦𝘶𝘳 ♪` (titre et artiste en italique Unicode)
- **Pause** : `⏸ En pause`
- **Aucune lecture** : `Connecté`
- Aucun emoji dans `emoji_name` (champ null)

Fonction ajoutée : `toItalic(text)` — convertit les lettres ASCII a–z / A–Z en équivalents Unicode italiques.

---

## Système de censure

Nouveau système appliqué à **toutes les chaînes** envoyées à Discord (paroles, titre, artiste).

- **Base de données en ligne** : chargement au démarrage des listes FR + EN de [LDNOOBW](https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words) (~800+ mots)
- **Mots personnalisés** : textarea dans Config (un mot par ligne, sauvegardé en localStorage)
- **Regex unique pré-compilée** : une seule RegExp alternée `(mot1|mot2|...)` reconstruite à chaque modification de liste (performances)
- **Limites Unicode** : `(?<![a-zA-ZÀ-ÿ0-9])..(?![a-zA-ZÀ-ÿ0-9])` au lieu de `\b` — couvre les caractères accentués français (é, è, à, û...) où `\b` JavaScript échouait silencieusement
- Remplacement par `***`

---

## Nouvelle interface utilisateur (réécriture complète)

**Original** : UI sombre générique, largeur fixe, 4 onglets (Run / Settings / Debug / Paroles) avec `width: 133px` par tab.

**Nouveau** :
- Design dark compact, coins arrondis (14px), ombre portée
- Police système (`Segoe UI`, `system-ui`)
- Header : indicateur ● animé (vert/rouge) + titre + bouton ✕
- Tabs : 4 onglets à largeur égale (`flex: 1`) avec underline actif bleu-violet (`#818cf8`)
- Fenêtre **déplaçable** (drag sur le header) + **redimensionnable** (`resize: both`)
- **Onglet Run** : carte "Now Playing" (titre + parole courante), log scrollable, boutons Démarrer/Arrêter
- **Onglet Config** : token (masqué), offset, toggle autorun, slider opacité, textarea censure, bouton test Discord
- **Onglet Debug** : grille chanson / progression / paroles / Discord / moyennes 2 et 10 requêtes
- **Onglet Paroles** : liste scrollable des tracks avec statut ✓/✗
- Touche **Échap** pour masquer/afficher

---

## Suppression de fonctionnalités

| Fonctionnalité supprimée | Raison |
|---|---|
| Préchargement de la file d'attente (`getQueueTracks`, `preloadNextTrack`, `cacheTrackLyrics`) | Sélecteurs DOM incorrects (`queue-track`, `tracklist-row`) → toujours 0 résultats ; complexité non justifiée |
| Options "Status view" avancées (timestamp, label, custom status format, autooffset) | Simplification de l'UI |
| Indicateur de file d'attente dans Debug | Supprimé avec le preload |
| Moyennes 30 requêtes Discord | Simplifié à 2 et 10 |

---

## Améliorations diverses

- `emoji_name: null` dans tous les appels Discord (suppression de 🎵 dans les requêtes API)
- `checkToken()` affiche ✓ Valide / ✗ Invalide avec couleur pendant 2.5s
- Bouton "Envoyer un statut test" → envoie `"𝘛𝘦𝘴𝘵 𝘓𝘺𝘳𝘪𝘤𝘴 𝘚𝘵𝘢𝘵𝘶𝘴"` directement sur Discord
- `expires_at` à +60s sur chaque statut Discord
- `readProgress._el` mis en cache pour éviter les requêtes DOM répétées
- Interception Service Worker, fetch, XHR conservée (tentative token Spotify, non bloquante)
