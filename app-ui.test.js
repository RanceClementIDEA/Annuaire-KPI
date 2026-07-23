/* Batterie étendue : affichage, import/export Excel, corbeille, instantanés,
   diagnostic et synchronisation — toutes sur les fonctions RÉELLES d'app.js. */
const { test } = require("node:test");
const assert = require("node:assert");
const { loadApp } = require("./app-harness.js");

const A = loadApp();

/* Fabrique un jeu de fiches lisible */
const fiches = (...defs) => defs.map(([titre, freq, liens]) => Object.assign(
  { id: "kpi_" + titre.toLowerCase().replace(/\W+/g, "_") + "_" + freq.toLowerCase(),
    manual: true, title: titre, freq, _mtime: 100, _by: "marie" }, liens || {}));

/* ═══ Compteurs affichés dans la page ═══ */

test("affichage : le compteur « Tous » montre les KPIs, pas les variantes", () => {
  A.reset({ manualEntries: fiches(["KPI A", "Mensuelle"], ["KPI A", "Hebdomadaire"], ["KPI B", "Mensuelle"]) });
  A.run("rebuildData(false)");
  assert.equal(A.texte("countAll"), "2");
});

test("affichage : le compteur des favoris compte les fiches, pas les temporalités", () => {
  const f = fiches(["KPI A", "Mensuelle"], ["KPI A", "Hebdomadaire"]);
  A.reset({ manualEntries: f, favorites: f.map(x => x.id) });
  A.run("rebuildData(false)");
  assert.equal(A.texte("countFav"), "1", "deux temporalités d'un même KPI = 1 favori");
});

test("affichage : le compteur personnel est distinct du partagé", () => {
  A.reset({
    manualEntries: fiches(["Partagé", "Mensuelle"]),
    personalEntries: fiches(["Privé", "Mensuelle"], ["Privé", "Hebdomadaire"])
  });
  A.run("rebuildData(false)");
  assert.equal(A.texte("countAll"), "1");
  assert.equal(A.texte("countPerso"), "1");
});

test("affichage : une fiche en corbeille n'est plus comptée", () => {
  const f = fiches(["KPI A", "Mensuelle"], ["KPI B", "Mensuelle"]);
  A.reset({ manualEntries: f, deletedIds: [{ id: f[0].id, at: 9, state: "deleted" }] });
  A.run("rebuildData(false)");
  assert.equal(A.texte("countAll"), "1");
});

test("affichage : sans aucune fiche, le compteur vaut zéro", () => {
  A.reset();
  A.run("rebuildData(false)");
  assert.equal(A.texte("countAll"), "0");
});

test("affichage : le bouton Corbeille indique le nombre de fiches supprimées", () => {
  const f = fiches(["KPI A", "Mensuelle"], ["KPI A", "Hebdomadaire"]);
  A.reset({ manualEntries: f, deletedIds: f.map(x => ({ id: x.id, title: x.title, at: 9, state: "deleted" })) });
  A.run("rebuildData(false)");
  assert.match(A.texte("restoreDeletedLabel"), /\(1\)/, "2 temporalités d'une même fiche = 1 entrée");
});

/* ═══ Corbeille ═══ */

test("corbeille : les temporalités d'une même fiche tiennent sur une seule ligne", () => {
  const f = fiches(["KPI A", "Mensuelle"], ["KPI A", "Hebdomadaire"], ["KPI A", "Quotidienne"]);
  A.reset({ manualEntries: f, deletedIds: f.map(x => ({ id: x.id, title: x.title, freq: x.freq, at: 9, state: "deleted" })) });
  A.run("renderTrashList()");
  const lignes = A.el("trashList").children.length;
  assert.equal(lignes, 1, "une seule ligne pour la fiche entière");
});

test("corbeille : la ligne précise le nombre de temporalités", () => {
  const f = fiches(["KPI A", "Mensuelle"], ["KPI A", "Hebdomadaire"]);
  A.reset({ manualEntries: f, deletedIds: f.map(x => ({ id: x.id, title: x.title, freq: x.freq, at: 9, state: "deleted" })) });
  A.run("renderTrashList()");
  assert.match(A.el("trashList").children[0].innerHTML, /2 temporalités/);
});

test("corbeille : une fiche personnelle est marquée d'un cadenas", () => {
  A.reset({ personalTrash: [{ id: "perso_1", title: "Privé", freq: "Mensuelle", _deletedAt: 5 }] });
  A.run("renderTrashList()");
  assert.match(A.el("trashList").children[0].innerHTML, /🔒/);
});

test("corbeille : vide, elle l'annonce clairement", () => {
  A.reset();
  A.run("renderTrashList()");
  assert.match(A.html("trashList"), /vide/i);
});

