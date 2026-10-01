# Sources de vérité — Portail Client Lex Canada

| Catégorie de données | Système maître | Systèmes consommateurs | Sens de synchronisation | Fréquence | Résolution de conflit | Rétention |
|---|---|---|---|---|---|---|
| Contacts, clients | Clio Manage | Portail (cache), SharePoint (métadonnées) | Clio → Portail | Périodique + webhook `contact.*` (si abonné) | Clio toujours prioritaire | Cache : durée de la relation client |
| Dossiers (matters), statut, équipe | Clio Manage | Portail (cache) | Clio → Portail | Périodique + webhook `matter.*` | Clio toujours prioritaire | Cache : durée du dossier actif + purge après clôture (délai à définir avec le cabinet) |
| Calendrier, rendez-vous | Clio Manage | Portail (affichage) | Clio → Portail | Périodique + webhook `calendar_entry.*` | Clio toujours prioritaire | Pas de copie persistante au-delà de l'affichage |
| Facturation, factures, soldes | Clio Manage | Portail (affichage) | Clio → Portail | Périodique + webhook `bill.*` (si disponible — à confirmer) | Clio toujours prioritaire | Pas de copie persistante des montants au-delà du cache d'affichage |
| Paiements | Clio Payments (si retenu) ou fournisseur externe | Clio Manage (réconciliation) | Fournisseur → Clio → Portail (affichage seul) | Temps réel (webhook fournisseur) + réconciliation périodique | Le fournisseur de paiement est la source des transactions ; Clio reste la source de la facturation | Le portail ne stocke aucune donnée bancaire |
| Documents officiels | **SharePoint** — décidé par le cabinet (ADR 0004) ; visibilité client = sous-dossier (`sharepoint-integration.md` §3) | Portail (références uniquement) | SharePoint/Clio → Portail | Synchronisation de métadonnées uniquement | Le système documentaire retenu est toujours prioritaire | Le contenu des fichiers n'est jamais dupliqué dans Supabase |
| Demandes de documents | Portail (Supabase) | — | Propre au portail | Temps réel | N/A — donnée native du portail | Durée du dossier |
| Messagerie | À déterminer (Clio for Clients, ou messagerie propre au portail, ou redirection) — voir `clio-api-mapping.md` §Messagerie | Portail | Selon l'option retenue | Selon l'option retenue | Selon l'option retenue | Selon l'option retenue |
| Comptes, rôles, préférences | Supabase | — | Propre au portail | Temps réel | N/A | Durée de vie du compte |
| Droits d'accès aux dossiers (`matter_access`) | Supabase | — | Propre au portail, alimenté manuellement par un administrateur | Temps réel | N/A | Historique conservé pour audit |
| Notifications du portail | Supabase | — | Propre au portail | Temps réel | N/A | Politique de purge à définir |
| États de synchronisation, journaux techniques | Supabase | — | Propre au portail | Temps réel | N/A | Politique de rétention technique à définir |
| Journal d'audit applicatif | Supabase | — | Propre au portail | Temps réel (append-only) | N/A | Conservation longue (exigence de traçabilité juridique) — durée à définir avec le cabinet et son conseiller en conformité |
| Prospects, intake | Clio Grow | Non consommé par le portail client (hors périmètre — le portail sert des clients déjà actifs) | N/A | N/A | N/A | N/A |

## Principe directeur

Supabase n'est **jamais** une source de vérité pour une donnée métier existant déjà dans Clio ou SharePoint. Il ne stocke que :
- les identités et droits du portail ;
- un cache non-autoritaire marqué par `last_synced_at`, affiché avec indication de fraîcheur ;
- les données strictement propres au portail (préférences, notifications, demandes de documents, audit).

## Sources et niveau de confirmation

- Webhooks Clio par modèle de ressource (`activity`, `contact`, etc., structure vue dans la documentation officielle) : confirmés pour les modèles génériques ; la disponibilité précise d'un webhook `bill.*` n'a pas été confirmée explicitement dans les extraits consultés — **à valider dans le catalogue exact des événements de webhook du compte canadien**.
- Clio Grow distinct de Clio Manage (systèmes séparés, API distinctes) : confirmé par la documentation.
- Le statut du système documentaire officiel (SharePoint vs Clio Documents) reste une **recommandation** du mémorandum interne, non une décision confirmée par le cabinet.
