# ADR 0039 — Copie Word (.docx) d'un contrat validé

- **Statut** : accepté (2026-10-29). Il complète l'ADR 0036 (lot 3), qui produisait le PDF seulement (décision du 2026-10-21 : « Word plus tard »). Le responsable du projet l'a demandé le 2026-10-28.

## Décision
| # | Sujet | Décision |
|---|---|---|
| 1 | Rôle | Le **PDF reste le document officiel** (empreinte SHA-256, envoyé au client, rangé dans Clio). Le Word est une **copie de travail** pour l'équipe, par exemple pour reprendre le texte dans un autre document. |
| 2 | Contenu | Les mêmes données que le PDF de la version validée (`pdfInputFor`) : titre, sections, champs remplis, annexe des services, pied de page avec la version et la date de validation, numéro de page. Le texte est figé depuis la validation. |
| 3 | Librairie | `docx` **9.15.0**, épinglée (revue de dépendance du 2026-10-28 : maintenue, MIT, sans script d'installation, sans faille connue). Seulement l'export principal : jamais de HTML, de macro, de fichier joint ni de lien. Le contenu vient de la liste blanche (ADR 0032) ; les caractères interdits en XML sont retirés. |
| 4 | Accès | `/api/contracts/[id]/docx` : **personnel de l'équipe seulement**. L'accès au dossier est vérifié d'abord ; le client reçoit la même 404. Le fichier est généré à la demande, jamais stocké. Limite de téléchargement : celle des documents. Journal : `contract.docx_downloaded` (version). |
| 5 | Écran | Dans « Contrat validé » : « Télécharger en Word (copie de travail, version N) », à côté du PDF officiel. |

## Conséquences
- **Dépendance** : `docx` 9.15.0 (avec `fflate`, déjà présent, et `nanoid` 6).
- **Tests** : unitaire `contract-docx.test.ts` (archive OOXML valide, aucune macro, caractères spéciaux) ; e2e `contracts-lot3.spec.ts` (téléchargement par l'équipe, 404 pour le client).
