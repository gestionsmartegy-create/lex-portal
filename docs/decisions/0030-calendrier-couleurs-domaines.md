# ADR 0030 — Couleurs par domaine dans le calendrier de cour

- **Statut** : accepté (2026-10-18), à la demande du responsable : « de vraies couleurs, rouge, jaune, bleu, pas des couleurs ternes ».

## Décision
- Chaque date du calendrier de cour est une pastille de **couleur pleine** selon le domaine du dossier, avec une légende au-dessus du calendrier :
  - **Immigration** : bleu vif `#0050ff` (tous les types « immigration », y compris l'immigration économique) ;
  - **Légal** : rouge franc `#e00000` ;
  - **Affaires** : jaune franc `#ffcc00` ;
  - **Conseil stratégique** : vert franc `#008a2e` ;
  - **Autre** : gris (dossier sans type).
- Les couleurs sont des jetons du thème (`--color-dom-*` dans `app/globals.css`). Le texte reste lisible (AA) : blanc sur le bleu, le rouge et le vert, marine sur le jaune.
- **À confirmer** : bordure en pointillés. **Conflit d'horaire** : cadre noir épais et mention « Conflit d'horaire ». Le rouge est réservé au domaine Légal.
- `court_calendar_feed` renvoie en plus le code du type et le groupe de pratique du dossier (migration `20261018120000_court_calendar_domain.sql`). Ce n'est pas une donnée sensible, et les autres règles restent inchangées.
