# Sélection de rituel → PowerPoint

Produit, depuis l'annuaire, un support à la charte IDEA : une diapositive de
couverture puis **une diapositive par KPI sélectionné**, calquée sur les pages 3 à 10
du support « Indicateurs Magasins Armement ».

## Utilisation

1. **Barre latérale → « Sélection & PowerPoint »**. Une barre d'action apparaît et
   chaque carte reçoit une case à cocher.
2. **Filtrez** (Rituel = COPIL, par exemple) puis **« ✓ Tout cocher »**. Le numéro
   affiché sur chaque case est le rang de la diapositive : c'est l'ordre du jour.
3. **« 💾 Enregistrer »** nomme la sélection. Elle est partagée avec l'équipe par la
   synchronisation existante et se recharge d'un clic la semaine suivante.
4. **« 📊 Générer le PowerPoint »** : réglez le titre, le sous-titre et la période,
   ajustez l'ordre et les commentaires, puis téléchargez.

### Avoir le VISUEL, et pas seulement un lien

Le choix se fait dans la fenêtre de génération, liste **« Contenu des visuels »**.

#### 1. Visuel vivant — complément Power BI (par défaut)

Le générateur pose dans chaque diapositive le **complément Power BI pour PowerPoint**,
configuré sur l'adresse du KPI. Le visuel est *connecté* : rien à capturer, et le
support affiche les données du jour chez chaque lecteur qui a les droits. Le deck du
COPIL de la semaine prochaine montrera les chiffres de la semaine prochaine, sans le
régénérer.

Structure produite, relevée sur un fichier fabriqué par Power BI lui-même
(« Exporter → PowerPoint → Incorporer des données actives ») :

- `ppt/webextensions/webextensionN.xml` — complément `WA200003233`, avec la propriété
  `reportUrl` (chemin relatif à `app.powerbi.com`), `reportState = CONNECTED`,
  `artifactViewState = live`
- dans la diapositive, un `mc:AlternateContent` : la branche `Choice` porte le
  `graphicFrame` du complément, la branche `Fallback` affiche un cadre expliquant
  qu'il faut activer le complément — jamais un trou blanc

Prérequis côté lecteur : PowerPoint 365 avec WebView2, connecté au **même compte
professionnel** que Power BI. Si le complément est bloqué par la stratégie du tenant,
c'est la branche `Fallback` qui s'affiche.

#### Le signet, ou pourquoi le bon visuel peut montrer les mauvaises données

Dans cet annuaire, plusieurs KPI partagent le même visuel Power BI : ce qui les distingue
est le **signet** (`bookmarkGuid`), qui applique le filtre — périmètre, temporalité. Le
même graphique devient « Volumétrie Distribution Logistiport hebdomadaire » ou
« … MG Armement mensuelle » selon le signet appliqué.

Le complément n'applique le signet que si l'adresse porte **`bookmarkUsage=1`**. C'est ce
que Power BI écrit lui-même quand c'est lui qui fabrique le fichier ; le générateur le pose
donc systématiquement dès qu'un `bookmarkGuid` est présent. Sans lui, toutes les
diapositives affichaient le visuel dans son état par défaut : le bon graphique, les
mauvaises données.

Le contrôle affiche le signet de chaque diapositive, et signale deux diapositives qui
viseraient le même visuel **avec le même signet** — elles montreraient rigoureusement la
même chose.

#### Le bon graphique, et lui seul

Le complément n'affiche que ce que le lien désigne. Deux pièges, tous deux
détectés dans la fenêtre de génération :

- **un lien de PAGE** (`app.powerbi.com/links/…`, ou l'adresse copiée depuis la barre
  du navigateur) affiche **tout le rapport** ;
- **un visuel plus de dix fois plus large que haut** a un format inhabituel pour un
  graphique : la page le signale pour que vous l'ouvriez et confirmiez, elle ne tranche pas
  à votre place.

