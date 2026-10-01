# ADR 0002 — Reconstruction du portail à partir des spécifications

**Statut :** Acceptée
**Date :** 2026-10-01

## Contexte
Une première version du portail (Next.js) est déployée sur Vercel (`lex-law.vercel.app`, équipe `smartegys-projects`). Son code source est dans un dépôt GitHub privé (`Smartegy/lex-law`) auquel l'équipe actuelle n'a pas accès. Le projet Vercel est « sourceless » : aucune copie du code ne peut être récupérée par Vercel. Le site public ne sert que du code compilé, inexploitable.

## Décision
Reconstruire le portail dans un **nouveau dépôt**, à partir des documents de Phase 0 (`docs/`), du schéma v2 (`supabase/schema.sql`) et de la maquette Manus (référence visuelle, `docs/design-system.md`). On ne réutilise aucun code de l'ancienne version.

## Conséquences
- **Tous les secrets connus de l'ancienne équipe doivent être renouvelés** avant toute utilisation par la nouvelle version : clés Supabase (`anon`, `service_role`) ou nouveau projet ; secret client de l'App Registration Entra ID ; identifiants Clio ; tout jeton d'API.
- Le projet Supabase « lex law » existant n'est réutilisé que si l'on y a un accès administrateur **et** que sa région est `ca-central-1`. Sinon, on crée un nouveau projet en `ca-central-1`.
- L'ancienne application reste en ligne tant que la nouvelle n'est pas en production. Son retrait sera décidé par le cabinet.
- La Phase 1 est refaite intégralement, avec les ajouts du schéma v2 (ADR 0003).
