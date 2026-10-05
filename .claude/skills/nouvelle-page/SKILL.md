---
name: nouvelle-page
description: Créer une nouvelle page du portail client (/portal) ou de l'espace cabinet (/admin) à partir de la page existante la plus proche, avec sa garde de session, ses textes FR/EN, son entrée de navigation, son test e2e et sa fiche dans docs/page-map.md. Suit ensuite le flux complet (QA, sécurité, sauvegarde, serveur de test, comment tester).
---

L'argument : le nom de la page, l'espace (`portal` ou `admin`) et ce qu'elle montre. Exemple : `/nouvelle-page "Mes paiements" dans portal : la liste des paiements reçus par facture`.

Suis `/developper` avec le type de branche **`feat`**, et ces consignes en plus :

- **Étape 1** : la page doit figurer dans `docs/page-map.md` pour la phase en cours (`docs/implementation-roadmap.md`). Sinon, arrête-toi : c'est une décision du responsable technique, à lui demander avant de continuer.
- **Modèle** : copie la page existante la plus proche (`app/[locale]/portal/<x>/page.tsx` ou `app/[locale]/admin/<x>/page.tsx`) et ses composants, et garde sa structure : `setRequestLocale`, puis **`requireClientSession(locale, …)`** (portail) ou **`requireStaff(locale)`** (cabinet) en tête, puis les services de `server/services/*` pour les données (jamais un client Supabase dans la page). La page revérifie la session même si le gabarit le fait déjà (AGENTS.md §3).
- **Textes** : un bloc de clés `portal.<page>.*` ou `admin.<page>.*` dans `messages/fr.json` et `messages/en.json` (titre, description, état vide, erreurs).
- **Navigation** : une entrée dans `components/portal/nav-items.ts` (icône `lucide-react`, libellé traduit), uniquement si `docs/page-map.md` la prévoit dans le menu.
- **Données** : un service existant de `server/services/*` ou un nouveau, qui sélectionne des colonnes explicites et appelle `assertMatterAccess()` dès qu'un dossier est en jeu. Données de démonstration → badge `DemoDataBadge`.
- **Test** : ajoute la route dans la liste de pages de `tests/e2e/portal.spec.ts` ou `tests/e2e/admin.spec.ts` (affichage, axe, CSP), et un test Vitest si le service contient une règle.
- **Documentation** : complète la ligne de la page dans `docs/page-map.md` (rôle, source de données, phase).
- La **garde-fou d'audit** (`node scripts/audit-routes.mts --changed`) doit être ✅ sur la nouvelle page avant la QA.
