---
name: corriger
description: « Ça ne marche pas » — corriger un bug. Claude reproduit d'abord le problème (test qui échoue ou parcours dans le navigateur), explique la cause en mots simples, corrige à la racine, prouve que le test passe, puis suit le flux complet (QA, sécurité, sauvegarde, serveur de test, comment tester).
---

L'argument est la description du bug, en français, avec si possible : la page, ce qui a été fait, ce qui s'est passé, ce qui était attendu. Exemple : `/corriger sur /fr/portal/billing, le montant d'une facture s'affiche en dollars US au lieu de dollars canadiens`.

Suis `/developper` avec le type de branche **`fix`**, et ces consignes en plus :

1. **Reproduire avant de toucher au code.** Écris un test Vitest (ou d'intégration, ou e2e si c'est un parcours) qui **échoue** aujourd'hui et qui décrit le comportement attendu. Si tu ne parviens pas à reproduire, dis-le et pose une question précise ; ne « corrige » pas à l'aveugle.
2. **Expliquer la cause** en une ou deux phrases, sans jargon : « le montant est formaté avec la langue du navigateur au lieu de `CAD` ».
3. **Corriger à la racine**, pas le symptôme. Jamais en supprimant ou en désactivant un test, une règle de lint ou une vérification (AGENTS.md §2.12).
4. Le test de l'étape 1 doit **passer** après la correction ; il reste dans le dépôt.
5. Si la cause est dans une zone réservée (authentification, sessions, RLS, CSP, `server/security/`, `server/auth/`, `proxy.ts`) ou dans une migration existante : arrête-toi, décris la cause et le correctif proposé, et transmets-les au responsable technique (message direct, ou demande de fusion en brouillon avec la note en tête). Un bug de sécurité lui est signalé immédiatement.
