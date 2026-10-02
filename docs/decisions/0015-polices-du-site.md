# ADR 0015 — Polices du site lexcanadalaw.com

- **Statut** : accepté (2026-10-03)
- **Contexte** : le portail reprenait les polices de la maquette Manus (Playfair Display pour les titres, Cormorant Garamond pour l'accent, DM Sans pour le texte). Le responsable demande les **mêmes polices que le site public du cabinet**.

## Décision
- Polices relevées le 2026-10-03 sur lexcanadalaw.com (styles calculés) : **Libre Franklin** pour les titres et **DM Sans** pour le texte.
- Titres et accent : **Libre Franklin**, police variable de 100 à 900 en romain et en italique, sous-ensemble latin.
  - Grand titre en 800 (-0,025 em) ; sous-titres en 700.
  - L'accent est en italique doré, comme le mot mis en avant du site.
- Texte : **DM Sans**, sans changement.
- Fichiers dans `app/fonts`, avec la licence `OFL-librefranklin.txt` (SIL OFL 1.1), chargés par `next/font/local`. Aucun appel à Google, ni au build ni à l'exécution (ADR 0009).
- Playfair Display et Cormorant Garamond sont retirées du dépôt.

## Conséquences
- `--font-accent` pointe désormais sur Libre Franklin. Les classes `font-display` et `font-accent` restent inchangées dans le code.
- Les e-mails restent en Arial, la police sûre des clients de messagerie.
- `docs/design-system.md` §2 est mis à jour.
