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

#### L'adresse donnée au complément : verbatim, et rien d'autre

Le complément ne tolère aucun ajout dans `reportUrl`. Relevé sur une insertion faite à la
main dans PowerPoint — la seule qui affiche réellement le visuel — il conserve le lien de
partage **exactement** tel qu'il est collé, seulement privé de son hôte :

```
/groups/me/reports/{rapport}/{page}?ctid=…&pbi_source=shareVisual
&visual=…&height=…&width=…&bookmarkGuid=…
```

Y glisser `bookmarkUsage=1` et `fromEntryPoint=export` — qui appartiennent au format
d'export d'une PAGE — le fait échouer à résoudre le visuel **et** la page : il retombe
alors sur la première page du rapport.

#### L'adresse ne suffit pas : il faut l'EMPREINTE du visuel

Voici le point qui a longtemps bloqué, et il est contre-intuitif.

Un support généré dont le `reportUrl` est **octet pour octet identique** à celui d'une
insertion faite à la main affiche quand même :

> Impossible de charger votre objet visuel — l'objet visuel ajouté ici n'existe plus.

Parce que **le complément ne relit pas l'adresse à l'ouverture**. Il la résout une seule
fois, à l'insertion, puis mémorise le résultat dans le fichier et se contente ensuite de
le restaurer. Un fichier fabriqué de toutes pièces n'a rien à restaurer.

Ce qu'il mémorise, et qu'il faut donc lui rendre — l'**empreinte** du visuel :

| Propriété | |
|---|---|
| `artifactName` | le nom de l'objet visuel (« Histo empilé ») |
| `reportName`, `pageName`, `pageDisplayName` | la page où il vit |
| `datasetId` | le jeu de données |
| `bookmark`, `initialStateBookmark` | l'état sérialisé de la page — filtres et segments, ~5 Ko |
| `embedUrl`, `backgroundColor` | relevés aussi : l'adresse d'incorporation porte l'indicatif du locataire |

Vérifié en conditions réelles, une diapositive à la fois, dans PowerPoint :

| Ce que porte la diapositive | Résultat |
|---|---|
| l'adresse seule | ❌ « l'objet visuel n'existe plus » |
| + `artifactName` | ❌ |
| + page et jeu de données | ❌ |
| **+ l'état sérialisé** | ✅ **le graphique s'affiche** |
| tout, y compris les champs de session | ✅ |
| l'état réel **sans** `artifactName` | ✅ |
| un état **fabriqué**, vide ou portant le visuel visé | ❌ |

Quatre conclusions pratiques :

- **l'état sérialisé n'est pas facultatif.** On ne peut pas alléger une empreinte pour
  gagner de la place : elle deviendrait muette ;
- **il ne peut pas non plus être fabriqué.** Un état construit de toutes pièces, même
  contenant la description du visuel visé, est rejeté : le complément le valide auprès
  du service. Générer une empreinte à partir du seul lien est donc impossible ;
- **`artifactName` n'est qu'une étiquette.** L'état réel privé de ce nom affiche le
  graphique. Il sert au relevé — c'est la marque d'une insertion faite à la main — pas
  à l'affichage ;
- **les champs de session ne servent à rien** (`creatorSessionId`, `creatorUserId`,
  `creatorTenantId`, `reportEmbeddedTime`, annotations). Ils ne sont donc pas relevés :
  un fichier neuf n'a pas à porter les traces de la session de quelqu'un d'autre.

#### Le signet : ce qui distingue deux KPI d'un même visuel

Attention — c'est le piège le plus coûteux, et il a fallu un support réel pour le voir.

Plusieurs KPI peuvent pointer vers **le même visuel Power BI**. Sur cet annuaire, trois
« Volumétrie » partagent `14bddbd2…` et quatre « Taux de service » partagent `2d4bfd20…`.
Ce qui les distingue n'est pas `visual=`, c'est **`bookmarkGuid=`** : le signet, donc les
filtres et les segments.

Or l'état mémorisé **écrase le signet du lien**. Une empreinte relevée sur un signet et
appliquée à un autre affiche donc le bon graphique **avec les chiffres d'un autre KPI** —
et rien n'a l'air cassé.

