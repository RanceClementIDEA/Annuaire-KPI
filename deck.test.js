/* Flux complet « sélection de rituel → PowerPoint », sur les fonctions
   RÉELLES d'app.js chargées dans le harnais.
   Exécution : node --test  */
const { test } = require("node:test");
const assert = require("node:assert");
const { loadApp } = require("./app-harness.js");

const A = loadApp();

/* Jeu de fiches proche du support « Indicateurs Magasins Armement » */
const FICHES_DECK = [
  { id: "kpi_volumetrie_hebdomadaire", manual: true, title: "Volumétrie Logistiport", freq: "Hebdomadaire",
    ritual: "COPIL", process: "Distribution", _mtime: 100, _by: "marie",
    logistiport: "https://app.powerbi.com/groups/me/reports/r1/p1?visual=v1&a=1" },
  { id: "kpi_volumetrie_quotidienne", manual: true, title: "Volumétrie Logistiport", freq: "Quotidienne",
    ritual: "Point quotidien", process: "Distribution", _mtime: 100, _by: "marie",
    logistiport: "https://app.powerbi.com/groups/me/reports/r1/p1?visual=v2" },
  { id: "kpi_taux_service_hebdomadaire", manual: true, title: "Taux de service réception", freq: "Hebdomadaire",
    ritual: "COPIL", process: "Réception", _mtime: 100, _by: "marie",
    logistiport: "https://app.powerbi.com/groups/me/reports/r1/p2?visual=v3" },
  { id: "kpi_anticipation_mensuelle", manual: true, title: "Anticipation des demandes", freq: "Mensuelle",
    ritual: "Revue mensuelle", process: "Distribution", _mtime: 100, _by: "marie" }
];

/** Prépare l'application avec les fiches ci-dessus et un modèle simulé. */
function preparerDeck(opts) {
  A.reset(Object.assign({ manualEntries: FICHES_DECK.map(f => ({ ...f })) }, opts || {}));
  // Comme sur une page fraîchement ouverte : le mode revient à sa valeur par défaut
  A.saisir("deckModeSelect", "vivant");
  A.run(`
    presets = []; selectionIds = []; selectionMode = false; presetCourant = "";
    empreintes = []; capturesDeck = {}; commentairesVolatils = {};
    rebuildData(false);
    // Modèle PowerPoint minimal : la fabrique complète est éprouvée par pptx.test.js
    modeleDeckCache = ZipMini.ecrireZip([
      { nom: "[Content_Types].xml", donnees: "<?xml version=\\"1.0\\"?><Types></Types>" },
      { nom: "ppt/presentation.xml", donnees: "<p:presentation><p:sldIdLst></p:sldIdLst></p:presentation>" },
      { nom: "ppt/_rels/presentation.xml.rels", donnees: "<Relationships></Relationships>" }
    ]);
  `);
}

/* ═══ Mode sélection ═══ */

test("sélection : le mode se déclenche et affiche sa barre d'action", () => {
  preparerDeck();
  assert.equal(A.run("basculerModeSelection(true)"), true);
  assert.ok(!A.el("selectionBar")._classes.has("hidden"), "la barre doit être visible");
});

test("sélection : quitter le mode masque la barre sans vider la sélection", () => {
  preparerDeck();
  A.run("basculerModeSelection(true)");
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  A.run("basculerModeSelection(false)");
  assert.ok(A.el("selectionBar")._classes.has("hidden"));
  assert.deepEqual(A.get("selectionIds"), ["kpi_volumetrie_hebdomadaire"]);
});

test("sélection : cocher puis décocher revient à zéro", () => {
  preparerDeck();
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  assert.equal(A.get("selectionIds").length, 1);
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  assert.equal(A.get("selectionIds").length, 0);
});

test("sélection : l'ordre de cochage est l'ordre du jour, donc l'ordre des diapositives", () => {
  preparerDeck();
  A.basculerSelection("kpi_taux_service_hebdomadaire");
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  assert.deepEqual(A.get("selectionIds"),
    ["kpi_taux_service_hebdomadaire", "kpi_volumetrie_hebdomadaire"]);
});

test("sélection : la sélection porte sur la temporalité, pas sur l'intitulé", () => {
  preparerDeck();
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  A.basculerSelection("kpi_volumetrie_quotidienne");
  assert.equal(A.get("selectionIds").length, 2, "deux temporalités du même KPI restent distinctes");
});