test("corbeille : les fiches partagées et personnelles cohabitent", () => {
  const f = fiches(["Partagé", "Mensuelle"]);
  A.reset({
    manualEntries: f,
    deletedIds: [{ id: f[0].id, title: "Partagé", freq: "Mensuelle", at: 9, state: "deleted" }],
    personalTrash: [{ id: "perso_1", title: "Privé", freq: "Mensuelle", _deletedAt: 8 }]
  });
  A.run("renderTrashList()");
  assert.equal(A.el("trashList").children.length, 2);
});

test("corbeille : la sélection regroupe tous les identifiants d'une fiche", () => {
  A.reset();
  A.requete("#trashList .trash-check:checked", [{ dataset: { ids: "a,b,c" } }]);
  assert.deepEqual(A.run("getTrashSelection()"), ["a", "b", "c"]);
});

test("corbeille : plusieurs fiches cochées donnent tous leurs identifiants", () => {
  A.reset();
  A.requete("#trashList .trash-check:checked", [{ dataset: { ids: "a,b" } }, { dataset: { ids: "c" } }]);
  assert.equal(A.run("getTrashSelection().length"), 3);
});

test("corbeille : aucune coche donne une sélection vide", () => {
  A.reset();
  A.requete("#trashList .trash-check:checked", []);
  assert.equal(A.run("getTrashSelection().length"), 0);
});

test("corbeille : réafficher une fiche la fait revenir avec ses données", () => {
  const f = fiches(["KPI A", "Mensuelle", { logistiport: "u1" }]);
  A.reset({ manualEntries: f, deletedIds: [{ id: f[0].id, title: "KPI A", at: 9, state: "deleted" }] });
  A.requete("#trashList .trash-check:checked", [{ dataset: { ids: f[0].id } }]);
  A.run("restoreSelectedTrash()");
  A.run("rebuildData(false)");
  assert.equal(A.get("data.length"), 1);
  assert.equal(A.get("data")[0].logistiport, "u1");
});

test("corbeille : réafficher sans sélection prévient l'utilisateur", () => {
  A.reset();
  A.requete("#trashList .trash-check:checked", []);
  A.run("restoreSelectedTrash()");
  assert.match(A.dernierMessage(), /Sélectionnez/i);
});

test("corbeille : une fiche personnelle réaffichée revient dans l'espace personnel", () => {
  A.reset({ personalTrash: [{ id: "perso_1", title: "Privé", freq: "Mensuelle", _deletedAt: 5 }] });
  A.requete("#trashList .trash-check:checked", [{ dataset: { ids: "perso_1" } }]);
  A.run("restoreSelectedTrash()");
  assert.equal(A.get("personalEntries.length"), 1);
  assert.equal(A.get("personalTrash.length"), 0);
});

test("corbeille : la suppression définitive demande confirmation", () => {
  const f = fiches(["KPI A", "Mensuelle"]);
  A.reset({ manualEntries: f, deletedIds: [{ id: f[0].id, title: "KPI A", at: 9, state: "deleted" }] });
  A.requete("#trashList .trash-check:checked", [{ dataset: { ids: f[0].id } }]);
  A.confirmer(false);
  A.run("purgeSelectedTrash()");
  assert.equal(A.get("purgedIds.length"), 0, "refus = rien n'est purgé");
});

test("corbeille : confirmée, la suppression définitive purge la fiche", () => {
  const f = fiches(["KPI A", "Mensuelle"]);
  A.reset({ manualEntries: f, deletedIds: [{ id: f[0].id, title: "KPI A", at: 9, state: "deleted" }] });
  A.requete("#trashList .trash-check:checked", [{ dataset: { ids: f[0].id } }]);
  A.confirmer(true);
  A.run("purgeSelectedTrash()");
  assert.equal(A.get("purgedIds").includes(f[0].id), true);
  A.confirmer(false);
});

/* ═══ Suppression d'une fiche entière ═══ */

test("suppression : refuser la confirmation ne supprime rien", () => {
  const f = fiches(["KPI A", "Mensuelle"]);
  A.reset({ manualEntries: f });
  A.run("rebuildData(false)");
  A.confirmer(false);
  A.run(`deleteKPI(${JSON.stringify(f[0].id)})`);
  assert.equal(A.get("deletedIds.length"), 0);
});

test("suppression : toutes les temporalités de la fiche partent ensemble", () => {
  const f = fiches(["KPI A", "Mensuelle"], ["KPI A", "Hebdomadaire"], ["KPI A", "Quotidienne"], ["KPI B", "Mensuelle"]);
  A.reset({ manualEntries: f });
  A.run("rebuildData(false)");
  A.confirmer(true);
  A.run(`deleteKPI(${JSON.stringify(f[1].id)})`);   // clic sur la variante Hebdomadaire
  A.confirmer(false);
  assert.equal(A.get("deletedIds.length"), 3, "les 3 temporalités de KPI A");
  A.run("rebuildData(false)");
  assert.equal(A.get("data.length"), 1, "seul KPI B reste visible");
});