L'empreinte mémorise donc le signet dont son état provient, et la fenêtre de génération
prévient : `⚠ autre vue`. L'état reste posé — sans lui le complément ne résout rien —
mais on ne prétend plus que la diapositive est juste.

#### Relever une empreinte

C'est l'unique geste manuel, et il n'est à faire **qu'une fois par KPI** :

**Une empreinte par KPI**, c'est-à-dire par lien de l'annuaire. Le bouton
**📋 Préparer le relevé** fabrique le support qui rend ce travail court : une
diapositive par KPI encore dépourvu d'empreinte, portant son nom et **son lien en
clair**.

1. cliquer sur *Sélection & PowerPoint › Générer › **📋 Préparer le relevé*** ;
2. pour chaque diapositive : sélectionner le lien affiché, *Insertion › Compléments ›
   Power BI*, le coller, vérifier que le graphique s'affiche ;
3. enregistrer le fichier ;
4. *Générer › **🔎 Relever les empreintes*** et le choisir.

⚠️ **Toujours coller le lien de l'annuaire.** Repartager le visuel depuis Power BI crée
un **nouveau** `bookmarkGuid` : l'empreinte obtenue ne correspondrait à aucun KPI. C'est
l'erreur la plus facile à commettre, et la plus difficile à voir.

Une fois relevées, les empreintes partent dans la synchronisation : personne d'autre n'a
à refaire l'insertion.

Le même bouton accepte aussi un **relevé `.json`** déjà constitué — celui que produit
`outils/relever-empreintes.js --sortie`, ou le contenu du document partagé. C'est le
moyen de transmettre un relevé sans refaire l'insertion : d'un annuaire à l'autre, ou
quand quelqu'un a déjà fait le travail.

L'empreinte part alors dans la synchronisation : **toute l'équipe en profite**, personne
n'a à refaire l'insertion. La fenêtre de génération affiche, pour chaque diapositive,
`⚡ visuel` (empreinte connue) ou `à relever`.

En ligne de commande, pour traiter un lot de fichiers d'un coup :

```bash
node outils/relever-empreintes.js support1.pptx support2.pptx --sortie empreintes.json
```

#### Où vivent les empreintes

Dans un **document de synchronisation séparé** — `kpi_sync/{code}__empreintes` — et non
dans le document principal. L'état sérialisé pèse ~5 Ko par visuel, alors que Firestore
plafonne un document à 1 Mo : les mêler ferait courir le risque de ne plus pouvoir
enregistrer l'annuaire du tout. Le document principal n'a pas changé de taille.

#### Le signet, ou pourquoi le bon visuel peut montrer les mauvaises données

Dans cet annuaire, plusieurs KPI partagent le même visuel Power BI : ce qui les distingue
est le **signet** (`bookmarkGuid`), qui applique le filtre — périmètre, temporalité. Le
même graphique devient « Volumétrie Distribution Logistiport hebdomadaire » ou
« … MG Armement mensuelle » selon le signet appliqué.

Le signet voyage dans l'adresse, dans le `bookmarkGuid` du lien de partage — et il suffit
de transmettre ce lien intact. C'est le complément qui l'applique et sérialise l'état à la
première ouverture.

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

#### La page entière plutôt que le visuel seul

Un lien de VISUEL exige une empreinte, et cette empreinte est propre à son signet : une
insertion manuelle par KPI. Désigner la **PAGE** change la donne — il n'y a plus d'objet
à retrouver, donc peut-être plus rien à mémoriser — et apporte en prime ce que le visuel
seul ne montre pas : les sélecteurs de mois et de semaines, l'année, les filtres.

`outils/diagnostic-page-entiere.js` fabrique le support qui tranche : quatre formes
d'adresse de page, **aucune empreinte nulle part**, plus un témoin.

```bash
node outils/diagnostic-page-entiere.js --lien "<url d'un KPI>"
```

| | |
|---|---|
| **A** | la page, avec le signet du KPI — la sélection de ce KPI, sélecteurs compris |
| **B** | la page, sans signet — l'état par défaut |
| **C** | la page, sans `pbi_source=shareVisual` — une adresse de rapport ordinaire |
| **D** | l'adresse nue : rapport, page, signet |
| **E** | témoin : le visuel seul sans empreinte, connu pour échouer |

