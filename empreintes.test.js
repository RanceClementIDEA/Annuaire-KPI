/* Tests des empreintes de visuels (js/empreintes.js) : ce que le
   complément Power BI doit retrouver dans le fichier pour afficher
   le graphique au lieu de « l'objet visuel n'existe plus ».

   Le comportement décrit ici a été vérifié en conditions réelles sur
   un fichier ouvert dans PowerPoint :
     • adresse seule                      → échoue
     • carte d'identité sans état         → échoue
     • carte d'identité + état sérialisé  → affiche le graphique
     • idem sans les champs de session    → affiche le graphique
   Exécution : node --test  */
const { test } = require("node:test");
const assert = require("node:assert");
const E = require("./js/empreintes.js");

const LIEN = "https://app.powerbi.com/groups/me/reports/"
  + "6a4cf353-aac8-48de-a793-9a8066069ffc/faec2927b8728b9fd32f"
  + "?ctid=c8d76d42-5d9d-4eea-b5cb-d16d0a04a59e&pbi_source=shareVisual"
  + "&visual=14bddbd2925c24715a84&height=550.75&width=1254.63"
  + "&bookmarkGuid=702af139-c1c2-4dca-b44b-2ff37794a5df";

const CLE_VISUEL = "6a4cf353-aac8-48de-a793-9a8066069ffc/faec2927b8728b9fd32f/14bddbd2925c24715a84";

/* Un relevé tel qu'il sort d'un complément : valeurs encodées pour XML,
   guillemets compris — c'est ainsi que Power BI les écrit. */
const RELEVE = {
  reportUrl: "&quot;/groups/me/reports/6a4cf353-aac8-48de-a793-9a8066069ffc/"
    + "faec2927b8728b9fd32f?ctid=c8d76d42-5d9d-4eea-b5cb-d16d0a04a59e"
    + "&amp;pbi_source=shareVisual&amp;visual=14bddbd2925c24715a84&quot;",
  embedUrl: "&quot;/reportEmbed?reportId=6a4cf353-aac8-48de-a793-9a8066069ffc&quot;",
  artifactName: "&quot;Histo empilé&quot;",
  reportName: "&quot;Pilotage d'exploitation logistique&quot;",
  pageName: "&quot;faec2927b8728b9fd32f&quot;",
  pageDisplayName: "&quot;✨Mix&quot;",
  datasetId: "&quot;55e74324-9265-4887-aa38-37a14b32a847&quot;",
  bookmark: "&quot;H4sIAAAAAAAAA-etat-serialise&quot;",
  initialStateBookmark: "&quot;H4sIAAAAAAAAA-etat-serialise&quot;",
  backgroundColor: "&quot;#FFF&quot;",
  reportState: "&quot;CONNECTED&quot;",
  creatorSessionId: "&quot;dd4155af&quot;",
  creatorUserId: "&quot;1003200592A84FCB&quot;",
  creatorTenantId: "&quot;c8d76d42&quot;",
  reportEmbeddedTime: "&quot;2026-08-24T11:23:44.821Z&quot;",
  numberOfAnnotations: "0",
  annotationNoteShown: "true"
};

/* ─── cleVisuel ────────────────────────────────────────────── */

test("la clé d'un visuel réunit le rapport, la page et le visuel", () => {
  assert.strictEqual(E.cleVisuel(LIEN), CLE_VISUEL);
});

test("la clé ignore la taille et le signet, qui changent d'un partage à l'autre", () => {
  const autre = LIEN.replace("height=550.75&width=1254.63", "height=300&width=800")
    .replace(/bookmarkGuid=[^&]*/, "bookmarkGuid=00000000-0000-0000-0000-000000000000");
  assert.strictEqual(E.cleVisuel(autre), E.cleVisuel(LIEN));
});

test("un lien de page, sans visual, n'a pas de clé : il n'y a pas de visuel à retrouver", () => {
  assert.strictEqual(E.cleVisuel(LIEN.replace(/&visual=[^&]*/, "")), "");
});

test("un lien vide ou absurde ne fait pas tomber la fonction", () => {
  ["", null, undefined, "bonjour", "https://exemple.fr"].forEach(v => {
    assert.strictEqual(E.cleVisuel(v), "");
  });
});

/* ─── creerEmpreinte ───────────────────────────────────────── */

test("une empreinte se déduit d'un relevé de complément", () => {
  const emp = E.creerEmpreinte(RELEVE, { horodatage: 1000, auteur: "clement" });
  assert.strictEqual(emp.id, CLE_VISUEL);
  assert.strictEqual(emp.libelle, "Histo empilé");
  assert.strictEqual(emp._mtime, 1000);
  assert.strictEqual(emp._by, "clement");
});

test("les champs propres à la session d'insertion ne sont jamais relevés", () => {
  const emp = E.creerEmpreinte(RELEVE, {});
  E.CHAMPS_DE_SESSION.forEach(n => {
    assert.ok(!(n in emp.proprietes), n + " ne doit pas être relevé");
  });
});

test("l'état sérialisé n'est stocké qu'une fois : les deux copies sont identiques", () => {
  const emp = E.creerEmpreinte(RELEVE, {});
  assert.ok(emp.proprietes.bookmark, "l'état doit être conservé");
  assert.ok(!("initialStateBookmark" in emp.proprietes), "la copie ne doit pas être stockée");
});

test("une diapositive FABRIQUÉE ne produit pas d'empreinte : elle n'a rien appris", () => {
  const fabriquee = {
    reportUrl: RELEVE.reportUrl, embedUrl: RELEVE.embedUrl,
    reportState: RELEVE.reportState, backgroundColor: RELEVE.backgroundColor
  };
  assert.strictEqual(E.creerEmpreinte(fabriquee, {}), null);
});

