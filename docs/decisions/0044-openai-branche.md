# ADR 0044 — Assistant IA : branchement d'OpenAI

- **Statut** : accepté par le responsable du projet (Chuck, Smartegy), le 2026-11-25, pour le soft launch.
- **Contexte** :
  - L'assistant de rédaction des contrats (ADR 0032, 0037) fonctionne en simulateur. Le masquage, le plafond, le journal et le gabarit en brouillon sont construits.
  - Le branchement attendait l'accord du cabinet, une clé, et des décisions sur les données envoyées, la conservation et la Loi 25 (`docs/open-questions.md`).
  - Une clé API « Lex Canada Portal » a été créée le 2026-11-25, sur un compte OpenAI personnel (environ 100 $ de crédits), en attendant le compte business en décembre 2026.

## Décision
| # | Sujet | Décision |
|---|---|---|
| 1 | Données envoyées | Accord du cabinet : les textes de contrats et les consignes, **après masquage** (ADR 0037), sont envoyés à OpenAI. Rien d'autre (aucune fiche, aucun document). |
| 2 | Clients du Québec | **Aucune restriction** : l'usage relève du jugement professionnel de l'avocat. Risque accepté : l'EFVP de la Loi 25 n'est pas faite avant l'envoi hors Québec. |
| 3 | Conservation | Environ 30 jours chez OpenAI (surveillance des abus, aucun entraînement par défaut sur l'API) acceptés pour le soft launch. `store: false` sur chaque appel. Conservation zéro à demander avec le compte business. |
| 4 | Plafond | 50 $ par mois, réglé par un firm_admin dans Intégrations → « Assistant IA » (`public.ai_settings`, ADR 0037). Pas dans le code. |
| 5 | Implémentation | `OpenAiDraftingGateway` (`server/providers/ai/client.ts`) : `fetch` vers `POST https://api.openai.com/v1/chat/completions`, sans nouvelle librairie ; délai de 45 s (aide à la rédaction) et 90 s (gabarit), car les modèles à raisonnement sont plus lents ; gabarit en sortie structurée (JSON Schema strict) ; réponses validées par Zod (`schemas.ts`) ; erreurs en codes internes (`RATE_LIMITED`, `UNAVAILABLE`, `UPSTREAM`), jamais la réponse brute ; réponse refusée, coupée ou vide rejetée. |
| 6 | Configuration | `INTEGRATION_MODE_AI=live`, `OPENAI_API_KEY` (obligatoire en live, saisie par le cabinet seulement), `OPENAI_MODEL` (`gpt-5-mini` par défaut, modifiable sans code). |

## Conséquences
- Les variables sont à saisir par le cabinet dans `.env.local`, dans Vercel, et sur le serveur de test.
- **Coût** : toujours une **estimation** au nombre de caractères (ADR 0037). Le coût réel en jetons demande une nouvelle migration de `public.ai_complete` : tâche suivante.
- **Transfert en décembre 2026** : créer une nouvelle clé sur le compte business, la remplacer partout, puis révoquer l'ancienne (elle n'expire pas et a circulé par courriel).
- **Limite de dépenses côté OpenAI** : à régler aussi dans le compte OpenAI (le plafond du portail n'est qu'une estimation).
- **Durée maximale des fonctions** chez l'hébergeur : vérifier qu'elle dépasse 90 s sur Vercel avant d'utiliser la génération de gabarit en préprod.
- Les tests automatiques n'appellent jamais OpenAI (faux serveur dans `tests/unit/ai-openai-client.test.ts`).
- Le masquage ne reconnaît pas un nom propre absent de la fiche (tiers, famille) : l'avocat reste responsable du contenu envoyé (ADR 0037).