Chaque ligne annonce donc ce que son lien désigne — `⚡ visuel 1253×528 px`,
`⚠ page entière`, `⚠ format allongé` — et un bilan récapitule avant de générer. Le cadre du
complément épouse le format réel du visuel : un graphique large et bas reste large et
bas, il n'est ni étiré ni noyé. La barre d'outils du visuel est masquée
(`isVisualContainerHeaderHidden`) : il ne reste que le graphique.

**`verificateur-liens.html`** est la page qui tranche pour de bon : elle liste chaque lien
avec ce qu'il désigne, un bouton qui l'ouvre dans Power BI avec votre session, et deux
boutons « Le bon » / « Pas le bon ». Pour les liens à reprendre, un champ recueille le lien
corrigé ; l'export CSV vous rend la liste complète à reporter dans l'annuaire. Les réponses
restent dans votre navigateur, rien n'est envoyé.

Pour auditer tout l'annuaire d'un coup, sans ouvrir les liens :

```bash
node outils/verifier-liens.js sauvegarde.json
```

La sauvegarde s'exporte depuis **Synchronisation → Exporter la sauvegarde**. L'outil
liste chaque lien, son verdict et son format, et signale les visuels utilisés par
plusieurs KPI — signe d'un copier-coller resté en place.

**`testeur-powerpoint.html`** est le banc d'essai de la fabrication : collez des liens (ou
chargez une sauvegarde de l'annuaire), choisissez le contenu des visuels, générez — et la
page relit aussitôt le fichier qu'elle vient de produire pour dire, diapositive par
diapositive, quel visuel elle vise, de quelle page, dans quel format et avec quel cadre.
Le modèle IDEA y est embarqué : double-clic, hors ligne, rien n'est envoyé.

Et pour contrôler un support déjà produit, sans ouvrir PowerPoint :

```bash
node outils/verifier-deck.js deck.pptx
```

Il affiche, diapositive par diapositive, le visuel visé, sa page, son rapport, son
format et le cadre obtenu — puis conclut « Aucune anomalie » ou liste ce qui cloche.

Pour reprendre un lien fautif : dans Power BI, sur **le visuel**, `…` → **Partager** →
**Lien vers cet élément visuel**, puis collez-le dans la fiche du KPI.

#### 2. Image — capture automatique ou collée

Pour un support qui doit rester lisible **hors de l'entreprise** (ou par quelqu'un sans
accès Power BI), il faut de vraies images.

Collage direct : copiez la capture d'un visuel, **Ctrl+V** dans la fenêtre de génération.

Capture automatique de toute la sélection — un outil ouvre chaque lien dans **votre**
navigateur, avec **votre** session Power BI, attend le rendu et enregistre l'image :

```bash
npm i -D playwright && npx playwright install chromium

# Une seule fois : se connecter à Power BI (la session est conservée)
node outils/capturer-visuels.js selection.json --connexion

# Ensuite, chaque semaine :
node outils/capturer-visuels.js selection.json --deck
```

`selection.json` s'obtient dans la fenêtre de génération, bouton
**« ⬇ Exporter la sélection »**. Les images produites peuvent aussi être reprises sans
quitter l'annuaire : **« 🖼 Charger les captures »**.

Options utiles : `--visible` pour voir le navigateur travailler, `--attente 6000` si vos
rapports sont lents, `--selecteur "<css>"` si l'interface Power BI change.

En ligne de commande, `node outils/generer-deck.js selection.json --vivant` produit le
support en visuels vivants, sans aucune capture.

#### 3. Cadre cliquable seul

Le cadre porte le titre et ouvre le rapport d'un clic. Utile pour préparer la trame d'un
rituel avant d'avoir les données.

## Ce qui a été ajouté au dépôt

