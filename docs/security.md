# Sécurité — Portail Client Lex Canada (Phase 0)

> **Note :** ce document a été renforcé à la demande explicite du cabinet. La sécurité n'est pas une fonctionnalité parmi d'autres sur ce projet — c'est une contrainte qui prime sur la vitesse de développement à chaque étape. Tout écart par rapport à ce document doit être documenté comme une ADR (`docs/decisions/`) et justifié explicitement, jamais fait silencieusement "pour aller plus vite".

## 0. Principes non négociables (à respecter dans tout le cycle de vie du projet)

1. **Moindre privilège partout** — chaque compte, chaque jeton, chaque permission Clio/Graph doit avoir strictement le périmètre nécessaire, jamais plus "par sécurité" ou "pour anticiper".
2. **Défense en profondeur** — aucune protection unique ne doit être le seul rempart. Exemple déjà appliqué : tenant Entra ID restreint **et** vérification de domaine côté base (voir `docs/auth-entra-id-integration.md`).
3. **Aucune confiance implicite dans le frontend** — toute vérification de droit d'accès doit être refaite côté serveur, même si l'UI a déjà "caché" l'élément au client.
4. **Minimisation des données** — si une donnée n'est pas strictement nécessaire à l'affichage, elle ne doit pas être copiée dans Supabase (voir `docs/source-of-truth.md`).
5. **Traçabilité systématique** — toute action sensible (accès, téléchargement, modification de droit, révocation) doit être journalisée dans `audit_events`, sans exception, sans "on l'ajoutera plus tard".

## 1. Mesures par domaine

