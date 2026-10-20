# Liens de test — serveur de TEST

Site : https://lexlaw.2-24-110-184.sslip.io (données fictives uniquement).

Les **mots de passe** ne sont jamais écrits dans le dépôt. Ils sont générés sur le serveur, dans `/opt/lexlaw/ACCES.md`. Pour les afficher (sur votre ordinateur) :

```bash
ssh root@2.24.110.184 "cat /opt/lexlaw/ACCES.md"
```

## Comptes

| Compte | Rôle | Page de connexion |
|---|---|---|
| `demo.admin@lexcanadalaw.test` | Administrateur du cabinet (firm_admin) | https://lexlaw.2-24-110-184.sslip.io/fr/staff/login — formulaire « démonstration » |
| `demo.staff@lexcanadalaw.test` | Personnel (avocat, adjoint·e) | https://lexlaw.2-24-110-184.sslip.io/fr/staff/login — formulaire « démonstration » |
| `john.doe@example.com` | Client | https://lexlaw.2-24-110-184.sslip.io/fr/login — puis double vérification (application d'authentification) |
| `jane.roe@example.com` | Client | https://lexlaw.2-24-110-184.sslip.io/fr/login — puis double vérification |
| Boîte d'e-mails de test (Mailpit) | Voir les e-mails envoyés | https://lexlaw.2-24-110-184.sslip.io/_mail/ — utilisateur `lex` |

## Ce que chacun peut tester

| Page | Lien | Admin | Personnel | Client |
|---|---|:-:|:-:|:-:|
| Ma journée | https://lexlaw.2-24-110-184.sslip.io/fr/admin | ✅ | ✅ | — |
| Contrats | https://lexlaw.2-24-110-184.sslip.io/fr/admin/contracts | ✅ | ✅ | — |
| Nouveau contrat depuis la convention d'honoraires | https://lexlaw.2-24-110-184.sslip.io/fr/admin/contracts/new?template=10000000-0000-4000-8000-0000000c0005 | ✅ | ✅ | — |
| Modèles de contrats | https://lexlaw.2-24-110-184.sslip.io/fr/admin/contracts/templates | ✅ tous, relire et publier | ✅ publiés seulement | — |
| Clauses | https://lexlaw.2-24-110-184.sslip.io/fr/admin/contracts/clauses | ✅ | 404 | — |
| Services et taxes | https://lexlaw.2-24-110-184.sslip.io/fr/admin/contracts/services | ✅ | 404 | — |
| Calendrier de cour | https://lexlaw.2-24-110-184.sslip.io/fr/admin/court-calendar | ✅ | ✅ | — |
| Mon agenda (Outlook, simulateur) | https://lexlaw.2-24-110-184.sslip.io/fr/admin/my-calendar | ✅ | ✅ | — |
| Dossiers | https://lexlaw.2-24-110-184.sslip.io/fr/admin/matters | ✅ | ✅ (son équipe) | — |
| Messages du cabinet | https://lexlaw.2-24-110-184.sslip.io/fr/admin/messages | ✅ | ✅ | — |
| Clients, invitations, personnel, audit | https://lexlaw.2-24-110-184.sslip.io/fr/admin/clients | ✅ | 404 | — |
| Accueil du client | https://lexlaw.2-24-110-184.sslip.io/fr/portal | — | — | ✅ |
| Dossiers du client | https://lexlaw.2-24-110-184.sslip.io/fr/portal/matters | — | — | ✅ |
| Documents, messages, factures, rendez-vous | https://lexlaw.2-24-110-184.sslip.io/fr/portal/documents | — | — | ✅ |
| Contrats du client (lire, accepter) | https://lexlaw.2-24-110-184.sslip.io/fr/portal/contracts | — | — | ✅ |
| Dates de cour du client (cochées « visible au client ») | https://lexlaw.2-24-110-184.sslip.io/fr/portal/appointments | — | — | ✅ |

Version anglaise : remplacer `/fr/` par `/en/`.
