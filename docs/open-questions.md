# Questions ouvertes — Phase 0

## Clio

| Question | Conséquence si non répondue | Priorité |
|---|---|---|
| L'API permet-elle réellement l'upload de documents pour le compte canadien retenu, et avec quelles permissions ? | Impossible de confirmer le flux de téléversement direct vers Clio en alternative à SharePoint | Élevée |
| La messagerie Clio for Clients est-elle exposée en écriture par API ? | Détermine l'architecture de la messagerie (intégration vs Supabase vs redirection) | Élevée |
| Quel est le catalogue exact des événements webhook disponibles (`bill.*`, `document.*`) pour le compte canadien ? | Détermine la nécessité d'une synchronisation périodique plus fréquente en secours | Moyenne |
| L'endpoint de création de lien de paiement Clio Payments est-il disponible et documenté pour un compte canadien ? | Détermine si Clio Payments est retenu comme `PaymentProvider` principal | Élevée |

## Microsoft 365 / SharePoint

| Question | Conséquence | Priorité |
|---|---|---|
| SharePoint est-il confirmé comme dépôt documentaire officiel pour les documents partagés avec les clients (et non seulement en interne) ? | Détermine l'ensemble de l'architecture documentaire du portail | Critique |
| Existe-t-il déjà un site/bibliothèque dédié, ou faut-il le créer ? | Impact sur le calendrier de la Phase 3 | Élevée |
| Qui a l'autorité pour créer l'App Registration Azure ? | Bloquant pour tout développement de l'intégration Graph | Élevée |

## Sécurité

| Question | Conséquence | Priorité |
|---|---|---|
| Le cabinet a-t-il déjà un coffre-fort de secrets (Key Vault ou autre) ou faut-il en prévoir un dans le périmètre du portail ? | Détermine l'architecture de gestion des jetons OAuth | Élevée |
| Quel fournisseur d'analyse antivirus est acceptable pour le cabinet ? | Bloquant pour le téléversement sécurisé | Moyenne |

## Documents

| Question | Conséquence | Priorité |
|---|---|---|
| Quelle politique de rétention documentaire s'applique déjà aux dossiers clients ? | Détermine les règles de purge du cache Supabase | Moyenne |

## Paiements

| Question | Conséquence | Priorité |
|---|---|---|
| Le cabinet a-t-il déjà un compte Clio Payments actif, ou faut-il envisager Stripe/un fournisseur canadien alternatif ? | Détermine le fournisseur `PaymentProvider` du MVP | Élevée |

## Signatures

| Question | Conséquence | Priorité |
|---|---|---|
| Le cabinet a-t-il déjà un compte DocuSign (ou équivalent) ? | Détermine si la signature électronique peut entrer dans le MVP ou doit être reportée | Moyenne |

## Utilisateurs

| Question | Conséquence | Priorité |
|---|---|---|
| Le personnel interne doit-il un jour se connecter au portail (au-delà de Clio/M365), avec fédération Entra ID ? | Détermine si une brique SSO doit être prévue architecturalement dès le MVP même si non activée | Moyenne |

## Confidentialité

| Question | Conséquence | Priorité |
|---|---|---|
| Une analyse d'impact relative à la vie privée (AIVP) a-t-elle déjà été réalisée pour un projet similaire au cabinet ? | Détermine le calendrier de validation juridique avant mise en production | Élevée |

## Exploitation

| Question | Conséquence | Priorité |
|---|---|---|
| Quel hébergeur/plan (Vercel, Azure, autre) le cabinet souhaite-t-il retenir à terme ? | Influence directement la matrice de décision d'architecture | Élevée |

## Sources et niveau de confirmation

Toutes ces questions découlent directement des points marqués « à valider » dans `clio-api-mapping.md`, `sharepoint-integration.md`, `architecture-evaluation.md` et `privacy-and-data-residency.md`.

## Ajouts du 2026-10-01 (reconstruction)

| Question | Conséquence si non répondue | Priorité |
|---|---|---|
| **Pourquoi un portail sur mesure plutôt que Clio for Clients**, le portail natif inclus dans Clio (messages, documents, factures) ? | Risque de développer ce que le cabinet possède déjà. À justifier par écrit (image de marque, intégration SharePoint, bilinguisme, expérience client…) | **Critique** |
| Hébergement final : Vercel (déjà utilisé) ou Azure App Service (cité dans `technical-access-requirements.md`) ? | Choix du worker de synchronisation (Vercel Cron ou Azure Functions) et du coffre-fort (Supabase Vault ou Azure Key Vault). Le code reste neutre en attendant | Élevée |
| Accès administrateur au projet Supabase « lex law » existant et région réelle ? | Sinon : nouveau projet en `ca-central-1` (ADR 0002) | Élevée |
| Cadre réglementaire applicable : LPRPDE + règles de la Nova Scotia Barristers' Society (infonuagique) ; Loi 25 seulement pour les clients du Québec ? | Contenu de l'AIVP et des mentions de confidentialité | Élevée |
| ~~Langue par défaut du portail~~ | ✅ **Anglais** (ADR 0006) ; détection du navigateur active | — |
| ~~Couleur des liens en petit texte~~ | ✅ **`gold-ink #8A6D1A`** (ADR 0006) | — |
| Domaine du portail (`portal.lexcanadalaw.com` ?) | URI de redirection OAuth de production (Clio, Entra), CSP, e-mails | Élevée |
| Qui est le premier firm_admin ? | Personne ne peut inviter de client | Élevée |
| Durée d'inactivité avant déconnexion, taille maximale des fichiers, formats acceptés | Paramètres de sécurité et d'interface | Moyenne |
| L'écran « Integrations » de la maquette doit-il exister ? (retiré du portail client, éventuellement dans `/admin`) | Périmètre de l'espace admin | Faible |
| ~~Fournisseur de signature : DocuSign ou Adobe Sign ?~~ | ✅ **Tranché le 2026-10-01 : DocuSign** (ADR 0005) | — |
| ~~SharePoint : site à créer ou structure existante ?~~ | ✅ **Réponse du 2026-10-01 : les dossiers clients existent déjà dans SharePoint ET dans Clio.** Reste à décrire : l'arborescence SharePoint actuelle (site, bibliothèque, nommage) et le rôle de chacun (voir la question suivante) | Élevée |
| **Répartition SharePoint / Clio** : quels fichiers vivent dans SharePoint, lesquels dans Clio Documents, et y a-t-il une synchronisation entre les deux (manuelle, intégration Clio, Power Automate) ? Lequel est la référence pour les fichiers **partagés avec le client** ? | Détermine si le portail lit SharePoint seul (ADR 0004) ou les deux sources ; risque de doublons ou de versions divergentes | **Critique** |
| **Antivirus des dépôts client** : option A (antivirus du portail avant SharePoint) ou option B (Microsoft Defender dans SharePoint) ? — **en cours de validation par le cabinet (2026-10-01)** | Pipeline de téléversement et résidence des fichiers. Bloque seulement la Phase 3 | Élevée |
| ~~Les documents doivent-ils aussi exister dans Clio Documents ?~~ | ✅ Oui, ils existent déjà dans les deux : voir « Répartition SharePoint / Clio » ci-dessus | — |
| Le texte « Platform Vision » de la maquette (portail à la marque Lex Canada qui masque Clio) est-il la justification officielle du portail sur mesure ? | Ferme la question critique « pourquoi pas Clio for Clients » | Élevée |