| Domaine | Mesure | Détail opérationnel | Statut |
|---|---|---|---|
| **Authentification clients** | Supabase Auth, email + mot de passe, MFA obligatoire | MFA activé dès la création de compte, pas optionnel pour les clients ayant accès à un dossier actif | Hypothèse d'architecture — à activer explicitement en Phase 1, pas un réglage par défaut de Supabase |
| **Authentification personnel** | Microsoft Entra ID via Supabase Auth (OAuth), tenant restreint | Tenant single-tenant (`My organization only`) **et** vérification de domaine e-mail côté trigger PostgreSQL avant tout rôle `staff`/`firm_admin` | ✅ Config Azure/Supabase déjà réalisée (voir historique du projet) |
| **Sessions** | Expiration, rotation, révocation immédiate | Un accès révoqué (`matter_access.revoked_at`) doit invalider l'accès **avant** l'expiration naturelle du jeton, pas seulement empêcher les nouvelles connexions | Exigence de conception, test obligatoire avant mise en production |
| **Cookies** | `Secure`, `HttpOnly`, `SameSite=Lax` (ou `Strict` si compatible avec les flux OAuth) | Aucun jeton de session accessible en JavaScript côté client | Bonne pratique standard Next.js/Supabase |
| **CSRF** | Protection sur toute Server Action/Route Handler qui modifie une donnée | Next.js App Router + Supabase SSR gèrent une partie de ça nativement — à vérifier explicitement, pas supposé acquis | À tester en Phase 1 |
| **XSS** | Échappement systématique de tout contenu utilisateur affiché (messages, noms de documents, notes) | Ne jamais utiliser `dangerouslySetInnerHTML` sur du contenu venant d'un utilisateur ou d'une API externe sans sanitization stricte | Règle de code, à inscrire dans les revues de code |
| **Content Security Policy** | CSP stricte, pas de `unsafe-inline` en production | À définir en Phase 1, testée avec les outils de rapport de violation CSP | À faire |
| **Validation des entrées** | Zod côté serveur pour **toute** entrée : formulaires, réponses Clio/Graph, payloads de webhook | Ne jamais faire confiance à une réponse externe sans la valider contre un schéma strict — une API tierce peut changer son format sans préavis | Règle de code (voir `AGENTS.md`) |
| **Rate limiting** | Applicatif, propre au portail, distinct du rate limit Clio | Protéger notamment la connexion (anti brute-force) et les endpoints d'upload | À implémenter en Phase 1 (ex. middleware Next.js + table de compteurs, ou service dédié) |
| **Chiffrement en transit** | TLS sur tous les flux, y compris entre Azure App Service et Supabase | Aucune exception, même en développement si possible | Exigence de conception |
| **Chiffrement au repos** | Jetons OAuth, secrets, données sensibles chiffrés dans le coffre-fort | `integration_connections.encrypted_credentials_reference` ne stocke qu'une référence — le secret réel vit dans un coffre-fort externe (Azure Key Vault recommandé, cohérent avec le mémorandum EA) | À trancher avec le cabinet — voir `docs/open-questions.md` |
| **Téléversement** | Vérification MIME réelle (pas seulement l'extension), limite de taille, antivirus obligatoire avant stockage définitif | Un fichier `.pdf.exe` renommé doit être détecté — vérifier le contenu binaire (magic bytes), pas juste le nom | Exigence de conception, fournisseur antivirus à confirmer avec le cabinet |
| **Téléchargement** | URLs temporaires signées, durée de vie courte, à usage unique si possible | Jamais un lien SharePoint permanent partagé directement | Exigence de conception |
| **RLS Supabase** | Activé sur **toutes** les tables exposées, sans exception | Chaque nouvelle table doit avoir sa politique RLS écrite **avant** d'être exposée à PostgREST — jamais "on active RLS plus tard" | Non négociable, voir `supabase/schema.sql` |
| **`service_role`** | Jamais exposé au navigateur, jamais dans une variable `NEXT_PUBLIC_*` | Une revue de code doit vérifier ce point avant chaque merge touchant l'authentification ou les appels serveur | Règle absolue |
| **Audit** | Journalisation de tout accès à un dossier, tout téléchargement, toute modification de droit | Table `audit_events`, jamais désactivable, conservation longue (durée à définir avec le cabinet compte tenu des obligations juridiques) | Table déjà dans le schéma |
| **Révocation** | Immédiate, effective même en cours de session active | Testé explicitement dans le scénario §2 ci-dessous | Exigence de conception |
| **Sauvegardes** | Automatiques (Supabase), fréquence à confirmer selon le plan souscrit | Vérifier la fenêtre de rétention et la procédure de restauration avant la mise en production | À valider avec Supabase (plan Pro/Team) |
| **Réponse aux incidents** | Procédure définie : qui alerter, comment révoquer massivement, comment notifier les clients affectés | À rédiger avant la mise en production — ce n'est pas un document technique mais organisationnel, à faire avec le cabinet | À faire, hors périmètre strictement technique |

## 2. Scénarios de test de sécurité — à exécuter avant chaque mise en production

Ces tests doivent être **automatisés** autant que possible (tests d'intégration), pas seulement vérifiés manuellement une fois.

| # | Scénario | Résultat attendu | Type de test |
|---|---|---|---|
| 1 | Un client tente d'ouvrir le dossier d'un autre client en modifiant l'ID dans l'URL | 403 sans fuite d'information (pas de distinction entre "n'existe pas" et "pas autorisé") | Automatisé (RLS + contrôle serveur) |
| 2 | Un ancien client tente de réutiliser une session après révocation de son accès à un dossier | Accès bloqué immédiatement, même si le jeton de session est encore valide | Automatisé |
| 3 | Une URL de document temporaire est transférée à un tiers non autorisé | Expiration courte, idéalement usage unique | Automatisé + revue manuelle |
| 4 | Un webhook Clio falsifié est envoyé au worker (signature incorrecte) | Rejeté avant tout traitement, aucune donnée modifiée | Automatisé |
| 5 | Un jeton OAuth Clio est expiré au moment d'un appel | Renouvellement automatique en arrière-plan ; si échec, état "à resynchroniser" affiché au lieu d'une erreur brute exposant des détails techniques | Automatisé |
| 6 | Un fichier malveillant (exécutable renommé, script) est téléversé | Rejeté par la vérification de contenu réel + antivirus, avant tout stockage | Automatisé |
| 7 | Un administrateur révoque un accès pendant une session active du client concerné | Coupure immédiate, y compris pour une requête déjà en cours de traitement au moment de la révocation | Automatisé |
| 8 | Un compte Microsoft personnel ou hors tenant tente de se connecter via "Sign in with Microsoft" | Refusé par la restriction de tenant Azure, avant même d'atteindre le trigger de mapping de rôle | Automatisé (test d'intégration Entra ID) |
| 9 | Un compte Entra ID valide du tenant, mais avec un domaine e-mail non listé, se connecte | Compte créé sans aucun rôle privilégié — accès nul aux données clients | Automatisé |
| 10 | Un client tente d'accéder à une route `/admin/*` | Bloqué par RLS et par un contrôle de rôle serveur redondant | Automatisé |
| 11 | Injection SQL via un champ de recherche ou de filtre | Aucune exécution — requêtes paramétrées uniquement, jamais de concatenation de chaînes SQL | Revue de code systématique |
| 12 | Un utilisateur avec accès `read` sur un dossier tente une action d'écriture via l'API | Bloqué par `access_level` et par la politique RLS correspondante | Automatisé |

### Couverture automatisée (mise à jour J2, 2026-10-01)

| # | Test automatisé | Statut |
|---|---|---|
| 1 | `supabase/tests/database/03_acces_dossiers.test.sql` (T7, T8) | ✅ base. Réponse 404 identique côté application : e2e en J5 (`tests/e2e/`, ADR 0011) |
| 2 | `03_acces_dossiers` (T29 : même session, accès coupé) | ✅ base |
| 3 | URL de téléchargement transférée | ⏳ Phase 3 (téléchargement en flux par le serveur, pas d'URL réutilisable) |
| 4 | Webhook falsifié | ⏳ Phase 2 (`private.webhook_events`) |
| 5 | Jeton Clio expiré | ⏳ Phase 2 |
| 6 | Fichier malveillant | ✅ base partielle (`04_documents` : fichier `infected` ou `pending` invisible) ; pipeline antivirus en Phase 3 |
| 7 | Révocation pendant une session active | ✅ base (`03_acces_dossiers`, T29) ; e2e en J6 |
| 8 | Compte Microsoft hors tenant | ✅ base (`02_identite` : hors domaine → suspendu) ; restriction du tenant Azure en J3 |
| 9 | Compte du tenant avec un domaine non listé | ✅ base (`02_identite`, T26) |
| 10 | Client sur `/admin/*` | ✅ base (`03_acces_dossiers` : aucun droit d'administration) ; garde de route en J3/J5 |
| 11 | Injection SQL | Revue de code (requêtes paramétrées via supabase-js) |
| 12 | Accès `read` qui tente d'écrire | ✅ base (`03_acces_dossiers`, `05_messagerie`) |

Structure (`01_structure`) : RLS sur toutes les tables de `public`, aucune table sans politique, `private` et `audit` fermés, `search_path` vide sur toutes les fonctions `security definer`, nouvelles tables et RPC fermées par défaut.

## 3. Ce qui n'est pas encore tranché (nécessite une décision du cabinet)

- Choix définitif du coffre-fort de secrets (Supabase Vault seul vs Azure Key Vault dédié).
- Fournisseur d'analyse antivirus pour les téléversements.
- Politique précise de rétention des journaux d'audit (durée légale à confirmer).
- Procédure formelle de réponse aux incidents (qui contacter, délais de notification aux clients).
- Fréquence et modalités exactes des audits de sécurité externes avant/après mise en production.

## 4. Limites de ce document

Ce document ne remplace pas un audit de sécurité indépendant. Il ne constitue pas non plus un avis juridique sur la conformité réglementaire (voir `docs/privacy-and-data-residency.md`). Une revue de sécurité par un tiers est recommandée avant toute mise en production avec de vraies données clients.

## Sources et niveau de confirmation

- Les mécanismes Clio (rate limit, signature de webhook) sont confirmés par la documentation officielle.
- Les mesures de sécurité applicatives (CSRF, CSP, RLS, cookies) sont des bonnes pratiques standards de l'écosystème Next.js/Supabase, à mettre en œuvre et auditer en Phase 1 — pas encore vérifiées sur un environnement réel.
- Les scénarios de test du §2 sont dérivés de l'analyse de risque de ce projet et doivent être traduits en tests automatisés concrets par l'équipe de développement, pas seulement lus comme une check-list théorique.

### Contrôles ajoutés en J3.1 (ADR 0011)
| Contrôle | Test |
|---|---|
| Redirection ouverte après connexion (`next=//…`) | `tests/e2e/auth.spec.ts` |
| Message d'erreur neutre (compte existant ou non) | `tests/e2e/auth.spec.ts` |
| Aucune violation CSP, Trusted Types en observation | `tests/e2e/fixtures.ts` (toutes les pages visitées) |
| Accessibilité WCAG 2.2 AA (axe, gravité grave ou critique) | `tests/e2e/auth.spec.ts` |
| Alerte e-mail sur changement de mot de passe | `tests/integration/auth.test.ts` |
| Rapport CSP : validation, URL réduite | `tests/unit/security-hardening.test.ts` |