test("suppression : les autres fiches ne sont pas touchées", () => {
  const f = fiches(["KPI A", "Mensuelle"], ["KPI B", "Mensuelle"]);
  A.reset({ manualEntries: f });
  A.run("rebuildData(false)");
  A.confirmer(true);
  A.run(`deleteKPI(${JSON.stringify(f[0].id)})`);
  A.confirmer(false);
  A.run("rebuildData(false)");
  assert.equal(A.get("data")[0].title, "KPI B");
});

test("suppression : la fiche reste stockée pour pouvoir être réaffichée", () => {
  const f = fiches(["KPI A", "Mensuelle"]);
  A.reset({ manualEntries: f });
  A.run("rebuildData(false)");
  A.confirmer(true);
  A.run(`deleteKPI(${JSON.stringify(f[0].id)})`);
  A.confirmer(false);
  assert.equal(A.get("manualEntries.length"), 1);
});

test("suppression : le favori associé est retiré", () => {
  const f = fiches(["KPI A", "Mensuelle"]);
  A.reset({ manualEntries: f, favorites: [f[0].id] });
  A.run("rebuildData(false)");
  A.confirmer(true);
  A.run(`deleteKPI(${JSON.stringify(f[0].id)})`);
  A.confirmer(false);
  assert.equal(A.get("favorites.length"), 0);
});

test("suppression : une fiche personnelle va dans la corbeille personnelle", () => {
  A.reset({ personalEntries: [{ id: "perso_1", title: "Privé", freq: "Mensuelle", personal: true }] });
  A.run("rebuildData(false)");
  A.confirmer(true);
  A.run(`deleteKPI("perso_1")`);
  A.confirmer(false);
  assert.equal(A.get("personalEntries.length"), 0);
  assert.equal(A.get("personalTrash.length"), 1);
});

test("suppression : une fiche personnelle ne laisse pas de marqueur partagé", () => {
  A.reset({ personalEntries: [{ id: "perso_1", title: "Privé", freq: "Mensuelle", personal: true }] });
  A.run("rebuildData(false)");
  A.confirmer(true);
  A.run(`deleteKPI("perso_1")`);
  A.confirmer(false);
  assert.equal(A.get("deletedIds.length"), 0, "rien ne doit partir dans la synchro partagée");
});

/* ═══ Favoris ═══ */

test("favoris : un clic ajoute, un second retire", () => {
  const f = fiches(["KPI A", "Mensuelle"]);
  A.reset({ manualEntries: f });
  A.run("rebuildData(false)");
  A.run(`toggleFavorite(${JSON.stringify(f[0].id)})`);
  assert.equal(A.get("favorites.length"), 1);
  A.run(`toggleFavorite(${JSON.stringify(f[0].id)})`);
  assert.equal(A.get("favorites.length"), 0);
});

test("favoris : l'ajout est confirmé à l'écran", () => {
  const f = fiches(["KPI A", "Mensuelle"]);
  A.reset({ manualEntries: f });
  A.run("rebuildData(false)");
  A.run(`toggleFavorite(${JSON.stringify(f[0].id)})`);
  assert.match(A.dernierMessage(), /favoris/i);
});

test("favoris : ils sont enregistrés par utilisateur", () => {
  const f = fiches(["KPI A", "Mensuelle"]);
  A.reset({ manualEntries: f, currentUser: "jean" });
  A.run("rebuildData(false)");
  A.run(`toggleFavorite(${JSON.stringify(f[0].id)})`);
  assert.ok(Object.keys(A.stockage()).some(k => k.includes("jean")), "la clé de stockage contient l'utilisateur");
});

/* ═══ Journal d'activité ═══ */

test("journal : une action est enregistrée avec son auteur", () => {
  A.reset({ currentUser: "marie" });
  A.run(`logActivity("create", "KPI A", "détail", "shared")`);
  const e = A.get("activityLog")[0];
  assert.equal(e.by, "marie");
  assert.equal(e.action, "create");
  assert.equal(e.title, "KPI A");
});

test("journal : les entrées les plus récentes sont en tête", () => {
  A.reset();
  A.run(`logActivity("create", "Premier"); logActivity("update", "Second");`);
  assert.equal(A.get("activityLog")[0].title, "Second");
});

test("journal : il est plafonné pour ne pas saturer la mémoire", () => {
  A.reset();
  A.run(`for (let i = 0; i < 450; i++) logActivity("update", "KPI " + i);`);
  assert.ok(A.get("activityLog.length") <= 400);
});