**Résultat : aucune ne s'affiche.** Le complément exige une empreinte quelle que soit la
forme de l'adresse — visuel ou page. C'est donc établi une fois pour toutes : **le visuel
vivant ne peut pas être automatisé**. Il reste deux chemins, et deux seulement.

| | empreinte | données | travail manuel |
|---|---|---|---|
| **Visuel vivant** | une par KPI | se rafraîchissent chez le lecteur | une insertion par KPI, une fois |
| **Image, page entière** | aucune | figées à la génération | aucun |

Le second est le seul qui tienne la promesse « rien à faire ».

#### 2. Image — capture automatique de la PAGE (aucune empreinte)

**C'est le seul mode sans travail manuel**, et celui qui reproduit exactement ce qu'on
voit dans Power BI : titre, sélecteurs de mois et de semaines, année, filtres, puis le
graphique. Trois commandes, dont deux une seule fois dans la vie :

```bash
npm run installer:navigateur                      # une fois, jamais plus
npm run connexion -- selection.json               # une fois : se connecter à Power BI
npm run powerpoint -- selection.json              # chaque semaine
```

`selection.json` s'obtient dans l'annuaire par *Sélection & PowerPoint › Générer ›
**⬇ Exporter la sélection***. La session Power BI est conservée d'une fois sur l'autre.

`--page` vise le canevas du rapport plutôt que le conteneur du graphique. La priorité
compte : sans elle le conteneur du visuel serait trouvé le premier, et on capturerait le
graphique seul.



Pour un support qui doit rester lisible **hors de l'entreprise** (ou par quelqu'un sans
accès Power BI), il faut de vraies images.

Collage direct : copiez la capture d'un visuel, **Ctrl+V** dans la fenêtre de génération.

Capture automatique de toute la sélection — un outil ouvre chaque lien dans **votre**
navigateur, avec **votre** session Power BI, attend le rendu et enregistre l'image :

