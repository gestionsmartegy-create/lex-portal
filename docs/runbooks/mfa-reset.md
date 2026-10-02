# Procédure — Un client a perdu l'accès à son application d'authentification

> Pour les **administrateurs du cabinet** (rôle `firm_admin`). Décision : ADR 0012.
> La vérification en deux étapes protège des dossiers juridiques. **Une réinitialisation accordée à la mauvaise personne lui donne accès à tout le dossier du client.** Les fraudeurs appellent souvent en se disant pressés, en déplacement ou en colère : la procédure s'applique **sans exception**.

## 1. À la réception de la demande
- Le client appelle ou écrit : « je n'ai plus mon téléphone », « j'ai changé de téléphone »…
- **Ne réinitialisez rien pendant ce premier contact.** Notez le nom et le dossier mentionnés, puis annoncez un rappel.
- Ne demandez **jamais** le mot de passe du client ni un code. Le cabinet ne le fait jamais, et la page « téléphone perdu » le dit au client.

## 2. Vérifier l'identité, au choix
**A. Rappel (cas normal)**
1. Ouvrez la fiche du contact **dans Clio**. Rappelez au **numéro inscrit dans Clio**, jamais à un numéro donné pendant l'appel ou dans un courriel.
2. Faites confirmer **deux** éléments que seul le client connaît, par exemple :
   - le numéro de dossier (LC-AAAA-NNNN) ou son objet ;
   - la date du dernier rendez-vous ;
   - le montant approximatif de la dernière facture ;
   - le nom de l'avocat responsable.
3. Si une réponse est fausse, ou si le numéro de Clio ne répond pas : **arrêtez**. Proposez une rencontre en personne.

**B. En personne**
Pièce d'identité officielle avec photo, comparée aux informations de Clio.

## 3. Réinitialiser dans le portail
1. Espace cabinet → **Sécurité → Réinitialiser la vérification en deux étapes** (`/admin/security/mfa-reset`).
2. Saisissez l'e-mail du client, la méthode de vérification (rappel ou en personne) et le motif.
3. Cochez « J'ai vérifié l'identité du client selon la procédure », puis validez.

Le portail fait alors, automatiquement :
- la suppression de l'application d'authentification du client ;
- sa déconnexion de **tous** ses appareils ;
- le remplacement de son mot de passe (personne ne le connaît, pas même vous) ;
- l'envoi d'un **e-mail** pour choisir un nouveau mot de passe (lien valable **1 heure**) ;
- la journalisation de l'opération à votre nom.

## 4. Après
- Dites au client de surveiller sa boîte de réception. S'il ne voit rien, faites-lui vérifier les indésirables. Le lien expire après 1 heure ; refaire la procédure si besoin.
- Au premier passage, le client choisit son mot de passe, puis **ajoute à nouveau** son application d'authentification.
- **Signal d'alerte** : si le client dit n'avoir rien demandé, traitez-le comme un **incident de sécurité** (tentative d'usurpation) et prévenez le responsable du portail.

## Ce qu'il ne faut jamais faire
- Réinitialiser à la demande d'un tiers (conjoint, assistant, « avocat du client ») sans que le client lui-même soit vérifié.
- Rappeler un numéro qui n'est pas celui de Clio.
- Communiquer un mot de passe ou un lien par téléphone.

## Personnel du cabinet
La vérification en deux étapes du personnel est gérée par **Microsoft 365 (Entra ID)**. En cas de perte du téléphone, contactez l'administrateur Microsoft 365 du cabinet. Le portail n'intervient pas.
