# ADR 0042 — Design plus sobre : casse normale, graisses allégées, un seul bouton plein

- **Statut** : accepté (2026-11-10), décision du responsable du projet.
- **Contexte** : l'interface reprenait fidèlement la maquette et le site public (petits libellés en MAJUSCULES espacées, titres en 800, boutons dorés pleins à côté des boutons marine, titres de salutation). L'ensemble donnait un effet « gabarit ». Le responsable demande un rendu plus sobre, sans changer les fonctions.
- **Décision** :
  1. Plus de majuscules espacées : libellés, étiquettes, en-têtes de tableau et groupes du menu en casse normale ; aucun texte sous 11px.
  2. Titres en 600, boutons en 500.
  3. Un seul bouton plein par écran (`primary`). `outline-gold` devient un contour doré sur fond blanc.
  4. Titres de page sans salutation (« Tableau de bord », « Ma journée »).
  5. Couleurs d'état nommées (`danger-ink`, `info-ink`, `success-ink`), chiffres alignés, transitions de couleur seulement.
  6. Journal d'audit lisible sous 640px (une ligne par bloc).
- **Conséquences** :
  - `docs/design-system.md` porte une révision datée du 2026-11-10, qui prime sur le tableau typographique d'origine.
  - Les composants partagés `Button` et `Badge` changent : l'effet est visible sur tout le site.
  - L'identité reste celle du cabinet : marine, or, Libre Franklin et DM Sans. L'italique doré du slogan (ADR 0015) est conservé.
  - Tests e2e mis à jour pour les trois titres de page. Aucune règle d'accès, aucune donnée ni aucune route n'est touchée.