test("sélection : le compteur affiché suit la sélection", () => {
  preparerDeck();
  A.run("basculerModeSelection(true)");
  assert.match(A.texte("selectionCount"), /Aucun/);
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  assert.match(A.texte("selectionCount"), /1 KPI/);
  A.basculerSelection("kpi_taux_service_hebdomadaire");
  assert.match(A.texte("selectionCount"), /2 KPI/);
});

test("sélection : vider remet tout à zéro et oublie la sélection chargée", () => {
  preparerDeck();
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  A.run(`presetCourant = "preset_copil"`);
  A.viderSelection();
  assert.deepEqual(A.get("selectionIds"), []);
  assert.equal(A.get("presetCourant"), "");
});

/* ═══ « Tout cocher » suit le filtre ═══ */

test("filtre rituel : « tout cocher » ne prend que les KPI du rituel affiché", () => {
  preparerDeck();
  A.saisir("ritualFilter", "COPIL");
  A.run("filterData()");
  A.cocherResultatsFiltres();
  const ids = A.get("selectionIds");
  assert.equal(ids.length, 2, "seuls les deux KPI du COPIL sont cochés");
  assert.ok(!ids.includes("kpi_anticipation_mensuelle"));
});

test("filtre rituel : changer de rituel et re-cocher CUMULE les deux ordres du jour", () => {
  preparerDeck();
  A.saisir("ritualFilter", "COPIL");
  A.run("filterData()");
  A.cocherResultatsFiltres();
  A.saisir("ritualFilter", "Revue mensuelle");
  A.run("filterData()");
  A.cocherResultatsFiltres();
  assert.ok(A.get("selectionIds").includes("kpi_anticipation_mensuelle"));
  assert.equal(A.get("selectionIds").length, 3);
});

test("filtre rituel : re-cocher deux fois n'ajoute pas de doublon", () => {
  preparerDeck();
  A.saisir("ritualFilter", "COPIL");
  A.run("filterData()");
  A.cocherResultatsFiltres();
  const avant = A.get("selectionIds").length;
  A.cocherResultatsFiltres();
  assert.equal(A.get("selectionIds").length, avant);
});

test("recherche : « tout cocher » suit aussi la recherche plein texte", () => {
  preparerDeck();
  A.saisir("search", "taux de service");
  A.run("filterData()");
  A.cocherResultatsFiltres();
  assert.deepEqual(A.get("selectionIds"), ["kpi_taux_service_hebdomadaire"]);
});

/* ═══ Sélections enregistrées ═══ */

test("enregistrement : la sélection est nommée, conservée et persistée", () => {
  preparerDeck();
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  A.basculerSelection("kpi_taux_service_hebdomadaire");
  A.enregistrerSelection("COPIL hebdomadaire");

  const presets = A.get("presets");
  assert.equal(presets.length, 1);
  assert.equal(presets[0].name, "COPIL hebdomadaire");
  assert.deepEqual(presets[0].items.map(i => i.kpiId),
    ["kpi_volumetrie_hebdomadaire", "kpi_taux_service_hebdomadaire"]);
  assert.ok(A.stockage().kpiPresets, "la sélection doit survivre à un rechargement");
});

test("enregistrement : réutiliser le même nom met à jour au lieu de dupliquer", () => {
  preparerDeck();
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  A.enregistrerSelection("COPIL");
  A.basculerSelection("kpi_taux_service_hebdomadaire");
  A.enregistrerSelection("COPIL");
  const presets = A.get("presets");
  assert.equal(presets.length, 1, "un seul « COPIL », pas deux");
  assert.equal(presets[0].items.length, 2);
});

test("enregistrement : une sélection vide est refusée avec un message", () => {
  preparerDeck();
  assert.equal(A.enregistrerSelection("COPIL"), null);
  assert.match(A.dernierMessage(), /vide/i);
});

test("enregistrement : un nom vide est refusé", () => {
  preparerDeck();
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  assert.equal(A.enregistrerSelection("   "), null);
  assert.match(A.dernierMessage(), /nom/i);
});

test("rechargement : une sélection enregistrée se recharge à l'identique", () => {
  preparerDeck();
  A.basculerSelection("kpi_taux_service_hebdomadaire");
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  A.enregistrerSelection("COPIL");
  A.viderSelection();
  A.chargerSelection("preset_copil");
  assert.deepEqual(A.get("selectionIds"),
    ["kpi_taux_service_hebdomadaire", "kpi_volumetrie_hebdomadaire"]);
});