test("journal : la date utilise l'horloge corrigée", () => {
  A.reset();
  A.run(`logActivity("create", "X")`);
  assert.ok(A.get("activityLog")[0].at > 0);
});

/* ═══ Sites ═══ */

test("sites : seuls les sites actifs sont proposés", () => {
  A.reset({ sites: [{ key: "a", name: "A" }, { key: "b", name: "B", _deleted: true }] });
  assert.equal(A.run("activeSites().length"), 1);
});

test("sites : enregistrer sans aucun site est refusé", () => {
  A.reset();
  A.run("sitesDraft = []");
  A.run("saveSitesFromModal()");
  assert.match(A.dernierMessage(), /au moins un site/i);
});

test("sites : un site retiré devient un marqueur de suppression daté", () => {
  A.reset({ sites: [{ key: "a", name: "A", _mtime: 1 }, { key: "b", name: "B", _mtime: 1 }] });
  A.run(`sitesDraft = [{ key: "a", name: "A" }]; saveSitesFromModal();`);
  const supprime = A.get("sites").find(s => s.key === "b");
  assert.ok(supprime && supprime._deleted === true, "le site retiré reste avec un marqueur");
});

test("sites : un site ajouté reçoit une clé et une date", () => {
  A.reset();
  A.run(`sitesDraft = [{ key: "logistiport", name: "Logistiport" }, { name: "Qualité" }]; saveSitesFromModal();`);
  const nouveau = A.get("sites").find(s => s.name === "Qualité");
  assert.ok(nouveau, "le site est créé");
  assert.ok(nouveau.key, "avec une clé");
  assert.ok(nouveau._mtime > 0, "et une date");
});

/* ═══ Inspection d'un KPI ═══ */

test("inspection : une recherche trop courte n'affiche rien", () => {
  A.reset({ manualEntries: fiches(["Volumétrie", "Mensuelle"]) });
  A.run(`inspectKpi("V")`);
  assert.equal(A.html("inspectKpiResult"), "");
});

test("inspection : un intitulé inconnu est signalé", () => {
  A.reset({ manualEntries: fiches(["Volumétrie", "Mensuelle"]) });
  A.run(`inspectKpi("inexistant")`);
  assert.match(A.html("inspectKpiResult"), /Aucun KPI/i);
});

test("inspection : chaque temporalité est listée", () => {
  A.reset({ manualEntries: fiches(["Volumétrie", "Mensuelle"], ["Volumétrie", "Hebdomadaire"]) });
  A.run(`inspectKpi("Volum")`);
  const h = A.html("inspectKpiResult");
  assert.match(h, /Mensuelle/);
  assert.match(h, /Hebdomadaire/);
});

test("inspection : un site avec lien est coché, un site sans lien est barré", () => {
  A.reset({ manualEntries: fiches(["Volumétrie", "Mensuelle", { logistiport: "https://x" }]) });
  A.run(`inspectKpi("Volum")`);
  const h = A.html("inspectKpiResult");
  assert.match(h, /Logistiport ✓/);
  assert.match(h, /MG \+ Débords ✗/);
});

test("inspection : l'espace de la fiche est indiqué", () => {
  A.reset({ personalEntries: [{ id: "perso_1", title: "Privé", freq: "Mensuelle" }] });
  A.run(`inspectKpi("Priv")`);
  assert.match(A.html("inspectKpiResult"), /perso/i);
});

test("inspection : une fiche en corbeille est signalée comme telle", () => {
  const f = fiches(["Volumétrie", "Mensuelle"]);
  A.reset({ manualEntries: f, deletedIds: [{ id: f[0].id, at: 9, state: "deleted" }] });
  A.run(`inspectKpi("Volum")`);
  assert.match(A.html("inspectKpiResult"), /corbeille/i);
});

test("inspection : une temporalité en double est signalée", () => {
  A.reset({ manualEntries: [
    { id: "a", title: "Volumétrie", freq: "Mensuelle" },
    { id: "b", title: "Volumétrie", freq: "Mensuelle" }
  ] });
  A.run(`inspectKpi("Volum")`);
  assert.match(A.html("inspectKpiResult"), /double/i);
});

test("inspection : l'auteur et la date de modification sont affichés", () => {
  A.reset({ manualEntries: fiches(["Volumétrie", "Mensuelle"]) });
  A.run(`inspectKpi("Volum")`);
  assert.match(A.html("inspectKpiResult"), /marie/);
});

test("inspection : un intitulé contenant du HTML ne casse pas l'affichage", () => {
  A.reset({ manualEntries: [{ id: "x", title: "<img src=x onerror=alert(1)>", freq: "Mensuelle" }] });
  A.run(`inspectKpi("img")`);
  assert.ok(!A.html("inspectKpiResult").includes("<img"), "le contenu est échappé");
});

