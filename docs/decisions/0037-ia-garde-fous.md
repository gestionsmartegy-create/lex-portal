# ADR 0037 — Assistant IA : garde-fous (masquage, plafond, journal) et gabarit en brouillon

- **Statut** : accepté (2026-10-28). Lot 5 du plan `docs/plan-contrats.md` (stories F12, F13 et F14), **sans branchement d'OpenAI** : le cabinet doit d'abord approuver l'usage d'OpenAI pour des données de clients et fournir une clé (plan §6, `docs/open-questions.md`). Tout fonctionne avec le simulateur.

## Décision
| # | Sujet | Décision |
|---|---|---|
| 1 | Masquage (F14) | Avant tout envoi à l'IA, `maskPersonalData` remplace :<br/>- les coordonnées de la fiche : nom complet **et chaque partie du nom**, courriel, adresse et chacune de ses lignes, téléphone. La comparaison ignore les majuscules et les accents ; une partie courte n'est masquée que comme mot entier ;<br/>- puis tout ce qui ressemble à une donnée personnelle, même hors de la fiche : courriels, numéros de téléphone, codes postaux canadiens, suites de 7 chiffres ou plus (NAS, passeport, numéro IRCC). |
| 2 | Plafond (F14) | `public.ai_settings` (une seule ligne) : activé ou non, plafond mensuel en cents, coût estimé par millier de caractères (lecture : personnel ; écriture : firm_admin ; journal `ai.settings_updated`).<br/>`public.ai_reserve` refuse **avant l'appel** si l'IA est désactivée (`55000`) ou si le plafond du mois (fuseau de Halifax) est atteint (`54000`). `public.ai_complete` enregistre le coût final. Le coût est calculé en `numeric` par la base. |
| 3 | Journal (F14) | `private.ai_usage` garde, pour chaque demande, qui, quel contrat, quelle sorte, le nombre de caractères et le coût estimé. **Jamais le texte envoyé ni la réponse.** Le journal d'audit garde `contract.ai_assisted` (sorte, simulateur ou non). |
| 4 | Écrans | Intégrations → « Assistant IA » (firm_admin) : état, consommation du mois (nombre de demandes, coût estimé, plafond), réglages. L'aide à la rédaction affiche un message clair quand le plafond est atteint ou l'IA désactivée. |
| 5 | Gabarit (F13) | Modèles → « Créer un gabarit avec l'assistant IA » (firm_admin) : nom, domaine, langue, description. La description est masquée.<br/>`public.contract_template_create_draft` crée un **brouillon « à faire valider »**, jamais publié directement ; le firm_admin le relit puis le publie (« Relire et publier », ADR 0034). Les sections sont relues par la liste blanche (ADR 0032). |
| 6 | Aide à la rédaction (F12) | Le parcours existant est conservé (proposition à côté ; accepter, modifier ou rejeter ; section marquée « rédigée avec l'IA »). Il passe maintenant par le masquage renforcé, la réservation et le plafond. |
| 7 | OpenAI | Toujours **non branché** : `INTEGRATION_MODE_AI=live` lève une erreur. Le branchement attend l'accord écrit du cabinet, la clé, la région de traitement et la politique de conservation d'OpenAI. |
| 8 | Corrections (revue de sécurité du 2026-10-28) | **Masquage** :<br/>- chaque moitié d'un nom composé (trait d'union, apostrophe, point) ;<br/>- noms de 2 lettres (sauf mots courants) ;<br/>- texte et fiche ramenés en NFC, pliage caractère par caractère (accents décomposés, alphabets non latins) ;<br/>- dates AAAA-MM-JJ et montants suivis d'une devise conservés ;<br/>- répétitions bornées et texte borné avant le masquage.<br/>**Base** (migrations `20261024120100` et `20261024120200`) :<br/>- verrou sur les réglages pendant la réservation ;<br/>- sorte « gabarit » réservée au firm_admin, les autres exigent un contrat ;<br/>- `ai_complete` réservé au personnel ; un échec après l'appel garde le coût de l'envoi et compte dans le mois ;<br/>- forme des sections d'un gabarit vérifiée.<br/>**Application** : 10 gabarits par heure et par personne ; plafond saisi borné à 100 000 $. |

## Conséquences
- **Migrations** `20261024120000_ai_guardrails.sql`, `20261024120100_ai_guardrails_review.sql` et `20261024120200_ai_template_sections_check.sql`.
- **Tests** :
  - pgTAP `29_ia_garde_fous.test.sql` (22 tests) ;
  - unitaires : masquage des parties du nom, des accents et des données hors fiche ;
  - e2e `ai-guardrails.spec.ts`, sur ordinateur et à 375 px.
- **Limites** :
  - le coût est une **estimation** (caractères × prix réglé) ; il sera remplacé par le nombre réel de jetons quand OpenAI sera branché ;
  - le masquage ne reconnaît pas un nom propre qui ne figure pas dans la fiche du contrat (tiers, membres de la famille) : l'avocat reste responsable du contenu envoyé.
  - les demandes d'IA faites par les tests e2e restent dans `private.ai_usage` en local jusqu'au prochain `pnpm db:reset`.
