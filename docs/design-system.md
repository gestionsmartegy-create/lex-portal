# Design system — Portail Client Lex Canada

> Relevé le 2026-10-01 sur la maquette https://lexcanada-jdkordhm.manus.space/portal : variables CSS, styles calculés et composants du code de la maquette.
> Ces valeurs sont **la référence visuelle**. La maquette sert de modèle de design : on ne copie pas son code (React/Vite, données en dur).
> Le site public lexcanadalaw.com utilise la même palette marine/or.

## 1. Couleurs

### Marque

| Token | Valeur | Usage |
|---|---|---|
| `--marine` | `#0D1B3E` | Couleur principale : barre latérale, titres, bouton principal, texte fort |
| `--marine-light` | `#162347` | Survol et état actif dans la barre latérale |
| `--gold` | `#B8962E` | Accent : liens, état « actif », icônes des cartes, focus des champs |
| `--gold-light` | `#D4AF5A` | Survol des éléments dorés |
| `--gold-pale` | `#F5E9C8` | Fond des alertes « action requise » |
| `--gold-ink` | `#7F6416` | **Liens et petits textes dorés** (AA sur blanc, `surface` et `gold-pale` ; ADR 0006, ajusté par ADR 0011) |
| `--cream` | `#FDF8EE` | Fond d'encart doux |

### Neutres

| Token | Valeur | Usage |
|---|---|---|
| `--surface` | `#F4F5F7` | Fond de l'application, survol des lignes de liste |
| `--surface-alt` | `#F8F9FB` | Fond secondaire |
| `--white` | `#FFFFFF` | Cartes, en-tête |
| `--ink-muted` | `#4A4A5A` | Texte courant secondaire |
| `--ink-subtle` | `#8A8A9A` | Sous-titres, métadonnées, dates |
| `--border` | Tailwind `gray-100` / `gray-200` | Bordures des cartes et séparateurs |

### Tokens shadcn/ui (repris tels quels, en OKLCH)

```css
:root {
  --background: oklch(100% 0 0);
  --foreground: oklch(13% .02 265);
  --card: oklch(100% 0 0);
  --card-foreground: oklch(13% .02 265);
  --popover: oklch(100% 0 0);
  --popover-foreground: oklch(13% .02 265);
  --primary: oklch(22% .07 265);            /* ≈ marine */
  --primary-foreground: oklch(100% 0 0);
  --secondary: oklch(96% .005 265);
  --secondary-foreground: oklch(22% .07 265);
  --muted: oklch(96% .003 265);
  --muted-foreground: oklch(55% .015 265);
  --accent: oklch(72% .12 75);              /* ≈ or */
  --accent-foreground: oklch(15% .05 265);
  --destructive: oklch(57.7% .245 27.325);
  --destructive-foreground: oklch(98.5% 0 0);
  --border: oklch(91% .005 265);
  --input: oklch(91% .005 265);
  --ring: oklch(72% .12 75);                /* anneau de focus doré */
  --radius: .375rem;
}
```

### Statuts (badges)

| Classe | Texte | Fond | Utilisé pour |
|---|---|---|---|
| `status-active` | `#B8962E` | `#B8962E` à 15 % | Dossier actif |
| `status-pending` | `#3B82F6` | `#3B82F6` à 10 % | En attente, document téléversé |
| `status-completed` | `#16A34A` | `#22C55E` à 10 % | Terminé, signé, payé |
| `status-urgent` | `#DC2626` | `#EF4444` à 10 % | Action requise, signature requise, facture due ou en retard, **conflit, retard** |
| `status-warning` (ADR 0033) | `warning-ink #92400E` | `#F59E0B` à 20 % | **À confirmer**, en attente d'une décision (date de cour) |

**Règle des couleurs (ADR 0033)** : ambre = à confirmer ; rouge = conflit ou retard ; vert = confirmé, terminé ; une seule couleur par sens, sur tous les écrans.

Badge : `inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[.06em] rounded-[2px]`.

**Accessibilité (ADR 0006, décidé) :** le doré `#B8962E` sur blanc a un contraste ≈ 2,8:1. Il reste utilisé pour les icônes, bordures, focus et grands textes. **Les liens et textes dorés de moins de 18px utilisent `gold-ink #7F6416`** (5,6:1 sur blanc, 5,15:1 sur `surface`, 4,65:1 sur `gold-pale` ; ADR 0011). `ink-subtle #8A8A9A` (≈ 3,4:1) est réservé aux textes ≥ 14px ; en dessous, utiliser `ink-muted`.