test("un relevé sans adresse exploitable ne produit pas d'empreinte", () => {
  assert.strictEqual(E.creerEmpreinte({ artifactName: "&quot;X&quot;" }, {}), null);
  assert.strictEqual(E.creerEmpreinte(null, {}), null);
});

/* ─── proprietesPour ───────────────────────────────────────── */

test("la copie de l'état est reconstituée au moment de fabriquer le fichier", () => {
  const props = E.proprietesPour(E.creerEmpreinte(RELEVE, {}));
  assert.strictEqual(props.initialStateBookmark, props.bookmark);
});

test("les valeurs sont rendues telles qu'elles ont été relevées, sans ré-encodage", () => {
  const props = E.proprietesPour(E.creerEmpreinte(RELEVE, {}));
  assert.strictEqual(props.artifactName, RELEVE.artifactName);
  assert.strictEqual(props.pageDisplayName, RELEVE.pageDisplayName);
});

test("une empreinte vide ne rend aucune propriété", () => {
  assert.strictEqual(E.proprietesPour(null), null);
  assert.strictEqual(E.proprietesPour({ proprietes: {} }), null);
});

/* ─── empreinteComplete ────────────────────────────────────── */

test("une empreinte sans état sérialisé est incomplète — vérifié : elle ne suffit pas", () => {
  const emp = E.creerEmpreinte(RELEVE, {});
  assert.ok(E.empreinteComplete(emp));
  delete emp.proprietes.bookmark;
  assert.ok(!E.empreinteComplete(emp),
    "la carte d'identité seule laisse le complément afficher « l'objet visuel n'existe plus »");
});

/* ─── trouver ──────────────────────────────────────────────── */

test("on retrouve l'empreinte d'un lien, quelle que soit sa taille demandée", () => {
  const emp = E.creerEmpreinte(RELEVE, {});
  const autre = LIEN.replace("height=550.75&width=1254.63", "height=200&width=400");
  assert.strictEqual(E.trouver([emp], autre).id, CLE_VISUEL);
});

test("un lien sans empreinte connue rend null, sans erreur", () => {
  const emp = E.creerEmpreinte(RELEVE, {});
  const inconnu = LIEN.replace("14bddbd2925c24715a84", "ffffffffffffffffffff");
  assert.strictEqual(E.trouver([emp], inconnu), null);
  assert.strictEqual(E.trouver([], LIEN), null);
  assert.strictEqual(E.trouver(null, LIEN), null);
});

test("les empreintes se cherchent aussi dans un dictionnaire", () => {
  const emp = E.creerEmpreinte(RELEVE, {});
  assert.strictEqual(E.trouver({ [CLE_VISUEL]: emp }, LIEN).id, CLE_VISUEL);
});

/* ─── fusionnerEmpreintes ──────────────────────────────────── */

test("la fusion garde la version la plus récente, comme pour les fiches", () => {
  const ancienne = E.normaliserEmpreinte({ id: CLE_VISUEL, libelle: "ancien",
    proprietes: { artifactName: "a", bookmark: "b" }, _mtime: 100 });
  const recente = E.normaliserEmpreinte({ id: CLE_VISUEL, libelle: "récent",
    proprietes: { artifactName: "z", bookmark: "b" }, _mtime: 900 });
  assert.strictEqual(E.fusionnerEmpreintes([ancienne], [recente])[0].libelle, "récent");
  assert.strictEqual(E.fusionnerEmpreintes([recente], [ancienne])[0].libelle, "récent");
});

test("la fusion réunit les empreintes des deux côtés", () => {
  const a = E.normaliserEmpreinte({ id: "r/p/a", proprietes: { artifactName: "A" }, _mtime: 1 });
  const b = E.normaliserEmpreinte({ id: "r/p/b", proprietes: { artifactName: "B" }, _mtime: 1 });
  assert.strictEqual(E.fusionnerEmpreintes([a], [b]).length, 2);
});

test("une empreinte sans identifiant est écartée de la fusion", () => {
  const bonne = E.normaliserEmpreinte({ id: CLE_VISUEL, proprietes: { artifactName: "A" }, _mtime: 1 });
  assert.strictEqual(E.fusionnerEmpreintes([bonne, { libelle: "orphelin" }], []).length, 1);
});

test("la fusion accepte l'absence de données des deux côtés", () => {
  assert.deepStrictEqual(E.fusionnerEmpreintes(null, undefined), []);
});

/* ─── poids ────────────────────────────────────────────────── */

test("le poids du lot est mesurable : le document partagé est plafonné", () => {
  const emp = E.creerEmpreinte(RELEVE, {});
  assert.ok(E.poids([emp]) > 0);
  assert.ok(E.poids([emp, emp]) > E.poids([emp]));
  assert.strictEqual(E.poids([]), 0);
  assert.strictEqual(E.poids(null), 0);
});

/* ─── normaliserEmpreinte ──────────────────────────────────── */

test("la normalisation comble les champs manquants sans inventer de contenu", () => {
  const emp = E.normaliserEmpreinte({});
  assert.deepStrictEqual(emp.proprietes, {});
  assert.strictEqual(emp.libelle, "");
  assert.strictEqual(emp._by, "?");
});

test("la normalisation écarte tout champ hors de la liste relevée", () => {
  const emp = E.normaliserEmpreinte({ id: CLE_VISUEL,
    proprietes: { artifactName: "A", creatorUserId: "X", nimporteQuoi: "Y" } });
  assert.deepStrictEqual(Object.keys(emp.proprietes), ["artifactName"]);
});
