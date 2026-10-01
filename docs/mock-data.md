# Données fictives (Phase 1)

> Ces données sont reprises de la maquette Manus. Elles alimentent `supabase/seed.sql` et `MockClioManageGateway`.
> Règles : `matters.is_mock = true`, domaine e-mail réservé **`example.com`** pour les clients, et badge « Données de démonstration » affiché dans l'interface.
> **Interdit** : de vraies données client, ou de vrais noms de clients.

## Comptes

| Rôle | Nom | E-mail | Remarque |
|---|---|---|---|
| client | John Doe | `john.doe@example.com` | `client_number` = `2026-0142`, MFA à enrôler au premier login |
| client | Jane Roe (QVYON Technologies) | `jane.roe@example.com` | Membre de l'organisation fictive « QVYON Technologies » |
| staff | Me Wilson Saintelmy | (compte Entra ID réel du cabinet, créé à la première connexion) | Responsable des dossiers ci-dessous. Associé réel : seul son nom apparaît dans les fixtures |
| firm_admin | (à désigner par le cabinet) | `…@lexcanadalaw.com` | Promotion manuelle (database.md §9) |

Les mots de passe des comptes de test sont générés au moment du seed et consignés dans `supabase/seed.local.md`, un fichier **ignoré par Git**. Ils ne figurent jamais dans le dépôt.

## Dossiers (`matters`)

| display_number | Titre | Domaine | Statut | Progression | Client |
|---|---|---|---|---|---|
| LC-2026-0142 | Permanent Residency Application | Immigration | open (actif) | 65 % | John Doe (`read_write`) |
| LC-2026-0098 | Business Incorporation — QVYON Technologies | Corporate | closed (terminé) | 100 % | Jane Roe (`read`) |
| LC-2026-0115 | Commercial Lease Review | Real Estate | on_hold (en attente) | 30 % | John Doe (`read`) |

Chronologie de LC-2026-0142 : Consultation initiale ✓ · Collecte des documents ✓ · Préparation du dossier IRCC (en cours) · Dépôt IRCC · Décision.

## Documents

| Dossier | Nom | Date | Taille | Statut | `folder` (sous-dossier SharePoint) |
|---|---|---|---|---|---|
| LC-2026-0142 | Engagement Agreement — Signed.pdf | 2026-07-01 | 245 KB | signed | `signed` (03 Signés) |
| LC-2026-0142 | Passport Copy — Certified.pdf | 2026-06-28 | 1,2 MB | uploaded | `client_upload` (02 Déposé par le client) |
| LC-2026-0142 | IRCC Form IMM 5444.pdf | 2026-06-25 | 380 KB | pending_signature | `shared` (01 Partagé avec le client) |
| LC-2026-0098 | Certificate of Incorporation.pdf | 2026-05-15 | 520 KB | signed | `signed` |
| LC-2026-0142 | Note interne — stratégie.docx | 2026-06-20 | 48 KB | in_review | **`internal`** (sert à vérifier qu'un client ne la voit jamais) |

Demande de pièce : « Preuve de fonds (relevés 6 mois) », LC-2026-0142, échéance 2026-07-20, `pending`.
Signature : IMM 5444, signataire John Doe, échéance 2026-07-12, `sent`.

## Factures

| Numéro | Dossier | Émise | Échéance | Montant | Solde | Statut |
|---|---|---|---|---|---|---|
| INV-2026-0089 | LC-2026-0142 | 2026-07-01 | 2026-07-15 | 1 250,00 $ | 1 250,00 $ | due |
| INV-2026-0072 | LC-2026-0098 | 2026-05-20 | 2026-06-03 | 3 800,00 $ | 0,00 $ | paid |

## Rendez-vous

Consultation avec Me Wilson Saintelmy : jeudi 10 juillet 2026, 14 h 00, America/Halifax. Visioconférence Teams (lien fictif `https://example.com/meet`).

## Messages (fil « LC-2026-0142 — Questions »)

1. Cabinet (il y a 2 h) : « Bonjour M. Doe, votre formulaire IMM 5444 est prêt pour signature. »
2. Client (hier) : « Merci, j'ai déposé la copie certifiée de mon passeport. »

## Notifications (John Doe)

| Priorité | Type | Titre | Ancienneté | Lu |
|---|---|---|---|---|
| urgent | signature_required | Signature requise : IMM 5444 avant le 12 juillet 2026 | 2 h | non |
| info | appointment_reminder | Rappel : consultation jeudi 10 juillet à 14 h | hier | non |
| success | document_received | Copie du passeport certifiée et ajoutée au dossier | 1er juil. | oui |
| info | invoice_issued | Facture INV-2026-0089 de 1 250,00 $, échéance 15 juillet | 1er juil. | oui |
| success | matter_completed | Constitution de QVYON Technologies terminée | (Jane) | — |

Les dates des fixtures sont **relatives** à la date du seed (ex. `now() - interval '2 hours'`), pour que le tableau de bord reste cohérent.