## 1 bis. Logo

| Fichier | Usage |
|---|---|
| `public/brand/logo-mark-white.png` (700×242) | Monogramme « LC » + feuille d'érable, **blanc et or**, sur fond marine (barre latérale, accueil, panneau de connexion). Fourni par le cabinet le 2026-10-01 |
| `public/brand/logo-mark-dark.png` (700×242) | Même logo **noir et or** sur fond clair (formulaires, page introuvable, en-tête blanc). Repris de lexcanadalaw.com |
| `app/icon.png`, `app/apple-icon.png` | Icônes du site, reprises de lexcanadalaw.com |

Composant : `components/shared/brand-mark.tsx` (`tone="light" | "dark"`, `size="sm" | "md" | "lg"`). Il remplace le monogramme texte « LC ✦ » de la maquette Manus. Le texte alternatif est « Lex Canada Law ».

## 2. Typographie

**Polices du site lexcanadalaw.com** (décision du responsable, 2026-10-03, ADR 0015 ; elles remplacent Playfair Display et Cormorant Garamond de la maquette Manus). Fichiers hébergés dans `app/fonts` (licence SIL OFL 1.1), chargés par `next/font/local` : aucun appel externe, compatible avec une CSP stricte (ADR 0009).

| Rôle | Police | Graisses | Variable |
|---|---|---|---|
| Titres | **Libre Franklin** | 600, 700, 800 (+ italique 700) | `--font-display` |
| Texte | **DM Sans** | 300, 400, 500, 600 | `--font-body` |
| Accent (slogan, mot mis en avant) | **Libre Franklin italique**, en doré | 700 | `--font-accent` |

Relevé sur lexcanadalaw.com : grand titre en 800 avec `letter-spacing: -0.025em`, mot mis en avant en italique 700 doré, sous-titres en 700, texte en DM Sans 300 ou 400, boutons en DM Sans 500 majuscules.

| Élément | Police | Taille | Graisse | Couleur | Autres |
|---|---|---|---|---|---|
| Titre de page (« Sign in to your portal ») | Libre Franklin | 28px | 700 | marine | `letter-spacing: -0.025em` |
| Titre de carte (« Invoices », « Recent Matters ») | Libre Franklin | 18px | 600 | marine | — |
| Valeur d'un indicateur | Libre Franklin | 28px | 700 | marine | — |
| Texte courant | DM Sans | 14–16px | 400 | `#4A4A5A` | — |
| Sous-titre / aide | DM Sans | 14px | 400 | `#8A8A9A` | — |
| Libellé de champ | DM Sans | 12px | 600 | marine | MAJUSCULES, `letter-spacing: .05em` |
| Bouton | DM Sans | 13px | 500 | — | MAJUSCULES, `letter-spacing: .08em` |
| Métadonnée (date, n° de dossier) | DM Sans | 11–12px | 400 | `#8A8A9A` | — |
| Micro-libellé de la barre latérale | DM Sans | 9px | 600 | blanc à 40 % | MAJUSCULES, espacement large |

## 3. Formes, espacements, mouvement

| Token | Valeur |
|---|---|
| Rayon : cartes | `4px` |
| Rayon : champs, badges | `2px` |
| Rayon : boutons (`primary`, `outline-gold`, `ghost-white`) | `8px` — choix du responsable du 2026-10-06, s'écarte des angles droits du site public |
| Bordure de carte | `1px solid gray-100`, **sans ombre** au repos |
| Survol de carte (`card-hover`) | transformation et ombre en `.32s cubic-bezier(.23,1,.32,1)` |
| Courbe d'animation | `--ease-premium: cubic-bezier(.23,1,.32,1)` |
| Hauteur de la barre de navigation (site public) | `72px` |
| Barre latérale du portail | `256px` (`w-64`), fixe |
| Marges intérieures | Cartes `p-5` / `p-6` ; en-tête `px-8 py-4` |

Le style est sobre : peu d'ombres, des coins presque droits et des bordures fines. **Pas d'emojis** ni de dégradés vifs.

## 4. Boutons

