/* Vérifie que le diagnostic « données réelles » lit exactement les mêmes
   emplacements de stockage que l'application. Une clé mal orthographiée
   ferait compter des fiches supprimées comme si elles existaient encore. */
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");

const app = fs.readFileSync("app.js", "utf8");
const shell = fs.readFileSync("tests-shell.html", "utf8");

/* Clés réellement écrites/lues par l'application (littérales + constantes) */
function clesDeLApplication() {
  const cles = new Set();
  for (const m of app.matchAll(/localStorage\.(?:setItem|getItem|removeItem)\("([^"]+)"/g)) cles.add(m[1]);
  // Constantes du type : const LS_ACTIVITY = "kpiActivity";
  for (const m of app.matchAll(/const\s+LS_[A-Z_]+\s*=\s*"([^"]+)"/g)) cles.add(m[1]);
  return cles;
}

/* Clés déclarées dans l'objet CLE du diagnostic */
function clesDuDiagnostic() {
  const bloc = shell.match(/const CLE = \{([\s\S]*?)\};/);
  assert.ok(bloc, "l'objet CLE du diagnostic doit exister");
  const cles = {};
  for (const m of bloc[1].matchAll(/([A-Z_]+)\s*:\s*"([^"]+)"/g)) cles[m[1]] = m[2];
  return cles;
}

const app_ = clesDeLApplication();
const diag = clesDuDiagnostic();

test("le diagnostic déclare bien toutes ses clés de stockage", () => {
  ["MANUAL", "DELETED", "PURGED", "SITES", "USER", "CONFIG", "OPTOUT"].forEach(k =>
    assert.ok(diag[k], "clé manquante dans le diagnostic : " + k));
});

test("chaque clé du diagnostic existe réellement dans l'application", () => {
  const absentes = Object.entries(diag).filter(([, v]) =>
    !app_.has(v) && ![...app_].some(k => k.startsWith(v)) && !app.includes('"' + v + '"'));
  assert.deepEqual(absentes, [], "clés introuvables dans app.js : " + JSON.stringify(absentes));
});

test("les fiches partagées sont lues au bon endroit", () => {
  assert.equal(diag.MANUAL, "kpiManualEntries");
  assert.ok(app.includes('localStorage.setItem("kpiManualEntries"'), "l'application écrit bien à cet endroit");
});

test("la corbeille est lue au bon endroit", () => {
  assert.equal(diag.DELETED, "kpiDeletedIds");
  assert.ok(app.includes('localStorage.setItem("kpiDeletedIds"'));
});

test("les suppressions définitives sont lues au bon endroit", () => {
  assert.equal(diag.PURGED, "kpiPurgedIds",
    "sinon les fiches supprimées définitivement seraient comptées comme présentes");
  assert.ok(app.includes('localStorage.setItem("kpiPurgedIds"'));
});

test("les périmètres sont lus au bon endroit", () => {
  assert.equal(diag.SITES, "kpiSites");
  assert.ok(app.includes('localStorage.setItem("kpiSites"'));
});

test("les préfixes personnels correspondent à ceux de l'application", () => {
  assert.equal(diag.PERSO, "kpiPersonal_");
  assert.equal(diag.PERSO_TRASH, "kpiPersonalTrash_");
  assert.ok(app.includes('"kpiPersonal_" + currentUser'));
  assert.ok(app.includes('"kpiPersonalTrash_" + currentUser'));
});

test("le diagnostic masque les fiches en corbeille ET les suppressions définitives", () => {
  const bloc = shell.match(/const visibles = fiches\.filter\(([^;]+)\);/);
  assert.ok(bloc, "le filtrage des fiches visibles doit exister");
  assert.match(bloc[1], /idsSupprimes/, "la corbeille doit être exclue");
  assert.match(bloc[1], /purges/, "les suppressions définitives doivent être exclues");
});

test("aucune clé de stockage de l'application n'est oubliée sans raison", () => {
  // Clés volontairement ignorées par le diagnostic (sans intérêt pour l'analyse)
  const ignorees = new Set(["kpiMeta", "kpiFavMeta", "kpiSyncFavorites", "kpiLocalUpdatedAt",
    "kpiClockOffset", "kpiSnapshots", "kpiOptoutClearedV2", "kpiDataCache", "kpiOverrides",
    "kpiFile", "kpiFileB64", "kpiFav_", "kpiActivity", "kpiPersonal_", "kpiPersonalTrash_"]);
  const utilisees = new Set(Object.values(diag));
  const oubliees = [...app_].filter(k => !utilisees.has(k) && !ignorees.has(k));
  assert.deepEqual(oubliees, [], "clés de l'application non prises en compte : " + JSON.stringify(oubliees));
});
