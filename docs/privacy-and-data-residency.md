# Confidentialité et résidence des données — Phase 0

> Ce document ne constitue pas un avis juridique. Les points marqués « à valider avec un spécialiste » doivent être soumis au conseiller en protection des renseignements personnels du cabinet avant mise en production.

## 1. Ce qui est confirmé par la documentation officielle

| Composant | Localisation confirmée | Source |
|---|---|---|
| Base de données Supabase | Région Canada Central (`ca-central-1`, AWS) disponible et sélectionnable explicitement à la création du projet | Documentation Supabase |
| Clio Manage (compte canadien) | Données hébergées dans la région Clio Canada (`ca.app.clio.com`) | Documentation Clio |

## 2. Ce qui reste à valider

| Élément | Question ouverte | À valider avec |
|---|---|---|
| E-mails transactionnels Supabase Auth | Passent-ils par une infrastructure hors Canada avant livraison ? | Supabase (support) |
| Journaux techniques et sauvegardes Supabase | Sont-ils répliqués hors de la région choisie ? | Supabase (support / DPA) |
| SharePoint / Microsoft Graph | Quel tenant Microsoft 365 du cabinet, quelle région de données M365 ? | Administrateur M365 du cabinet |
| Sous-traitants tiers (antivirus, DocuSign, Stripe le cas échéant) | Localisation de traitement de chacun | Chaque fournisseur retenu |
| Accès support technique international | Le support de niveau 2/3 de Supabase ou Clio peut-il accéder aux données depuis l'extérieur du Canada en cas d'incident ? | DPA de chaque fournisseur |

## 3. Distinctions à maintenir explicitement dans la documentation contractuelle

- Hébergement au Canada ≠ traitement au Canada ≠ sauvegardes au Canada ≠ support accessible uniquement depuis le Canada.
- Les métadonnées techniques (logs d'accès, télémétrie) peuvent avoir un régime différent des données métier.

## 4. Minimisation des données

Conformément au principe déjà retenu dans l'architecture (voir `source-of-truth.md`), Supabase ne conserve pas de copie intégrale des données Clio ; cela réduit mécaniquement la surface de données personnelles à traiter dans le cadre de la Loi 25 (Québec) et de la LPRPDE fédérale — **sans que cela dispense d'une analyse d'impact relative à la vie privée (AIVP) formelle**, recommandée avant la mise en production.

## 5. Recommandation de Phase 0

Mener une analyse d'impact relative à la vie privée (AIVP) formelle avec le conseiller en conformité du cabinet avant la fin de la Phase 1, en s'appuyant sur le modèle de données (`data-model.md`) et la cartographie des sources de vérité (`source-of-truth.md`).

## Sources et niveau de confirmation

- Régions Supabase et Clio : confirmées par la documentation officielle.
- Toute affirmation relative à la conformité Loi 25/LPRPDE reste une hypothèse d'architecture nécessitant validation juridique — non couverte par les sources techniques consultées dans cette phase.