```css
.btn-primary  { background: var(--marine); color: #fff; border: 1px solid var(--marine);
                padding: 12px 28px; font: 500 13px var(--font-body); letter-spacing: .08em;
                text-transform: uppercase; transition: all .2s var(--ease-premium); }
.btn-outline-gold { color: var(--gold); border: 1px solid var(--gold); background: transparent; /* idem */ }
.btn-ghost-white  { color: #fff; border: 1px solid rgb(255 255 255 / .4); background: transparent; /* idem */ }
```

**Titres (2026-10-07)** : mêmes épaisseurs que lexcanadalaw.com — titre de page en Libre Franklin 800, titres de section en Libre Franklin 700.

**Révision du 2026-10-07** (choix du responsable : « de vraies couleurs ») : coins arrondis `8px`, **couleurs pleines** reprises de la feuille de style de lexcanadalaw.com, en sRGB (profil du web), **sans transparence ni flou**.
- `primary` : fond et bordure `marine` (#0D1B3E), texte blanc ; `marine-light` (#162347) au survol. Contraste 16,9:1 (15,4:1 au survol).
- `outline-gold` : fond et bordure `gold` (#B8962E), **texte `marine`** (un texte blanc sur ce doré n'atteindrait que 2,9:1) ; `gold-light` (#D4AF5A) au survol. Contraste 6:1, et 8,1:1 au survol.
- `ghost-white` (fonds sombres) : bordure et texte blancs ; au survol, fond blanc et texte `marine`.
- Le rayon de 8px s'applique à toutes les tailles (`compoundVariants`).

**Révision du 2026-10-18 (ADR 0033, décision du responsable)** :
- **Boutons en casse normale** (« Confirmer », plus « CONFIRMER ») : `font-semibold`, sans majuscules ni espacement des lettres. Les majuscules restent pour les petits libellés de section et les étiquettes de statut.
- **Une seule action principale par écran ou par ligne** (`primary`). Les actions secondaires utilisent `outline-marine` (contour gris, texte marine, survol crème) ou passent dans un menu **« ⋯ »** (`RowActions`) qui ouvre leur formulaire sous la ligne.
- **Aide « ? »** (`HelpTip`) à côté d'un titre, à la place des bandeaux d'explication permanents ; les bandeaux restent pour un état important (simulateur, connexion à refaire).

Les icônes viennent de **lucide-react**, en 14–18px. Une flèche `→` suit les CTA principaux (« ACCESS MY PORTAL → »).

## 5. Gabarits d'écran

### 5.1 Connexion (`/[locale]/login`)
- Écran partagé : à gauche (≥ lg), un panneau photo plein cadre avec voile marine, le monogramme **LC ✦**, le titre « Client Portal, *always at hand.* » (italique doré) et le texte « Access your case files, communicate securely with your legal team, sign documents, and track the progress of your matters — all in one place. ». À droite, le formulaire.
- Le formulaire comprend : logo LC ✦ / LEX CANADA LAW, titre, sous-titre, champs E-MAIL et MOT DE PASSE (lien « Mot de passe oublié ? » aligné à droite), bouton plein « ACCÉDER À MON PORTAIL → », puis le lien « Pas encore de compte ? Prendre rendez-vous » vers `CLIO_BOOKING_URL`, et la mention sécurité avec une icône de bouclier.
- Ajouts par rapport à la maquette : **étape MFA** (code TOTP à 6 chiffres) et bouton secondaire **« Personnel du cabinet — Se connecter avec Microsoft »** sur `/[locale]/staff/login`.
- ⚠️ La maquette affiche « Protected by 256-bit SSL encryption ». Il faut la remplacer par une mention exacte et vérifiable, par exemple « Connexion chiffrée (TLS) · Authentification à deux facteurs ».

### 5.2 Gabarit applicatif (portail client)
- **Barre latérale** fixe, 256px, fond marine. En haut : le logo, puis « CLIENT PORTAL » en micro-libellé. Au milieu, la navigation (icône + libellé ; élément actif en fond `marine-light` avec liseré ou texte doré). En bas, la carte utilisateur : avatar à initiales (« JD »), nom, « Client #2026-0142 », puis Déconnexion.
- **En-tête** blanc, collant, avec une bordure basse : recherche (icône loupe) à gauche ; à droite, la cloche des notifications avec une pastille, le sélecteur de langue FR/EN et l'avatar.
- **Contenu** sur fond `#F4F5F7`, `ml-64`, marges `p-8`.
- **Mobile** (< lg) : la barre latérale devient un tiroir (bouton menu dans l'en-tête). Aucun défilement horizontal.

### 5.3 Navigation (ordre de la maquette)

| Maquette (EN) | FR | Route | Phase |
|---|---|---|---|
| Overview | Tableau de bord | `/[locale]/portal` | 1 |
| My Matters | Mes dossiers | `/[locale]/portal/matters` | 1 (mock) → 2 (Clio) |
| Documents | Documents | `/[locale]/portal/documents` | 1 (mock) → 3 |
| Messages | Messages | `/[locale]/portal/messages` | 1 (mock) → 4 |
| Billing | Facturation | `/[locale]/portal/billing` | 1 (mock) → 2 (lecture) → 4 (paiement) |
| Notifications | Notifications | `/[locale]/portal/notifications` | 1 |
| *(ajout)* Rendez-vous | Rendez-vous | `/[locale]/portal/appointments` | 1 (mock) → 2 |
| *(ajout)* Profil et sécurité | Profil et sécurité | `/[locale]/portal/profile` | 1 |
| ~~Integrations~~ | — | **Retiré du portail client** | L'écran est interne (logiciels du cabinet) et n'a pas sa place devant un client. S'il est conservé, il va dans `/admin/integrations`, réservé au firm_admin. |

### 5.4 Tableau de bord (Overview)
1. **Bandeau « Action requise »** (fond `gold-pale`, bordure dorée), par exemple « IRCC Form IMM 5444.pdf — signature requise avant le 12 juillet 2026 » avec le bouton « SIGNER MAINTENANT ».
2. **4 cartes indicateurs** (`grid-cols-4`, 2 colonnes sur tablette, 1 sur mobile) : Dossiers actifs (icône dorée), Documents en attente (bleue), Messages non lus (marine), Factures impayées (rouge, montant). Source : `client_dashboard_counts()`.
3. Deux colonnes : **Dossiers récents** (numéro, titre, domaine, badge de statut, barre de progression, responsable) et **Messages récents**.
4. Indication de fraîcheur : « Mis à jour il y a 5 min » (`last_synced_at`).

### 5.5 Autres écrans (d'après la maquette)
- **Mes dossiers** : liste de cartes (numéro LC-AAAA-NNNN, titre, domaine, statut, **progression en %**, responsable). Le détail a des onglets : Vue d'ensemble, Chronologie, Documents, Messages, Factures, Rendez-vous.
- **Documents** : « Gérez et signez vos documents juridiques ». Une ligne par document : icône, nom, date, badge `signed` / `uploaded` / `pending_signature`, puis l'action Télécharger ou Signer. Une zone de dépôt (Phase 3) et les demandes de pièces en attente.
- **Messages** : liste des fils à gauche, conversation à droite ; bulles client / cabinet ; pièces jointes.
- **Facturation** : carte « Invoices », une ligne par facture : numéro INV-AAAA-NNNN, date, montant, badge `due` / `paid`, bouton « PAYER » (Phase 4, désactivé tant que `PaymentProvider = mock`).
- **Notifications** : « Restez informé de chaque mise à jour de vos dossiers ». Liste typée urgent / info / success (icône colorée, titre, texte, ancienneté, numéro de dossier, point « non lu »).

## 6. Implémentation (Tailwind CSS v4)

- **Implémenté en J1** : tokens dans `app/globals.css` via `@theme` (utilitaires `bg-marine`, `text-gold-ink`, `font-display`…) ; guide visuel sur `/[locale]/styleguide` (développement uniquement). : couleurs marque et neutres, polices `--font-display/body/accent`, `--ease-premium`.
- Composants shadcn/ui personnalisés : `Button` (variantes `primary`, `outline-gold`, `ghost-white`), `Badge` (variantes de statut), `Card` (bordure, sans ombre), `Input` (focus doré).
- Composants maison : `PortalSidebar`, `PortalHeader`, `StatCard`, `MatterCard`, `ProgressBar`, `StatusBadge`, `ActionRequiredBanner`, `FreshnessIndicator`, `DemoDataBadge`.
- **Mode sombre** : hors périmètre du MVP. Les tokens restent compatibles.
- Toute la maquette est en anglais. Chaque libellé passe par `messages/{fr,en}.json` : **aucun texte en dur**.

## 7. Inventaire complet de la maquette (chaque élément, chaque action)

> Relevé exhaustif du code des 7 écrans de la maquette (`Portal.tsx`), le 2026-10-01. Pour chaque élément : ce que fait la maquette, et ce qu'on construit.
> La maquette est **statique** : la plupart des boutons n'ont aucune action (pas de `onClick`). Le comportement réel est défini ici.

### Éléments communs
| Élément de la maquette | Ce qu'on construit | Phase |
|---|---|---|
| Barre latérale : logo, « CLIENT PORTAL », carte utilisateur (avatar à initiales **sur fond doré**, nom, « Client #2026-0142 ») | Identique ; `profiles.client_number` | 1 |
| Navigation avec **pastilles de compteur** (Dossiers 3, Documents 1, Messages 1, Facturation 1, Notifications 2) ; élément actif = fond `white/10` + **liseré gauche doré de 2px** | Compteurs réels : dossiers actifs, documents en attente (demandes + à signer), messages non lus, factures dues, notifications non lues | 1 |
| Bouton **« Settings »** en bas de la barre latérale | → `/portal/profile` (profil, langue, sécurité, préférences de notification) | 1 |
| Bouton **« Sign Out »** (survol rouge) | Déconnexion + journal `auth.logout` | 1 |
| En-tête : champ **« Search files, messages... »** | **Recherche globale** dans les dossiers, documents et messages auxquels l'utilisateur a accès (RLS) ; résultats groupés par type | 1 (base) |
| En-tête : **cloche** avec pastille (2) | Menu déroulant des 5 dernières notifications + lien « Tout voir » | 1 |
| En-tête : avatar marine + nom | Menu : Profil, Langue FR/EN, Déconnexion | 1 |

### Overview (tableau de bord)
| Élément | Action réelle | Phase |
|---|---|---|
| Bandeau « Action Required » (icône alerte, nom du document en gras, échéance) + bouton **« Sign Now »** | → flux de signature du document (`signature_requests`). Le bandeau affiche l'action la plus urgente : signature, pièce demandée, facture en retard | 1 mock → 4 |
| 4 cartes : Active Matters · Pending Documents · Unread Messages · Outstanding Invoices (montant) | `client_dashboard_counts()` | 1 |
| « Recent Matters » + **« View all → »** | Les 3 derniers dossiers mis à jour ; lien vers `/portal/matters` | 1 |
| Ligne de dossier : icône, titre, `numéro · domaine · Updated …`, badge **« Action Required »**, badge de statut, **% + barre de progression**, chevron | Clic → détail du dossier | 1 |
| « Recent Messages » + « View all → » (2 derniers, point doré si non lu) | Lien vers le fil | 1 |

### My Matters
| Élément | Action réelle | Phase |
|---|---|---|
| « All your active and past legal files » ; carte par dossier : numéro, statut, Action Required, titre, `domaine · avocat · Updated …`, barre « Progress » | Filtres actifs / clos ; clic → `/portal/matters/[id]` (**absent de la maquette** : onglets à concevoir selon `page-map.md`) | 1 |

### Documents (concerne SharePoint)
| Élément de la maquette | Action réelle | Phase |
|---|---|---|
| Bouton **« Upload Document »** (icône Upload) | Fenêtre de dépôt : choix du **dossier** (si plusieurs), glisser-déposer, liste des formats et de la taille max, barre de progression ; envoi vers SharePoint `02 Déposé par le client` après antivirus | 3 |
| Ligne : icône, **nom**, `numéro de dossier · date · taille` (ex. « 245 KB ») | `documents.display_name`, `matter.display_number`, `uploaded_at`, `size_bytes` | 1 mock → 3 |
| Bouton **« Sign »** si `pending_signature` | Flux de signature | 4 |
| Badges **Signed** (vert) / **Uploaded** (bleu) | Statuts `signed`, `uploaded` ; ajouter « En analyse » (`scan_status = pending`) et « Refusé » | 1 |
| Icône **œil (aperçu)** | Aperçu en ligne : PDF et images ; Office converti en PDF (Graph) | 3 |
| Icône **téléchargement** | Téléchargement en flux via le serveur, journalisé | 3 |
| *(absent de la maquette)* | **Filtre par dossier**, onglets « Partagés par le cabinet » / « Mes dépôts » / « Signés » (= sous-dossiers SharePoint), **pièces demandées** (`document_requests`) avec bouton « Déposer » | 1 mock → 3 |

### Messages
| Élément | Action réelle | Phase |
|---|---|---|
| Liste : avatar (WS / LC), expéditeur, ancienneté, aperçu, « Re: numéro de dossier », fond doré pâle + point si non lu | Liste des fils | 1 mock |
| *(absent : pas d'écran de conversation ni de bouton « Nouveau message »)* | **À concevoir** : vue du fil, zone de saisie, pièce jointe (déposée dans SharePoint `02`), « Nouveau message » (choix du dossier) | 1 mock → 4 |

### Billing
| Élément | Action réelle | Phase |
|---|---|---|
| Carte « Invoices » : numéro, `dossier · date`, montant, **« Pay Now »** si due, sinon « Paid » | Paiement via `PaymentProvider` (désactivé en mock, infobulle « Bientôt disponible ») | 1 mock → 2 lecture → 4 |
| Icône **téléchargement** de la facture | PDF de la facture Clio (`bills`) servi en flux **[À VÉRIFIER]** l'endpoint de téléchargement du PDF dans l'API Clio | 2 |

### Notifications
| Élément | Action réelle | Phase |
|---|---|---|
| « Stay informed on every update to your files » ; types urgent (alerte rouge) / info (calendrier, document) / success (coche verte) ; titre, ancienneté, texte, « Matter: … », point non lu | Liste + « Tout marquer comme lu » + clic → `action_url` | 1 |

### Integrations (retiré du portail client)
La maquette liste Clio, Microsoft 365 (« … & SharePoint »), LexisNexis, Westlaw, ChatGPT Enterprise, **Adobe Sign**, Spellbook, Zapier, Power Apps, avec le texte « Platform Vision : 80% digital / 20% physical… This portal surfaces and centralizes Clio data under the Lex Canada brand ».
- Écran **retiré** du portail client (information interne) ; réutilisable dans `/admin/integrations` (statut réel des connexions).
- ⚠️ La maquette cite **Adobe Sign**, alors que le mémorandum cite **DocuSign** : question ajoutée à `open-questions.md`.
- Le texte « Platform Vision » **répond en partie** à la question « pourquoi pas Clio for Clients » : le cabinet veut un portail à sa marque qui masque Clio. À faire confirmer par écrit.

## Étiquettes de dossiers (ADR 0021)
Palette fermée de 8 couleurs (`components/shared/tag-chip.tsx`), toujours un **texte foncé sur un fond clair**, contraste AA vérifié par axe :
`marine` (tokens marine), `gold` (gold-pale / gold-ink), `red`, `orange`, `green`, `blue`, `purple` (nuances 50 et 800 de Tailwind) et `gray` (100 / 700).
Forme : pastille arrondie, texte de 12 px en 500. Ces couleurs ne servent qu'aux étiquettes ; elles ne remplacent pas les couleurs de statut.

## Navigation et accueil de l'espace cabinet (ADR 0033, 2026-10-18)

- **Menu en trois groupes** : « Mon travail » (Ma journée, Dossiers, Messages, Calendrier, Contrats, Demandes), « Clients » (firm_admin) et « Administration » (firm_admin, une seule entrée).
- **Sous-menus** : sur la barre fixe, les entrées Dossiers, Calendrier, Contrats et Administration ouvrent un menu déroulant au survol **et au clavier** (focus). Dans le tiroir mobile, Administration se déplie.
- **En-tête** : recherche globale (**Ctrl K** ou ⌘ K : dossiers, contrats, clients pour le firm_admin) et **cloche** (ce qui demande une action, avec un lien).
- **Accueil « Ma journée »** : 4 compteurs cliquables, « Mes audiences » (avec « Confirmer »), « À traiter » (messages, documents reçus, retards, contrats en relecture, changements Clio), « À surveiller », « Créer » et, pour le firm_admin, l'**activité récente en français lisible** (jamais les codes techniques du journal).
- **Accueil client** : « Ce que vous devez faire » d'abord (signer, fournir, régler, chacun avec son bouton), puis « Vos dossiers », la prochaine audience avec les consignes, les messages récents. Aucun vocabulaire technique (synchronisation).