test("rechargement : un KPI supprimé entre-temps est écarté et signalé", () => {
  preparerDeck();
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  A.basculerSelection("kpi_taux_service_hebdomadaire");
  A.enregistrerSelection("COPIL");
  A.viderSelection();

  A.run(`manualEntries = manualEntries.filter(k => k.id !== "kpi_taux_service_hebdomadaire"); rebuildData(false);`);
  A.chargerSelection("preset_copil");

  assert.deepEqual(A.get("selectionIds"), ["kpi_volumetrie_hebdomadaire"]);
  assert.match(A.dernierMessage(), /n'existe/);
});

test("rechargement : une sélection inconnue ne casse rien", () => {
  preparerDeck();
  assert.equal(A.chargerSelection("preset_inexistant"), null);
  assert.match(A.dernierMessage(), /introuvable/i);
});

test("suppression : la sélection disparaît, les KPI restent intacts", () => {
  preparerDeck();
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  A.enregistrerSelection("COPIL");
  A.confirmer(true);
  assert.equal(A.supprimerSelection("preset_copil"), true);
  assert.equal(A.get("presets").length, 0);
  assert.equal(A.get("data").length, 4, "les fiches ne sont pas touchées");
});

test("suppression : refuser la confirmation conserve la sélection", () => {
  preparerDeck();
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  A.enregistrerSelection("COPIL");
  A.confirmer(false);
  assert.equal(A.supprimerSelection("preset_copil"), false);
  assert.equal(A.get("presets").length, 1);
});

test("réordonnancement : monter une ligne change l'ordre des diapositives", () => {
  preparerDeck();
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  A.basculerSelection("kpi_taux_service_hebdomadaire");
  A.deplacerSelection("kpi_taux_service_hebdomadaire", -1);
  assert.deepEqual(A.get("selectionIds"),
    ["kpi_taux_service_hebdomadaire", "kpi_volumetrie_hebdomadaire"]);
});

test("réordonnancement : on ne peut pas sortir des bornes", () => {
  preparerDeck();
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  A.basculerSelection("kpi_taux_service_hebdomadaire");
  A.deplacerSelection("kpi_volumetrie_hebdomadaire", -1);
  A.deplacerSelection("kpi_taux_service_hebdomadaire", 1);
  assert.deepEqual(A.get("selectionIds"),
    ["kpi_volumetrie_hebdomadaire", "kpi_taux_service_hebdomadaire"]);
});

/* ═══ Partage entre appareils ═══ */

test("synchro : les sélections partent dans le document partagé", () => {
  preparerDeck();
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  A.enregistrerSelection("COPIL");
  const payload = A.buildSyncPayload();
  assert.ok(Array.isArray(payload.kpiPresets));
  assert.equal(payload.kpiPresets[0].name, "COPIL");
});

test("synchro : une sélection créée sur un autre poste arrive sans écraser la mienne", () => {
  preparerDeck();
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  A.enregistrerSelection("COPIL");
  A.run(`mergeRemoteContent({ kpiPresets: [
    { id: "preset_point_quotidien", name: "Point quotidien",
      items: [{ kpiId: "kpi_volumetrie_quotidienne" }], _mtime: 999, _by: "jean" }
  ]})`);
  const noms = A.get("presets").map(p => p.name).sort();
  assert.deepEqual(noms, ["COPIL", "Point quotidien"]);
});

test("synchro : sur une même sélection, la version la plus récente gagne", () => {
  preparerDeck();
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  A.enregistrerSelection("COPIL");
  A.run(`mergeRemoteContent({ kpiPresets: [
    { id: "preset_copil", name: "COPIL",
      items: [{ kpiId: "kpi_taux_service_hebdomadaire" }], _mtime: 9999999999999, _by: "jean" }
  ]})`);
  const p = A.get("presets").find(x => x.id === "preset_copil");
  assert.deepEqual(p.items.map(i => i.kpiId), ["kpi_taux_service_hebdomadaire"]);
});

test("synchro : un document sans sélections ne vide pas les miennes", () => {
  preparerDeck();
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  A.enregistrerSelection("COPIL");
  A.run(`mergeRemoteContent({ kpiManual: [] })`);
  assert.equal(A.get("presets").length, 1, "champ absent ≠ liste vide");
});

test("synchro : « remplacer par le cloud » sans sélections distantes conserve les locales", () => {
  preparerDeck();
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  A.enregistrerSelection("COPIL");
  A.confirmer(true);
  A.run(`replaceLocalWithRemote({ kpiManual: ${JSON.stringify(FICHES_DECK)}, updatedAt: 5 })`);
  assert.equal(A.get("presets").length, 1);
});

/* ═══ Génération du PowerPoint ═══ */

test("génération : une diapositive par KPI sélectionné", async () => {
  preparerDeck();
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  A.basculerSelection("kpi_taux_service_hebdomadaire");
  const res = await A.run("genererDeck()");
  assert.equal(res.diapos, 2);
  assert.match(res.nom, /\.pptx$/);
});

test("génération : le fichier porte le nom de la sélection", async () => {
  preparerDeck();
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  A.enregistrerSelection("COPIL hebdomadaire");
  const res = await A.run("genererDeck()");
  assert.match(res.nom, /copil_hebdomadaire/);
});

test("génération : une sélection vide ne produit aucun fichier", async () => {
  preparerDeck();
  const res = await A.run("genererDeck()");
  assert.equal(res, null);
  assert.match(A.dernierMessage(), /vide/i);
});

test("génération : un KPI sans lien Power BI n'empêche pas le deck", async () => {
  preparerDeck();
  A.basculerSelection("kpi_anticipation_mensuelle");
  const res = await A.run("genererDeck()");
  assert.equal(res.diapos, 1);
});

test("génération : l'absence de modèle est signalée sans planter", async () => {
  preparerDeck();
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  A.run(`modeleDeckCache = null; fetch = function () { return Promise.resolve({ ok: false }); };`);
  const res = await A.run("genererDeck()");
  assert.equal(res, null);
  assert.match(A.dernierMessage(), /Modèle/i);
});

test("génération : la production est tracée dans l'historique", async () => {
  preparerDeck();
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  await A.run("genererDeck()");
  const trace = A.get("activityLog")[0];
  assert.equal(trace.action, "deck");
  assert.match(trace.detail, /1 diapositive/);
});

test("génération : le contenu produit est bien une archive PowerPoint relisible", async () => {
  preparerDeck();
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  A.basculerSelection("kpi_taux_service_hebdomadaire");
  // On rejoue la construction avec les mêmes entrées pour inspecter le résultat
  const noms = await A.run(`(async function () {
    var p = selectionCourante();
    var r = Selection.resoudrePreset(p, data.concat(personalEntries), activeSites());
    var octets = await PptxDeck.construireDeck(modeleDeckCache, {
      titre: "T", diapos: r.diapos.map(function (d) { return { titre: d.titre, lien: d.lien }; })
    });
    var pieces = await ZipMini.lireZip(octets);
    return Array.from(pieces.keys());
  })()`);
  assert.ok(noms.includes("ppt/slides/slide1.xml"));
  assert.ok(noms.includes("ppt/slides/slide2.xml"));
});

/* ═══ Ce qui ne doit PAS bouger ═══ */

/** Contenu HTML réellement écrit dans les cartes affichées. */
const htmlCartesDeck = () =>
  A.run(`(container.children || []).map(function (c) { return c.innerHTML || ""; }).join("")`);

test("non-régression : hors mode sélection, aucune case n'est ajoutée aux cartes", () => {
  preparerDeck();
  A.run("basculerModeSelection(false); filterData();");
  assert.ok(!htmlCartesDeck().includes("card-select"));
});

test("non-régression : en mode sélection, la carte porte sa case et son rang", () => {
  preparerDeck();
  A.run("basculerModeSelection(true)");
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  const html = htmlCartesDeck();
  assert.ok(html.includes("card-select"));
  assert.ok(html.includes("card-select-rang"));
});

test("non-régression : les favoris et les boutons de carte restent en place", () => {
  preparerDeck({ favorites: ["kpi_volumetrie_hebdomadaire"] });
  A.run("rebuildData(false); basculerModeSelection(true)");
  const html = htmlCartesDeck();
  assert.ok(html.includes("btn-fav"), "le bouton favori subsiste");
  assert.ok(html.includes("Choisir un rapport"), "le sélecteur de rapport subsiste");
});

test("non-régression : une sélection ne modifie jamais les fiches", () => {
  preparerDeck();
  const avant = JSON.stringify(A.get("manualEntries"));
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  A.enregistrerSelection("COPIL");
  A.chargerSelection("preset_copil");
  assert.equal(JSON.stringify(A.get("manualEntries")), avant);
});

/* ═══ Passerelle vers la capture automatique ═══ */

test("export : le descriptif de sélection décrit chaque diapositive à capturer", () => {
  preparerDeck();
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  A.basculerSelection("kpi_taux_service_hebdomadaire");
  A.saisir("deckTitleInput", "Indicateurs MAGASINS ARMEMENT");
  A.saisir("deckPeriodInput", "S30 à S33-2026");

  const sel = A.run("selectionJson()");
  assert.equal(sel._format, "annuaire-kpi-selection");
  assert.equal(sel.couverture.titre, "Indicateurs MAGASINS ARMEMENT");
  assert.equal(sel.couverture.periode, "S30 à S33-2026");
  assert.equal(sel.diapos.length, 2);
  assert.ok(sel.diapos[0].lien.startsWith("https://app.powerbi.com/"));
});

test("export : l'ordre du support est celui de la sélection", () => {
  preparerDeck();
  A.basculerSelection("kpi_taux_service_hebdomadaire");
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  const sel = A.run("selectionJson()");
  assert.deepEqual(sel.diapos.map(d => d.kpiId),
    ["kpi_taux_service_hebdomadaire", "kpi_volumetrie_hebdomadaire"]);
});

test("export : chaque diapositive annonce le nom d'image attendu, numéroté", () => {
  preparerDeck();
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  A.basculerSelection("kpi_taux_service_hebdomadaire");
  const sel = A.run("selectionJson()");
  assert.match(sel.diapos[0].fichier, /^01-/);
  assert.match(sel.diapos[1].fichier, /^02-/);
  assert.ok(sel.diapos.every(d => d.fichier.endsWith(".png")));
});

test("export : une sélection vide n'exporte rien et le dit", () => {
  preparerDeck();
  assert.equal(A.run("exporterSelectionJson()"), null);
  assert.match(A.dernierMessage(), /vide/i);
});

test("export : le fichier téléchargé porte le nom de la sélection", () => {
  preparerDeck();
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  A.enregistrerSelection("COPIL hebdomadaire");
  A.run("exporterSelectionJson()");
  assert.match(A.dernierMessage(), /selection-copil_hebdomadaire\.json/);
});

test("captures : une image nommée comme attendu rejoint sa diapositive", () => {
  preparerDeck();
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  A.basculerSelection("kpi_taux_service_hebdomadaire");
  const noms = A.run("selectionJson().diapos.map(function (d) { return d.fichier; })");
  const place = A.run(`rangerCaptures(${JSON.stringify([noms[1]])},
    { ${JSON.stringify(noms[1])}: [1, 2, 3, 4] })`);
  assert.equal(place, 1);
  assert.ok(A.run(`!!capturesDeck["kpi_taux_service_hebdomadaire"]`), "la 2ᵉ diapositive a sa capture");
  assert.ok(A.run(`!capturesDeck["kpi_volumetrie_hebdomadaire"]`), "la 1ʳᵉ n'en a pas");
});

test("captures : des images nommées librement suivent l'ordre du support", () => {
  preparerDeck();
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  A.basculerSelection("kpi_taux_service_hebdomadaire");
  const place = A.run(`rangerCaptures(["a.png", "b.png"], { "a.png": [1], "b.png": [2] })`);
  assert.equal(place, 2);
  assert.ok(A.run(`!!capturesDeck["kpi_volumetrie_hebdomadaire"] && !!capturesDeck["kpi_taux_service_hebdomadaire"]`));
});

test("captures : un fichier vide est ignoré, pas rangé comme une image", () => {
  preparerDeck();
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  assert.equal(A.run(`rangerCaptures(["a.png"], { "a.png": [] })`), 0);
});

test("captures : plus d'images que de diapositives ne provoque pas d'erreur", () => {
  preparerDeck();
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  assert.equal(A.run(`rangerCaptures(["a.png", "b.png", "c.png"],
    { "a.png": [1], "b.png": [2], "c.png": [3] })`), 1);
});

test("captures : la fenêtre de génération signale les diapositives pourvues", () => {
  preparerDeck();
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  A.saisir("deckModeSelect", "image");   // les captures ne servent que dans ce mode
  A.run(`rangerCaptures(["a.png"], { "a.png": [1] })`);
  assert.ok(A.html("deckList").includes("🖼 capture"));
});

test("captures : une capture rangée finit bien en IMAGE dans le support", async () => {
  preparerDeck();
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  A.run(`rangerCaptures(["a.png"], { "a.png": [137, 80, 78, 71, 13, 10, 26, 10,
    0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 2, 0, 0, 0, 1, 0] })`);
  const xml = await A.run(`(async function () {
    var p = selectionCourante();
    var r = Selection.resoudrePreset(p, data.concat(personalEntries), activeSites());
    var octets = await PptxDeck.construireDeck(modeleDeckCache, {
      titre: "T", diapos: r.diapos.map(function (d) {
        return { titre: d.titre, lien: d.lien,
                 image: capturesDeck[d.kpiId] ? capturesDeck[d.kpiId].donnees : null };
      })
    });
    var pieces = await ZipMini.lireZip(octets);
    // Le modèle simulé n'a pas de couverture : la 1ʳᵉ diapositive est le KPI
    return ZipMini.versTexte(pieces.get("ppt/slides/slide1.xml"));
  })()`);
  assert.ok(xml.includes("<p:pic>"), "le visuel est une image");
  assert.ok(!xml.includes("Visuel à capturer"), "et non un cadre d'attente");
});

/* ═══ Choix du contenu des visuels ═══ */

test("mode : par défaut, le support embarque les visuels vivants", async () => {
  preparerDeck();
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  const xml = await A.run(`(async function () {
    var mode = (document.getElementById("deckModeSelect").value) || "vivant";
    var r = Selection.resoudrePreset(selectionCourante(), data.concat(personalEntries), activeSites());
    var octets = await PptxDeck.construireDeck(modeleDeckCache, { titre: "T",
      diapos: r.diapos.map(function (d) {
        return { titre: d.titre, lien: d.lien, vivant: mode === "vivant" && !!d.lien };
      }) });
    var pieces = await ZipMini.lireZip(octets);
    return ZipMini.versTexte(pieces.get("ppt/slides/slide1.xml"));
  })()`);
  assert.ok(xml.includes("<we:webextensionref"), "le complément Power BI est posé");
});

/* Pose l'empreinte d'un lien : ce que le complément Power BI avait
   mémorisé lors d'une insertion faite à la main. Sans elle, il affiche
   « l'objet visuel n'existe plus » — vérifié en conditions réelles. */
function poserEmpreinte(lien) {
  A.run(`empreintes = [Empreintes.creerEmpreinte({
    reportUrl: ${JSON.stringify(lien)},
    artifactName: "&quot;Histo empilé&quot;",
    bookmark: "&quot;H4sIEtatSerialise&quot;"
  }, { horodatage: 1 })]`);
}

test("mode : un lien de visuel sans empreinte demande d'abord un relevé", () => {
  preparerDeck();
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  A.saisir("deckModeSelect", "vivant");
  A.run("renderDeckLignes()");
  assert.ok(A.html("deckList").includes("à relever"),
    "sans empreinte, le complément afficherait « l'objet visuel n'existe plus »");
});

test("mode : une fois l'empreinte relevée, le visuel est annoncé comme prêt", () => {
  preparerDeck();
  relier("kpi_volumetrie_hebdomadaire", LIEN_VISUEL);
  poserEmpreinte(LIEN_VISUEL);
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  A.saisir("deckModeSelect", "vivant");
  A.run("renderDeckLignes()");
  assert.ok(A.html("deckList").includes("⚡ visuel"));
});

test("mode : sans lien Power BI, la ligne le signale", () => {
  preparerDeck();
  A.basculerSelection("kpi_anticipation_mensuelle");
  A.saisir("deckModeSelect", "vivant");
  A.run("renderDeckLignes()");
  assert.ok(A.html("deckList").includes("sans lien"));
});

test("mode image : la ligne réclame une capture tant qu'il n'y en a pas", () => {
  preparerDeck();
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  A.saisir("deckModeSelect", "image");
  A.run("renderDeckLignes()");
  assert.ok(A.html("deckList").includes("à capturer"));
});

test("mode lien : aucune capture n'est réclamée", () => {
  preparerDeck();
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  A.saisir("deckModeSelect", "lien");
  A.run("renderDeckLignes()");
  assert.ok(A.html("deckList").includes("lien seul"));
});

test("génération : le message de fin précise le mode retenu", async () => {
  preparerDeck();
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  A.saisir("deckModeSelect", "vivant");
  await A.run("genererDeck()");
  assert.match(A.dernierMessage(), /visuels vivants/);
});

/* ═══ Le bon graphique, et lui seul ═══ */

/** Remplace le lien d'un KPI pour éprouver le diagnostic. */
function relier(kpiId, lien) {
  A.run(`manualEntries.forEach(function (k) { if (k.id === ${JSON.stringify(kpiId)}) k.logistiport = ${JSON.stringify(lien)}; });
         rebuildData(false);`);
}

const LIEN_VISUEL = "https://app.powerbi.com/groups/me/reports/r1/p1?pbi_source=shareVisual&visual=v1&width=1253.02&height=527.91";
const LIEN_BANDEAU = "https://app.powerbi.com/groups/me/reports/r1/p1?pbi_source=shareVisual&visual=v9&width=1140.87&height=51.48";
const LIEN_PAGE = "https://app.powerbi.com/links/UWLu7wc3Ez?pbi_source=linkShare&bookmarkGuid=eb57";

test("liens : un lien de visuel au bon format est validé", () => {
  preparerDeck();
  relier("kpi_volumetrie_hebdomadaire", LIEN_VISUEL);
  poserEmpreinte(LIEN_VISUEL);
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  A.run("renderDeckLignes()");
  const html = A.html("deckList");
  assert.ok(html.includes("⚡ visuel"));
  assert.ok(html.includes("1253×528 px"), "le format du visuel est affiché");
  assert.equal(A.el("deckWarning").style.display, "none", "aucune alerte");
});

test("liens : un visuel sans empreinte est signalé dans le bilan", () => {
  preparerDeck();
  relier("kpi_volumetrie_hebdomadaire", LIEN_VISUEL);
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  A.run("renderDeckLignes()");
  assert.equal(A.el("deckWarning").style.display, "block");
  assert.ok(A.texte("deckWarning").includes("sans empreinte"));
});

test("liens : un lien de PAGE est signalé — il afficherait tout le rapport", () => {
  preparerDeck();
  relier("kpi_volumetrie_hebdomadaire", LIEN_PAGE);
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  A.run("renderDeckLignes()");
  assert.ok(A.html("deckList").includes("⚠ page entière"));
  assert.match(A.texte("deckWarning"), /lien\(s\) de PAGE/);
});

test("liens : le message explique comment reprendre un lien de page", () => {
  preparerDeck();
  relier("kpi_volumetrie_hebdomadaire", LIEN_PAGE);
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  A.run("renderDeckLignes()");
  assert.ok(A.html("deckList").includes("Lien vers cet élément visuel"));
});

test("liens : un visuel dix fois plus large que haut est signalé comme suspect", () => {
  preparerDeck();
  relier("kpi_volumetrie_hebdomadaire", LIEN_BANDEAU);
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  A.run("renderDeckLignes()");
  assert.ok(A.html("deckList").includes("⚠ format allongé"));
  assert.ok(A.html("deckList").includes("1141×51 px"));
  assert.match(A.texte("deckWarning"), /format très allongé/);
});

test("liens : le bilan cumule les différents soucis", () => {
  preparerDeck();
  relier("kpi_volumetrie_hebdomadaire", LIEN_PAGE);
  relier("kpi_taux_service_hebdomadaire", LIEN_BANDEAU);
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  A.basculerSelection("kpi_taux_service_hebdomadaire");
  A.basculerSelection("kpi_anticipation_mensuelle");   // sans lien
  A.run("renderDeckLignes()");
  const bilan = A.texte("deckWarning");
  assert.match(bilan, /1 lien\(s\) de PAGE/);
  assert.match(bilan, /1 visuel\(s\) au format très allongé/);
  assert.match(bilan, /1 KPI sans lien/);
});

test("liens : la ligne fautive est mise en évidence", () => {
  preparerDeck();
  relier("kpi_volumetrie_hebdomadaire", LIEN_PAGE);
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  A.run("renderDeckLignes()");
  assert.ok(A.html("deckList").includes("deck-row-warn"));
});

test("liens : en mode image, le diagnostic laisse la place à l'état de capture", () => {
  preparerDeck();
  relier("kpi_volumetrie_hebdomadaire", LIEN_PAGE);
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  A.saisir("deckModeSelect", "image");
  A.run("renderDeckLignes()");
  assert.ok(A.html("deckList").includes("à capturer"));
});

/* ─── Empreintes : relevé, partage, génération ──────────────
   Le relevé se fait dans le navigateur, à partir d'un PowerPoint où le
   visuel a été inséré à la main. C'est l'unique opération manuelle, et
   elle n'est à faire qu'une fois par KPI. */

/** Un .pptx minimal portant UN complément Power BI, comme après insertion. */
function pptxAvecComplement(lien, nom) {
  const props = [
    `<we:property name="reportUrl" value="&quot;${lien.replace(/&/g, "&amp;")}&quot;"/>`,
    `<we:property name="artifactName" value="&quot;${nom || "Histo empilé"}&quot;"/>`,
    `<we:property name="pageName" value="&quot;p1&quot;"/>`,
    `<we:property name="datasetId" value="&quot;jeu-1&quot;"/>`,
    `<we:property name="bookmark" value="&quot;H4sIEtatSerialise&quot;"/>`,
    `<we:property name="initialStateBookmark" value="&quot;H4sIEtatSerialise&quot;"/>`,
    `<we:property name="creatorSessionId" value="&quot;session-a-oublier&quot;"/>`
  ].join("");
  return A.run(`ZipMini.ecrireZip([
    { nom: "[Content_Types].xml", donnees: "<?xml version=\\"1.0\\"?><Types></Types>" },
    { nom: "ppt/webextensions/webextension1.xml",
      donnees: ${JSON.stringify(`<we:webextension><we:properties>${props}</we:properties></we:webextension>`)} }
  ])`);
}

test("empreintes : un PowerPoint fait à la main livre sa mémoire", async () => {
  preparerDeck();
  const octets = pptxAvecComplement(LIEN_VISUEL);
  const bilan = await A.run("releverEmpreintesDepuis")(octets);
  assert.equal(bilan.total, 1);
  assert.equal(bilan.ajoutees, 1);
  assert.equal(A.run("empreintes.length"), 1);
  assert.equal(A.run("empreintes[0].libelle"), "Histo empilé");
});

test("empreintes : les traces de la session d'insertion ne sont pas reprises", async () => {
  preparerDeck();
  await A.run("releverEmpreintesDepuis")(pptxAvecComplement(LIEN_VISUEL));
  assert.ok(!("creatorSessionId" in A.run("empreintes[0].proprietes")),
    "un fichier neuf ne doit pas porter les traces d'un autre");
});

test("empreintes : relever deux fois le même visuel n'en crée pas deux", async () => {
  preparerDeck();
  await A.run("releverEmpreintesDepuis")(pptxAvecComplement(LIEN_VISUEL));
  const second = await A.run("releverEmpreintesDepuis")(pptxAvecComplement(LIEN_VISUEL, "Renommé"));
  assert.equal(second.ajoutees, 0);
  assert.equal(A.run("empreintes.length"), 1);
});

test("empreintes : un PowerPoint sans insertion manuelle ne trompe personne", async () => {
  preparerDeck();
  const vide = A.run(`ZipMini.ecrireZip([
    { nom: "[Content_Types].xml", donnees: "<?xml version=\\"1.0\\"?><Types></Types>" }])`);
  const bilan = await A.run("releverEmpreintesDepuis")(vide);
  assert.equal(bilan.total, 0);
  assert.equal(A.run("empreintes.length"), 0);
});

test("empreintes : le relevé est rangé dans le stockage, donc partagé", async () => {
  preparerDeck();
  await A.run("releverEmpreintesDepuis")(pptxAvecComplement(LIEN_VISUEL));
  const range = JSON.parse(A.run(`localStorage.getItem("kpiEmpreintes")`));
  assert.equal(range.length, 1);
  assert.ok(range[0].proprietes.bookmark, "l'état sérialisé est conservé : sans lui, rien ne s'affiche");
});

/* Le fichier tel que le navigateur le remet après un clic sur « Parcourir ». */
function fichierChoisi(octets, nom) {
  return { name: nom || "support.pptx", arrayBuffer: async () => octets.buffer || octets };
}

test("empreintes : importer un fichier remet la liste à jour toute seule", async () => {
  preparerDeck();
  relier("kpi_volumetrie_hebdomadaire", LIEN_VISUEL);
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  A.run("renderDeckLignes()");
  assert.ok(A.html("deckList").includes("à relever"));
  await A.run("importerEmpreintes")(fichierChoisi(pptxAvecComplement(LIEN_VISUEL)));
  assert.ok(A.html("deckList").includes("⚡ visuel"), "la liste se remet à jour toute seule");
});

test("empreintes : un fichier sans insertion manuelle le dit clairement", async () => {
  preparerDeck();
  const vide = A.run(`ZipMini.ecrireZip([
    { nom: "[Content_Types].xml", donnees: "<?xml version=\\"1.0\\"?><Types></Types>" }])`);
  await A.run("importerEmpreintes")(fichierChoisi(vide));
  assert.match(A.dernierMessage(), /inséré à la main/);
});

test("empreintes : le support produit porte bien la mémoire relevée", async () => {
  preparerDeck();
  relier("kpi_volumetrie_hebdomadaire", LIEN_VISUEL);
  await A.run("releverEmpreintesDepuis")(pptxAvecComplement(LIEN_VISUEL));
  A.basculerSelection("kpi_volumetrie_hebdomadaire");
  const options = A.run(`(function () {
    const preset = selectionCourante();
    const { diapos } = Selection.resoudrePreset(preset, [...data, ...personalEntries], activeSites());
    return { diapos: diapos.map(d => ({ lien: d.lien, vivant: true })), empreintes };
  })()`);
  const diapo = A.run("PptxDeck.avecEmpreinte")(options.diapos[0], options.empreintes);
  assert.ok(diapo.proprietesComplement, "l'empreinte est appliquée à la diapositive");
  assert.equal(diapo.proprietesComplement.artifactName, "&quot;Histo empilé&quot;");
  assert.ok(diapo.proprietesComplement.initialStateBookmark, "la copie de l'état est reconstituée");
});