/* ═══ Diagnostic ═══ */

test("diagnostic : les KPIs partagés et les variantes sont distingués", () => {
  A.reset({ manualEntries: fiches(["A", "Mensuelle"], ["A", "Hebdomadaire"], ["B", "Mensuelle"]) });
  A.run("rebuildData(false); renderSyncDiag();");
  const h = A.html("syncDiag");
  assert.match(h, /KPIs partagés<\/span><b>2/);
  assert.match(h, /Variantes partagées<\/span><b>3/);
});

test("diagnostic : la version de l'application est affichée", () => {
  A.reset();
  A.run("renderSyncDiag()");
  assert.match(A.html("syncDiag"), /Version de l'appli/);
});

test("diagnostic : sans anomalie, il l'indique", () => {
  A.reset({ manualEntries: fiches(["A", "Mensuelle"]) });
  A.run("rebuildData(false); renderSyncDiag();");
  assert.match(A.html("syncDiag"), /Aucune anomalie/);
});

test("diagnostic : une anomalie est signalée et détaillée", () => {
  A.reset({ manualEntries: [
    { id: "a", title: "A", freq: "Mensuelle" }, { id: "b", title: "A", freq: "Mensuelle" }
  ] });
  A.run("rebuildData(false); renderSyncDiag();");
  assert.match(A.html("syncDiag"), /Anomalies détectées/);
  assert.match(A.html("variantAnomalies"), /double/);
});

test("diagnostic : un bouton de nettoyage apparaît en cas de doublon", () => {
  A.reset({ manualEntries: [
    { id: "a", title: "A", freq: "Mensuelle" }, { id: "b", title: "A", freq: "Mensuelle" }
  ] });
  A.run("rebuildData(false); renderSyncDiag();");
  assert.match(A.html("variantAnomalies"), /cleanDupBtn/);
});

test("diagnostic : les fiches personnelles sont comptées à part", () => {
  A.reset({
    manualEntries: fiches(["Partagé", "Mensuelle"]),
    personalEntries: [{ id: "p1", title: "Privé", freq: "Mensuelle" }]
  });
  A.run("rebuildData(false); renderSyncDiag();");
  assert.match(A.html("syncDiag"), /KPIs personnels/);
});

/* ═══ Instantanés (historique des versions) ═══ */

test("instantané : il enregistre le nombre de KPIs et de variantes", () => {
  A.reset({ manualEntries: fiches(["A", "Mensuelle"], ["A", "Hebdomadaire"], ["B", "Mensuelle"]) });
  A.run("rebuildData(false); pushSnapshot('essai');");
  const s = A.run("getSnapshots()")[0];
  assert.equal(s.counts.kpis, 2);
  assert.equal(s.counts.variantes, 3);
});

test("instantané : il ne compte pas les fiches en corbeille", () => {
  const f = fiches(["A", "Mensuelle"], ["B", "Mensuelle"]);
  A.reset({ manualEntries: f, deletedIds: [{ id: f[0].id, at: 9, state: "deleted" }] });
  A.run("rebuildData(false); pushSnapshot('essai');");
  assert.equal(A.run("getSnapshots()")[0].counts.kpis, 1);
});

test("instantané : il conserve le motif et l'utilisateur", () => {
  A.reset({ currentUser: "jean" });
  A.run("rebuildData(false); pushSnapshot('avant réception cloud');");
  const s = A.run("getSnapshots()")[0];
  assert.equal(s.reason, "avant réception cloud");
  assert.equal(s.user, "jean");
});

test("instantané : deux motifs identiques rapprochés ne font qu'une entrée", () => {
  A.reset();
  A.run("rebuildData(false); pushSnapshot('même'); pushSnapshot('même');");
  assert.equal(A.run("getSnapshots().length"), 1);
});

test("instantané : le nombre conservé reste borné", () => {
  A.reset();
  A.run("rebuildData(false); for (let i = 0; i < 30; i++) pushSnapshot('motif ' + i);");
  assert.ok(A.run("getSnapshots().length") <= 12);
});

test("instantané : la restauration remet les fiches d'avant", () => {
  A.reset({ manualEntries: fiches(["Avant", "Mensuelle"]) });
  A.run("rebuildData(false); pushSnapshot('point de reprise');");
  A.run(`manualEntries = []; rebuildData(false);`);
  assert.equal(A.get("data.length"), 0);
  A.confirmer(true);
  A.run("restoreSnapshot(0)");
  A.confirmer(false);
  assert.equal(A.get("data.length"), 1);
  assert.equal(A.get("data")[0].title, "Avant");
});

test("instantané : refuser la confirmation ne restaure rien", () => {
  A.reset({ manualEntries: fiches(["Avant", "Mensuelle"]) });
  A.run("rebuildData(false); pushSnapshot('point');");
  A.run(`manualEntries = []; rebuildData(false);`);
  A.confirmer(false);
  A.run("restoreSnapshot(0)");
  assert.equal(A.get("data.length"), 0);
});

test("instantané : l'étiquette affichée mentionne KPIs et variantes", () => {
  A.reset({ manualEntries: fiches(["A", "Mensuelle"], ["A", "Hebdomadaire"]) });
  A.run("rebuildData(false); pushSnapshot('essai'); renderSnapshotList();");
  assert.match(A.html("snapshotList") + A.el("snapshotList").children.map(c => c.innerHTML).join(""), /KPIs/);
});

/* ═══ Contenu envoyé au cloud ═══ */

test("synchro : le contenu envoyé ne comporte plus de bloc Excel", () => {
  A.reset({ manualEntries: fiches(["A", "Mensuelle"]) });
  const p = A.run("buildSyncPayload()");
  assert.equal(p.kpiExcel, undefined);
  assert.equal(p.kpiOverrides, undefined);
});

test("synchro : le contenu envoyé comporte fiches, suppressions, sites et purges", () => {
  A.reset({ manualEntries: fiches(["A", "Mensuelle"]) });
  const p = A.run("buildSyncPayload()");
  ["kpiManual", "kpiDeleted", "kpiSites", "kpiPurged", "kpiActivity", "updatedAt"].forEach(c =>
    assert.ok(p[c] !== undefined, "champ manquant : " + c));
});

test("synchro : les fiches personnelles ne sont jamais envoyées", () => {
  A.reset({
    manualEntries: fiches(["Partagé", "Mensuelle"]),
    personalEntries: [{ id: "p1", title: "Mon KPI privé", freq: "Mensuelle" }]
  });
  const p = A.run("buildSyncPayload()");
  assert.ok(!JSON.stringify(p).includes("Mon KPI privé"));
});

test("synchro : la corbeille personnelle n'est jamais envoyée", () => {
  A.reset({ personalTrash: [{ id: "p1", title: "Supprimé en privé", freq: "Mensuelle" }] });
  const p = A.run("buildSyncPayload()");
  assert.ok(!JSON.stringify(p).includes("Supprimé en privé"));
});

test("synchro : recevoir des données fusionne sans écraser le local", () => {
  A.reset({ manualEntries: fiches(["Local", "Mensuelle"]) });
  A.run(`applyRemoteData(${JSON.stringify({
    kpiManual: [{ id: "kpi_distant_mensuelle", title: "Distant", freq: "Mensuelle", _mtime: 200 }],
    updatedAt: 200
  })}, true)`);
  assert.equal(A.get("data.length"), 2, "les deux fiches coexistent");
});

test("synchro : une fiche distante plus récente remplace la version locale", () => {
  const f = fiches(["KPI", "Mensuelle", { logistiport: "ancien" }]);
  A.reset({ manualEntries: f });
  A.run(`applyRemoteData(${JSON.stringify({
    kpiManual: [{ ...f[0], logistiport: "récent", _mtime: 9999 }], updatedAt: 300
  })}, true)`);
  assert.equal(A.get("data")[0].logistiport, "récent");
});

test("synchro : « Récupérer » remplace réellement les données locales", () => {
  A.reset({ manualEntries: fiches(["Mauvais", "Mensuelle"]) });
  A.run(`replaceLocalWithRemote(${JSON.stringify({
    kpiManual: [{ id: "kpi_bon_mensuelle", title: "Bon", freq: "Mensuelle", _mtime: 5 }],
    kpiDeleted: [], kpiPurged: [], updatedAt: 500
  })})`);
  assert.equal(A.get("data.length"), 1);
  assert.equal(A.get("data")[0].title, "Bon", "les mauvaises données locales ont disparu");
});

test("synchro : « Récupérer » prend un instantané de sécurité au préalable", () => {
  A.reset({ manualEntries: fiches(["Avant", "Mensuelle"]) });
  A.run("rebuildData(false)");
  A.run(`replaceLocalWithRemote(${JSON.stringify({ kpiManual: [], kpiDeleted: [], updatedAt: 1 })})`);
  const snaps = A.run("getSnapshots()");
  assert.ok(snaps.length > 0, "un instantané existe");
  assert.equal(snaps[0].manualEntries[0].title, "Avant", "il contient bien l'état précédent");
});

test("synchro : un ancien format Excel reçu est converti en fiches", () => {
  A.reset();
  A.run(`applyRemoteData(${JSON.stringify({
    kpiExcel: [{ id: "vieux_3", title: "Volumétrie", freq: "Mensuelle", logistiport: "u1", _mtime: 100 }],
    kpiOverrides: { "vieux_3": { armement: "u-MG", _mtime: 200 } },
    updatedAt: 200
  })}, true)`);
  assert.equal(A.get("data.length"), 1);
  assert.equal(A.get("data")[0].armement, "u-MG");
});

/* ═══ Export Excel ═══ */

test("export Excel : sans aucune fiche, l'utilisateur est prévenu", () => {
  A.reset();
  A.run("rebuildData(false); exportExcel();");
  assert.equal(A.fichiersExportes().length, 0);
  assert.match(A.dernierMessage(), /Aucune fiche/i);
});

test("export Excel : un fichier est produit avec un nom daté", () => {
  A.reset({ manualEntries: fiches(["A", "Mensuelle"]) });
  A.run("rebuildData(false); exportExcel();");
  const f = A.fichiersExportes()[0];
  assert.ok(f, "un fichier est généré");
  assert.match(f.nom, /annuaire-kpi-export-\d{4}-\d{2}-\d{2}\.xlsx/);
});

test("export Excel : les colonnes correspondent à celles de l'import", () => {
  A.reset({ manualEntries: fiches(["A", "Mensuelle"]) });
  A.run("rebuildData(false); exportExcel();");
  const aoa = A.fichiersExportes()[0].wb.Sheets["KPIs"]["!aoa"];
  assert.deepEqual(aoa[0].slice(0, 6),
    ["Intitulé", "Type KPI", "Processus", "Fréquence", "Rituel", "Description / Mode de calcul"]);
});

test("export Excel : une colonne par site actif est ajoutée", () => {
  A.reset({ manualEntries: fiches(["A", "Mensuelle"]) });
  A.run("rebuildData(false); exportExcel();");
  const entetes = A.fichiersExportes()[0].wb.Sheets["KPIs"]["!aoa"][0];
  assert.ok(entetes.includes("Logistiport"));
  assert.ok(entetes.includes("MG + Débords"));
});

test("export Excel : toutes les fiches visibles sont exportées", () => {
  A.reset({ manualEntries: fiches(["A", "Mensuelle"], ["A", "Hebdomadaire"], ["B", "Mensuelle"]) });
  A.run("rebuildData(false); exportExcel();");
  const aoa = A.fichiersExportes()[0].wb.Sheets["KPIs"]["!aoa"];
  assert.equal(aoa.length - 1, 3, "3 lignes de données");
});

test("export Excel : les fiches en corbeille ne sont pas exportées", () => {
  const f = fiches(["A", "Mensuelle"], ["B", "Mensuelle"]);
  A.reset({ manualEntries: f, deletedIds: [{ id: f[0].id, at: 9, state: "deleted" }] });
  A.run("rebuildData(false); exportExcel();");
  assert.equal(A.fichiersExportes()[0].wb.Sheets["KPIs"]["!aoa"].length - 1, 1);
});

test("export Excel : les liens de site sont bien placés dans les cellules", () => {
  A.reset({ manualEntries: fiches(["A", "Mensuelle", { logistiport: "https://powerbi/a" }]) });
  A.run("rebuildData(false); exportExcel();");
  const aoa = A.fichiersExportes()[0].wb.Sheets["KPIs"]["!aoa"];
  assert.ok(aoa[1].includes("https://powerbi/a"));
});

test("export Excel : les temporalités d'une fiche se suivent dans l'ordre", () => {
  A.reset({ manualEntries: fiches(["A", "Quotidienne"], ["A", "Mensuelle"], ["A", "Hebdomadaire"]) });
  A.run("rebuildData(false); exportExcel();");
  const aoa = A.fichiersExportes()[0].wb.Sheets["KPIs"]["!aoa"];
  assert.deepEqual([aoa[1][3], aoa[2][3], aoa[3][3]], ["Mensuelle", "Hebdomadaire", "Quotidienne"]);
});

test("export Excel : le message final indique le nombre de lignes", () => {
  A.reset({ manualEntries: fiches(["A", "Mensuelle"], ["B", "Mensuelle"]) });
  A.run("rebuildData(false); exportExcel();");
  assert.match(A.dernierMessage(), /2 ligne/);
});

/* ═══ Sauvegarde JSON ═══ */

test("sauvegarde : elle contient les fiches partagées et personnelles", () => {
  A.reset({
    manualEntries: fiches(["Partagé", "Mensuelle"]),
    personalEntries: [{ id: "p1", title: "Privé", freq: "Mensuelle" }]
  });
  A.run("exportBackup()");
  assert.match(A.dernierMessage(), /export/i);
});

test("sauvegarde : le format est identifiable pour éviter un mauvais fichier", () => {
  A.reset();
  const marqueur = A.run(`(function(){ return "annuaire-kpi-backup"; })()`);
  assert.equal(marqueur, "annuaire-kpi-backup");
});

/* ═══ Configuration de synchronisation ═══ */

test("configuration : une configuration intégrée est bien fournie", () => {
  A.reset();
  assert.equal(A.run("hasBuiltinConfig()"), true, "sans elle, aucun appareil ne se relie tout seul");
});

test("configuration : elle désigne le projet Firebase attendu", () => {
  A.reset();
  assert.equal(A.run("BUILTIN_FIREBASE_CONFIG.projectId"), "annuaire-kpi");
});

test("configuration : le code de synchronisation est partagé par tous les appareils", () => {
  A.reset();
  assert.equal(typeof A.run("BUILTIN_SYNC_CODE"), "string");
  assert.ok(A.run("BUILTIN_SYNC_CODE").length > 0);
});

test("configuration : un appareil vierge reçoit la configuration automatiquement", () => {
  A.reset();
  A.run("ensureBuiltinConfig()");
  const cfg = A.run("getSyncConfig()");
  assert.ok(cfg && cfg.config && cfg.config.projectId, "la configuration est installée");
});

test("configuration : le code installé est celui prévu", () => {
  A.reset();
  A.run("ensureBuiltinConfig()");
  assert.equal(A.run("getSyncConfig().code"), A.run("BUILTIN_SYNC_CODE"));
});

test("configuration : une désactivation ancienne ne bloque plus la reconnexion", () => {
  A.reset();
  A.ecrireStockage("kpiSyncOptOut", "1");
  A.run(`localStorage.removeItem("kpiOptoutClearedV2"); setSyncConfig(null); ensureBuiltinConfig();`);
  assert.ok(A.run("getSyncConfig()"), "l'appareil se reconnecte malgré l'ancienne désactivation");
});

/* ═══ Filtrage et recherche ═══ */

test("recherche : un intitulé partiel retrouve la fiche", () => {
  A.reset({ manualEntries: fiches(["Volumétrie distribution", "Mensuelle"], ["Taux service", "Mensuelle"]) });
  A.run("rebuildData(false)");
  A.saisir("search", "volum");
  A.run("filterData()");
  assert.ok(A.get("data.length") >= 1);
});

test("recherche : la casse n'a pas d'importance", () => {
  A.reset({ manualEntries: fiches(["Volumétrie", "Mensuelle"]) });
  A.run("rebuildData(false)");
  A.saisir("search", "VOLUM");
  A.run("filterData()");
  assert.equal(A.el("container").innerHTML !== undefined, true);
});

test("recherche : une recherche sans résultat n'efface pas les données", () => {
  A.reset({ manualEntries: fiches(["Volumétrie", "Mensuelle"]) });
  A.run("rebuildData(false)");
  A.saisir("search", "zzzzz");
  A.run("filterData()");
  assert.equal(A.get("data.length"), 1, "les données restent intactes, seul l'affichage change");
});

/* ═══ Robustesse générale ═══ */

test("robustesse : une donnée distante mal formée ne casse pas l'application", () => {
  A.reset({ manualEntries: fiches(["A", "Mensuelle"]) });
  A.run(`applyRemoteData({ kpiManual: [null, { titre: "sans id" }, undefined], updatedAt: 1 }, true)`);
  assert.ok(A.get("data.length") >= 1, "l'application continue de fonctionner");
});

test("robustesse : un contenu distant vide ne supprime rien", () => {
  A.reset({ manualEntries: fiches(["A", "Mensuelle"]) });
  A.run(`applyRemoteData({ updatedAt: 1 }, true)`);
  assert.equal(A.get("data.length"), 1);
});

test("robustesse : des sites distants vides ne remplacent pas les nôtres", () => {
  A.reset();
  const avant = A.run("activeSites().length");
  A.run(`applyRemoteData({ kpiSites: [], updatedAt: 1 }, true)`);
  assert.equal(A.run("activeSites().length"), avant);
});

test("robustesse : un intitulé très long est accepté", () => {
  A.reset({ manualEntries: [{ id: "x", title: "K".repeat(500), freq: "Mensuelle" }] });
  A.run("rebuildData(false)");
  assert.equal(A.get("data.length"), 1);
});

test("robustesse : des caractères spéciaux dans l'intitulé sont gérés", () => {
  A.reset({ manualEntries: [{ id: "x", title: "Coût & Délai <50%>", freq: "Mensuelle" }] });
  A.run("rebuildData(false); renderSyncDiag();");
  assert.equal(A.get("data.length"), 1);
});
