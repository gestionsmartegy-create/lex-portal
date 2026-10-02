# ADR 0013 — Préproduction accélérée (lundi 5 octobre 2026)

- **Statut** : accepté (2026-10-02)
- **Contexte** : le responsable du projet demande une **préproduction en ligne lundi**, à montrer au cabinet, avec Clio et Microsoft connectés pendant le week-end. Le plan prévoyait d'abord la fin de la Phase 1 (J4 services, J5 écrans, J6 qualité), puis la Phase 2 (Clio). Cet ADR trace les écarts, validés explicitement (AGENTS.md §2.11).

## Décisions du responsable (2026-10-02)

| Sujet | Décision |
|---|---|
| Cible de lundi | **Préproduction**, sans vrais clients : comptes de test et personnel seulement |
| Hébergement | **Vercel** (question ouverte tranchée) |
| Base | **Projet Supabase « lex law » existant**, si la région est `ca-central-1` et le projet vide. Sinon, nouveau projet (ADR 0002). Plan Pro. Clés régénérées. |
| E-mails | **SMTP Microsoft 365**, depuis une boîte du cabinet |
| Jetons OAuth | **Supabase Vault** (recommandation retenue, sans préférence exprimée) |
| Documents | **Démonstration lundi**. SharePoint est branché ensuite (Phase 3). L'écran Documents, lui, est définitif. |

## Écarts au plan, et garde-fous

1. **J4 et J5 en un week-end**, et J6 réduit aux e2e des parcours clés : connexion, tableau de bord, dossier, document, révocation en cours de session, accès refusé au dossier d'autrui. **Rien n'est coupé côté sécurité** : `assertMatterAccess`, RLS testée, audit, CI verte avant chaque fusion.
2. **Phase 2 (Clio en lecture) en parallèle**. On n'utilise que les capacités « Confirmé » de `docs/clio-api-mapping.md`. Seuls les **dossiers liés à un compte du portail** sont synchronisés : aucune copie massive des données du cabinet.
3. **Données de préproduction** :
   - `supabase/preprod/demo-data.sql` contient des dossiers fictifs, sans aucun compte ni domaine `*.test`. Le seed local n'est **jamais** exécuté à distance.
   - Le premier firm_admin est créé à la main, par l'autorisation de pré-création (ADR 0010).
4. **Vercel** : `TRUSTED_PROXY_HOPS = 1`, car Vercel remplace `x-forwarded-for` par l'IP réelle du client (ADR 0010, M2). La région des fonctions est la plus proche de `ca-central-1`.
5. **SMTP** : STARTTLS est **imposé** hors local (`requireTLS`).
6. **Réglages Auth du projet distant** : faits **à la main**, avec la liste de `docs/runbooks/preprod-deploy.md`. On ne lance **jamais** `supabase config push`, qui enverrait les réglages locaux (localhost, pas de SMTP).

## Toujours requis avant de vrais clients (Phase 5)
- Auth Hooks : limitation des tentatives côté GoTrue (ADR 0010, M1).
- Restauration PITR testée.
- AIVP.
- Audit de sécurité externe.
- Domaine définitif.
- Revue du guide `docs/runbooks/mfa-reset.md` par le cabinet.

## Conséquences
- Le guide `docs/runbooks/preprod-deploy.md` décrit tout ce que le responsable fait lui-même. **Aucune clé ne passe par l'équipe de développement.**
- La date du 5 octobre fixe une **ligne de coupe** : l'export CSV de l'audit, puis la version simple des rendez-vous et des notifications, puis Clio réel (repoussé à mardi). Ni la sécurité ni les tests ne font partie de ce qui peut être coupé.
