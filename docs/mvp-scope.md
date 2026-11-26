# Périmètre du MVP — Portail Client Lex Canada

## Classification des fonctionnalités

| Fonctionnalité | Classification | Justification |
|---|---|---|
| Authentification (connexion, invitation, MFA) | MVP indispensable | Fondation de toute isolation de données |
| Tableau de bord | MVP indispensable | Valeur perçue immédiate pour le client |
| Liste et détail des dossiers (lecture) | MVP indispensable | Capacité Clio confirmée (lecture) |
| Documents — consultation et téléchargement | MVP indispensable | Capacité API confirmée pour la lecture, sous réserve du dépôt retenu |
| Documents — téléversement client | MVP (Phase 3) | SharePoint retenu (ADR 0004) ; dépend de l'App Registration Graph et du choix de l'antivirus |
| Calendrier (lecture) | MVP indispensable | Ressource Clio confirmée |
| Factures (lecture seule, sans paiement) | MVP indispensable | Ressource Clio confirmée en lecture |
| Notifications in-app | MVP optionnel | Valeur ajoutée, faible risque technique |
| Profil et sécurité (MFA, sessions) | MVP indispensable | Exigence de sécurité de base |
| Administration des accès | MVP indispensable | Sans elle, aucune association client↔dossier n'est possible |
| Audit | MVP indispensable | Exigence de traçabilité dès le premier accès réel à des données Clio |
| Messagerie bidirectionnelle | Phase 2 (à reporter) | Capacité API non confirmée — nécessite arbitrage |
| Paiement intégré | Phase 2 (à reporter) | Fournisseur non confirmé |
| Signature électronique | Livrée par Clio | Option A (2026-10-15) : dépôt du PDF validé dans le dossier Clio dès la validation (ADR 0045), signature lancée par l'avocat dans Clio |
| Synchronisation en temps réel (Realtime) | Phase 2 (à reporter) | Non indispensable tant que le volume de dossiers reste faible |
| Application mobile | À exclure tant que non confirmé | Hors périmètre du cahier des charges actuel |
| Intelligence artificielle (assistance rédaction, etc.) | À exclure tant que non confirmé | Hors périmètre du portail client, relève du pôle Cognitive AI Platform du mémorandum interne |
| Automatisations avancées (Power Automate, etc.) | À exclure tant que non confirmé | Relève de l'architecture interne, pas du portail client |
| Espace interne complet pour les avocats | À exclure | Explicitement hors périmètre — le personnel continue de travailler dans Clio/M365 |

## Critères d'acceptation du MVP (indicatifs)

- Un client ne peut voir que les dossiers listés dans `matter_access` pour son compte, vérifié par un test RLS automatisé.
- Les données de dossier affichées portent une indication de fraîcheur (`last_synced_at`).
- Aucune donnée bancaire ni jeton OAuth n'apparaît en base en clair.
- Le MFA est disponible pour tous les comptes clients.
- Toute action d'un administrateur sur les accès est journalisée et immédiatement effective.

## Ordre de développement recommandé

1. Fondations + authentification + RLS (Phase 1).
2. Lecture des dossiers, calendrier, factures (Phase 2).
3. Documents (Phase 3), après arbitrage du dépôt officiel.
4. Fonctionnalités reportées (Phase 4), une par une, chacune derrière son abstraction (`PaymentProvider`, `SignatureProvider`).

## Sources et niveau de confirmation

Classification fondée sur les statuts de faisabilité établis dans `clio-api-mapping.md` et `sharepoint-integration.md`. Toute fonctionnalité marquée « à valider » dans ces documents est volontairement classée en Phase 2/3 plutôt qu'en MVP indispensable.