```bash
npm i -D playwright && npx playwright install chromium

# --page capture la PAGE entière : sélecteurs de dates et filtres compris,
# et surtout : aucune empreinte n'est nécessaire dans ce mode.

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
| `js/empreintes.js` | mémoire du complément par visuel : relevé, fusion, application |
| `outils/relever-empreintes.js` | relève les empreintes d'un ou plusieurs PowerPoint |
| `modele-deck.pptx` | charte IDEA (masque, thème, couverture) — **doit être déployé** |
| `outils/capturer-visuels.js` | capture automatique des visuels Power BI |
| `outils/generer-deck.js` | support PowerPoint depuis une sélection + des captures |
| `outils/verifier-liens.js` | audit des liens : visuel, page ou bandeau |
| `outils/verifier-deck.js` | contrôle d'un support produit, diapositive par diapositive |
| `verificateur-liens.html` | page d'inspection : ouvrir chaque lien et trancher |
| `testeur-powerpoint.html` | banc d'essai : générer puis relire le support, hors ligne |
| `js/inspecter-deck.js` | lecture d'un .pptx produit (partagée page web / ligne de commande) |
| `outils/construire-annuaire-test.js` | fabrique `annuaire-test.html`, la copie d'essai étanche |
| `outils/diagnostic-complement.js` | support à cinq variantes pour isoler ce que lit le complément |
| `outils/diagnostic-etat.js` | l'état peut-il être fabriqué ? partagé entre visuels d'une page ? |
| `outils/verifier-rendu.js` | ce que le complément a RÉELLEMENT affiché, relu sur un support rouvert |
| `outils/diagnostic-signet.js` | le signet du lien peut-il l'emporter sur l'état mémorisé ? |
| `outils/diagnostic-page-entiere.js` | la page entière s'affiche-t-elle sans empreinte ? |
| `smoke-essai.js` | contrôle d'étanchéité de la copie d'essai |
| `zip.test.js`, `pptx.test.js`, `selection.test.js`, `empreintes.test.js`, `deck.test.js`, `outils.test.js` | 358 tests |
| `smoke-ui.js` | contrôle de bout en bout dans un vrai navigateur |

`app.js`, `index.html`, `style.css`, `service-worker.js` et le banc de test ont été
complétés ; aucun comportement existant n'a été modifié.

### Le modèle `modele-deck.pptx`

Il contient le masque, le thème, les six dispositions et la diapositive de couverture,
dont trois jetons sont substitués à la génération : `{{TITRE}}`, `{{SOUS_TITRE}}`,
`{{PERIODE}}`. Pour changer la charte, ouvrez-le dans PowerPoint, modifiez le masque
ou la couverture, enregistrez — **en conservant les trois jetons**.

## Quand le visuel affiché n'est pas celui attendu

Premier réflexe, avant toute hypothèse : **ouvrir le support, le réenregistrer, et le
relire**. À l'ouverture, le complément réécrit dans le fichier ce qu'il a résolu — le nom
du visuel, la page, l'horodatage. On sait donc sans rien deviner ce que chaque
diapositive a montré :

```bash
node outils/verifier-rendu.js support-ouvert.pptx
```

Il signale les trois façons dont un support peut mentir :

| | |
|---|---|
| *le complément n'a pas ouvert cette diapositive* | le fichier a été renvoyé sans être affiché : le relevé ne veut rien dire |
| *l'état appliqué est celui d'une autre page* | le support montrera la mauvaise page |
| *l'état ne décrit pas ce visuel* | le bon graphique s'affiche, **avec les filtres d'un voisin** — les chiffres peuvent être faux sans que rien n'ait l'air cassé |



Le complément est une boîte noire : on ne peut pas savoir de l'extérieur comment il
interprète l'adresse qu'on lui donne. `outils/diagnostic-complement.js` fabrique donc un
support où **chaque diapositive teste une hypothèse**, à ouvrir une fois dans PowerPoint :

| | |
|---|---|
| **A** | l'état actuel du générateur — visuel désigné, signet marqué comme à appliquer |
| **B** | sans `visual=` : la page entière, même signet |
| **C** | A, plus l'état sérialisé copié d'un fichier produit par Power BI |
| **D** | témoin — le complément de référence, intact |
| **E** | témoin — le visuel sans aucun signet, donc son état par défaut |

```bash
node outils/diagnostic-complement.js --lien "<url du KPI>" \
     --reference MicrosoftPowerBIStorytelling.pptx
```

Lecture : **A identique à E** → le signet n'est pas appliqué. **A identique à B** → le
paramètre `visual=` est ignoré. **C correct** → il faut embarquer l'état sérialisé.
**D incorrect** → le fichier de référence ne porte pas sur le bon visuel.

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
node --test              # 797 tests (dont 358 pour cette fonctionnalité)
npm run test:deck        # les seuls tests de la chaîne PowerPoint
npm run test:outils      # les outils en ligne de commande
node build-tests-html.js # régénère tests.html (banc de test navigateur)
node verify-tests-html.js
npm run smoke            # parcours réel dans Chromium (npx playwright install chromium)
npm run lint
```

## Points restés ouverts

- **Une empreinte est à relever pour chaque KPI**, c'est-à-dire pour chaque lien. C'est un
  geste unique par KPI, mais il reste manuel : le complément valide l'état auprès du
  service, et n'expose aucun moyen de produire cette mémoire sans une insertion réelle
  dans PowerPoint. Ni l'API REST de Power BI ni le SDK JavaScript ne donnent l'état d'un
  lien de partage.
- **Une empreinte survit-elle à une refonte du rapport ?** Si un visuel est recréé, son
  identifiant change et l'empreinte devient orpheline : la ligne repassera à
  « à relever », ce qui est le bon signal, mais l'ancienne empreinte reste stockée.

- **La colonne Rituel n'est renseignée que sur 3 lignes sur 40.** Sélectionner par
  rituel suppose de la remplir, et de figer un vocabulaire : aujourd'hui le champ est
  libre, une faute de frappe crée un rituel fantôme.
- **Un KPI peut-il appartenir à plusieurs rituels ?** Si oui, `ritual` doit devenir une
  liste — cela touche l'import Excel, le filtre et l'export.
- **Un même KPI sur plusieurs périmètres dans un même rituel** produit aujourd'hui une
  seule diapositive (un périmètre par ligne de sélection).
