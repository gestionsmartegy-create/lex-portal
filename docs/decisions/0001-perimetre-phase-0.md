# ADR 0001 — Aucun code de production en Phase 0

**Statut :** Acceptée
**Date :** 2026-07-27

## Contexte
Le cahier des charges demande explicitement de ne pas générer d'application, de ne pas créer d'intégrations réelles (Clio, Microsoft, SharePoint, DocuSign, paiement) et de ne pas produire de code de production durant la Phase 0.

## Décision
La Phase 0 produit exclusivement de la documentation d'analyse et d'architecture (16 documents Markdown). Aucun fichier de code, aucune migration Supabase, aucun `.env.example` n'est créé à ce stade.

## Conséquences
- Les dossiers `supabase/migrations/` restent vides jusqu'à la Phase 1.
- Le modèle de données (`data-model.md`) sert de spécification, pas d'implémentation.
- Toute demande de code pendant cette phase doit être redirigée vers une validation explicite du passage en Phase 1.