| Fichier | Rôle |
|---|---|
| `js/zip.js` | lecture / écriture d'archives ZIP (un .pptx en est une) |
| `js/pptx.js` | fabrique du support : diapositives, liens, images, sommaire |
| `js/selection.js` | modèle des sélections : ordre, périmètres, fusion multi-postes |
| `modele-deck.pptx` | charte IDEA (masque, thème, couverture) — **doit être déployé** |
| `outils/capturer-visuels.js` | capture automatique des visuels Power BI |
| `outils/generer-deck.js` | support PowerPoint depuis une sélection + des captures |
| `outils/verifier-liens.js` | audit des liens : visuel, page ou bandeau |
| `outils/verifier-deck.js` | contrôle d'un support produit, diapositive par diapositive |
| `verificateur-liens.html` | page d'inspection : ouvrir chaque lien et trancher |
| `testeur-powerpoint.html` | banc d'essai : générer puis relire le support, hors ligne |
| `js/inspecter-deck.js` | lecture d'un .pptx produit (partagée page web / ligne de commande) |
| `outils/construire-annuaire-test.js` | fabrique `annuaire-test.html`, la copie d'essai étanche |
| `smoke-essai.js` | contrôle d'étanchéité de la copie d'essai |
| `zip.test.js`, `pptx.test.js`, `selection.test.js`, `deck.test.js`, `outils.test.js` | 226 tests |
| `smoke-ui.js` | contrôle de bout en bout dans un vrai navigateur |

`app.js`, `index.html`, `style.css`, `service-worker.js` et le banc de test ont été
complétés ; aucun comportement existant n'a été modifié.

### Le modèle `modele-deck.pptx`

Il contient le masque, le thème, les six dispositions et la diapositive de couverture,
dont trois jetons sont substitués à la génération : `{{TITRE}}`, `{{SOUS_TITRE}}`,
`{{PERIODE}}`. Pour changer la charte, ouvrez-le dans PowerPoint, modifiez le masque
ou la couverture, enregistrez — **en conservant les trois jetons**.

## Essayer sans toucher à l'annuaire réel

`annuaire-test.html` est la **même application** qu'`index.html` — mêmes scripts, même
modèle, mêmes fonctionnalités — mais étanche à la production sur trois points :

| | |
|---|---|
| **Stockage** | préfixé (`essai:`). Les deux pages partagent l'origine, donc le localStorage : sans ce cloisonnement, la copie lirait et écrirait les vraies fiches. |
| **Synchronisation** | code dédié `idea-kpi-essai` — le document de l'équipe n'est jamais touché. |
| **Service worker** | non enregistré : pas de cache qui se mélange entre les deux pages. |

Déposez-la **à côté d'`index.html`** : elle réutilise `js/`, `style.css`,
`modele-deck.pptx` et les images du dépôt, elle ne pèse donc que 40 Ko et ne peut pas
diverger de l'application réelle. Une bannière la signale en permanence, avec un lien de
retour vers l'annuaire réel et un bouton « Repartir de zéro » qui n'efface que les données
d'essai.

```bash
npm run build:essai                       # régénère annuaire-test.html depuis index.html
node outils/construire-annuaire-test.js --code mon-essai --prefixe bac:
npm run smoke:essai                       # prouve l'étanchéité dans un vrai navigateur
```

Régénérez-la après toute évolution d'`index.html` — c'est une commande, pas un fichier à
maintenir à la main.

## Tests

```bash
node --test              # 675 tests (dont 226 pour cette fonctionnalité)
npm run test:deck        # les seuls tests de la chaîne PowerPoint
npm run test:outils      # les outils en ligne de commande
node build-tests-html.js # régénère tests.html (banc de test navigateur)
node verify-tests-html.js
npm run smoke            # parcours réel dans Chromium (npx playwright install chromium)
npm run lint
```

## Points restés ouverts

- **La colonne Rituel n'est renseignée que sur 3 lignes sur 40.** Sélectionner par
  rituel suppose de la remplir, et de figer un vocabulaire : aujourd'hui le champ est
  libre, une faute de frappe crée un rituel fantôme.
- **Un KPI peut-il appartenir à plusieurs rituels ?** Si oui, `ritual` doit devenir une
  liste — cela touche l'import Excel, le filtre et l'export.
- **Un même KPI sur plusieurs périmètres dans un même rituel** produit aujourd'hui une
  seule diapositive (un périmètre par ligne de sélection).
