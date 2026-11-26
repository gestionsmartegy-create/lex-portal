# Plan de travail du responsable du projet

> Tout ce qui **dépend de vous**, et non du développement, dans l'ordre. Mise à jour : 2026-10-02.
> Les étapes techniques détaillées sont dans `docs/runbooks/preprod-deploy.md`. **Ne transmettez jamais une clé, un mot de passe ou un jeton** : saisissez-les vous-même dans chaque service.

## 1. Avant lundi 5 octobre (préproduction)

| # | Action | Où | Détail | Débloque |
|---|---|---|---|---|
| 1 | Vérifier que le projet Supabase « lex law » est en **ca-central-1** et **vide** ; sinon, créer un nouveau projet | Supabase | preprod-deploy §1.1 | Tout le reste |
| 2 | Plan **Pro**, **régénérer les clés**, réinitialiser le mot de passe de la base | Supabase | §1.2 | — |
| 3 | `supabase link` puis `supabase db push` (vous tapez le mot de passe) | Terminal | §1.3 | Base en ligne |
| 4 | Réglages Auth à la main (inscriptions fermées, mots de passe, MFA, sessions de 12 h, JWT de 900 s, URL, 6 alertes) | Supabase | §1.4 | Sécurité |
| 5 | Exécuter `supabase/preprod/demo-data.sql` | Supabase, éditeur SQL | §1.5 | Démonstration |
| 6 | Créer votre compte firm_admin (autorisation, puis création) | Supabase | §1.6 | Espace cabinet |
| 7 | Projet Vercel, variables d'environnement, région, domaine de préproduction | Vercel | §2 | Site en ligne |
| 8 | Boîte d'envoi Microsoft 365, SMTP authentifié, mot de passe d'application | Microsoft 365 | §3 | E-mails |
| 9 | Enregistrement Entra ID « Staff Auth », Azure dans Supabase, `NEXT_PUBLIC_STAFF_SSO_ENABLED=true` | Azure + Supabase + Vercel | §4 | Connexion du personnel |
| 10 | Application développeur Clio (région CA, lecture seule), client id et secret dans Vercel | Clio + Vercel | §5 | Clio réel (bloc 4) |
| 11 | Recette : inviter **votre adresse de test** et suivre `docs/user-stories.md` | Portail | §6 | Démonstration au cabinet |

## 2. Décisions à prendre (questions ouvertes)

| Sujet | Pourquoi c'est bloquant | Pour quand |
|---|---|---|
| Domaine définitif (`portal.lexcanadalaw.com` ?) | URL de retour OAuth (Clio, Entra), Site URL | Avant la production |
| Outil de surveillance (erreurs et alertes, données au Canada) | Alertes de sécurité | Avant la production |
| Antivirus des dépôts (option A ou B) | Dépôt de documents | Phase 3 |
| Répartition SharePoint / Clio des documents | Source des documents | Phase 3 |
| Enregistrement Azure « Documents (Graph) » + `Sites.Selected` | Accès SharePoint | Phase 3 |
| Comptes Clio Payments / Stripe | Paiement (la signature se fait dans Clio, ADR 0045) | Phase 4 |
| Passkeys, CAPTCHA, alerte « nouvelle connexion » | Renforcement de la connexion | Avant la production |
| Pourquoi un portail sur mesure plutôt que Clio for Clients (à confirmer par écrit) | Justification du projet | Dès que possible |

## 3. Avant les premiers vrais clients (Phase 5)
- Auth Hooks de Supabase (limitation des tentatives côté Auth).
- Restauration PITR **testée**.
- AIVP (analyse d'impact sur la vie privée).
- Audit de sécurité externe.
- Relecture de `docs/runbooks/mfa-reset.md` par le futur firm_admin.
- Formation du personnel à la procédure « téléphone perdu ».
