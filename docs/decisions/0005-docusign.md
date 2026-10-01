# ADR 0005 — DocuSign pour la signature électronique

**Statut :** Acceptée (décision du cabinet, 2026-10-01)
**Date :** 2026-10-01

## Contexte
Le mémorandum EA cite DocuSign ; la maquette citait Adobe Sign. La question était ouverte.

## Décision
`SignatureProvider` aura pour implémentation réelle **`DocuSignProvider`** (API eSignature). `MockSignatureProvider` reste l'implémentation active jusqu'à la Phase 4.

## Conséquences
- Le document à signer est lu dans SharePoint (`01 Partagé avec le client`). Le PDF signé et le certificat de signature sont déposés dans `03 Signés` à réception du webhook DocuSign Connect, **signé HMAC et vérifié avant tout traitement**, puis tracé dans `private.webhook_events`.
- Signature **intégrée au portail** (embedded signing) ou par e-mail DocuSign : à choisir en Phase 4. L'intégration au portail garde l'expérience à la marque Lex Canada.
- Prérequis : compte développeur DocuSign (sandbox), puis compte de production du cabinet. Région de données DocuSign (Canada si disponible) **[À VÉRIFIER]**.
- Aucun changement de schéma : `signature_requests.provider` accepte déjà `docusign`.
