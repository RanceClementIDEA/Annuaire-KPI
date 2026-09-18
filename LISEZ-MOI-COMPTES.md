# Comptes et accès — mode d'emploi

Jusqu'ici, ouvrir l'annuaire demandait seulement de taper un nom : n'importe
qui connaissant l'adresse du site voyait, et modifiait, les KPI d'IDEA.

Désormais, chacun se connecte avec **son adresse professionnelle et son mot de
passe**, et vous validez chaque personne. Rien d'autre ne change : même
annuaire, même document partagé, mêmes favoris.

---

## Ce qui est garanti pour les données

Les favoris, l'espace personnel et l'historique de chacun sont rangés dans
l'annuaire **sous le nom** tapé jusqu'ici (« Marie », « benjamin »…).

En validant un compte, vous le **rattachez à ce nom**. La personne retrouve
alors exactement ce qu'elle avait. Aucun nom n'est supprimé, aucune donnée
n'est déplacée : le document partagé reste le même.

Le panneau « Comptes et accès » affiche tous les noms présents dans l'annuaire,
avec leurs favoris et leurs fiches, et indique ceux qui restent à rattacher.

⚠️ Le nom compte les majuscules : « Marie » et « marie » sont deux personnes
différentes pour l'annuaire. Le panneau propose automatiquement le nom existant
qui correspond — vérifiez-le d'un coup d'œil avant d'enregistrer.

---

## Avant de commencer

1. Dans l'annuaire, ouvrez **Synchronisation → 💾 Exporter une sauvegarde**.
2. Dans la console Firebase, **copiez vos règles actuelles** dans un fichier
   texte : c'est votre retour en arrière si quelque chose coince.

---

## Étape 1 — Déposer les fichiers (rien ne change encore)

Sur GitHub, dépôt **Annuaire-KPI**, branche **main** → *Add file* →
*Upload files* → déposez les fichiers de l'archive, puis *Commit changes*.

Le dossier `js/` est à déposer tel quel (il contient le nouveau `js/acces.js`).

**Supprimez aussi `Signets.xlsx`** (bouton 🗑 sur la page du fichier) :
l'application ne s'en sert pas, mais il publie toute la liste des KPI et leurs
liens Power BI.

**Prévenez vos collègues avant ce dépôt.** À partir de là, l'annuaire leur
demandera de créer un compte et d'attendre votre validation : choisissez un
moment calme et validez-les au fil de l'eau (quelques minutes chacun). Leurs
données restent intactes sur leur appareil pendant ce temps.

Attendez une minute, puis rechargez l'annuaire :

- **Écran de connexion avec adresse et mot de passe** → tout est en place.
- **Ancien écran avec un simple identifiant** → le navigateur affiche encore
  l'ancienne version : rechargez en forçant (Ctrl + Maj + R sur PC ; sur
  téléphone, fermez complètement l'application puis rouvrez-la).

---

## Étape 2 — Activer les comptes dans Firebase

Console Firebase → projet **annuaire-kpi** → **Authentication** →
**Sign-in method** → *Ajouter un fournisseur* → **Adresse e-mail/Mot de passe** →
activez le premier interrupteur → *Enregistrer*.

---

## Étape 3 — Votre compte d'administrateur

1. Dans l'annuaire, cliquez sur **Première connexion ? Créer mon compte**.
2. Nom dans l'annuaire : **exactement** celui que vous utilisiez.
3. Adresse professionnelle et mot de passe (8 caractères minimum) → *Créer*.
4. L'écran d'attente s'affiche : normal, personne ne peut encore valider.
5. Console Firebase → **Firestore Database** → collection **acces** → ouvrez le
   document qui porte votre identifiant → remplacez le champ `role` (vide) par
   **admin** → *Mettre à jour*.
6. Revenez à l'annuaire → **J'ai été validé — ouvrir l'annuaire**.

Le bouton **👥 Comptes et accès** apparaît alors dans le menu de gauche.

C'est la seule fois où l'on écrit dans la console : ensuite, tout se fait
depuis le panneau.

---

## Étape 4 — Les comptes de vos collègues

Pour chaque personne :

1. Elle ouvre l'annuaire, clique sur **Créer mon compte**, met son adresse
   professionnelle et le nom qu'elle utilisait (l'application le propose déjà
   si elle s'est connectée sur cet appareil).
2. Vous ouvrez **👥 Comptes et accès**. Sa demande apparaît en haut, encadrée
   en orange.
3. Vérifiez le **nom dans l'annuaire** proposé, choisissez le rôle
   (**Membre** en général, **Administrateur** pour gérer les accès), puis
   *Enregistrer*.
4. Elle clique sur **J'ai été validé** : l'annuaire s'ouvre avec ses favoris.

En bas du panneau, la liste des noms existants passe de « à rattacher » à
« rattaché à … ». Quand il ne reste plus personne d'utile à rattacher,
passez à l'étape 5.

---

## Étape 5 — Publier les règles (à faire en dernier)

Tant que cette étape n'est pas faite, l'annuaire reste ouvert à tous.
Une fois faite, seules les personnes validées y accèdent.

Console Firebase → **Firestore Database** → **Règles** → remplacez tout par le
contenu du fichier **`firestore.rules`** → *Publier*.

Avant de publier, vérifiez la ligne des domaines dans le fichier :

```
.matches('^[^@]+@(groupe-idea[.]com)$')
```

Elle doit contenir le domaine de vos adresses professionnelles. Si vous le
changez, changez aussi la liste `DOMAINES` au début de `js/acces.js`.

**Contrôle :** ajoutez un KPI sur un appareil, vérifiez qu'il arrive sur un
autre. Puis ouvrez `tests.html` → **🔎 Données réelles** : le contrôle
« Visiteur sans compte refusé » doit être vert.

**En cas de problème :** republiez vos anciennes règles (copiées à l'étape 0).
Les données ne risquent rien, seul l'accès change.

---

## Au quotidien

- **Un collègue part :** 👥 Comptes et accès → *Retirer*. Ses favoris restent
  dans l'annuaire, son compte se supprime dans la console Firebase
  (Authentication → Utilisateurs).
- **Mot de passe oublié :** lien sur l'écran de connexion (l'e-mail peut
  arriver dans les courriers indésirables).
- **Changer son mot de passe :** Synchronisation → *Mon compte*.
- **Page de tests :** connectez-vous d'abord à l'annuaire avec votre compte
  administrateur, sinon les contrôles sur la vraie base sont ignorés.
- **Copie d'essai** (`annuaire-test.html`) : même connexion que l'annuaire,
  mais document séparé — elle ne touche jamais aux vraies données.

---

## Une limite à connaître

Les espaces personnels voyagent dans le document partagé, comme avant : ils ne
s'affichent que chez leur propriétaire, mais un membre qui irait regarder la
base pourrait les lire. Discret, donc, mais pas confidentiel. Les rendre
vraiment privés demanderait un document par personne.
