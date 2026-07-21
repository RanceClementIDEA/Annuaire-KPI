/* ============================================================
   Tests du moteur de fusion — lanceur natif de Node
   Exécution :  node --test
   Aucune dépendance à installer.
   ============================================================ */
const { test } = require("node:test");
const assert = require("node:assert");
const {
  mergeEntries, mergeOverrides, mergeDeleted,
  mergeFavorites, mergeActivity, normalizeDeleted, isDeletedIn
} = require("./js/merge.js");

/* ─── mergeEntries ─────────────────────────────────────────── */

test("deux modifications concurrentes sur des KPIs différents sont toutes conservées", () => {
  const local  = [{ id: "k1", title: "modifié par Marie", _mtime: 200 },
                  { id: "k2", title: "origine",           _mtime: 100 }];
  const remote = [{ id: "k1", title: "origine",           _mtime: 100 },
                  { id: "k2", title: "modifié par Jean",  _mtime: 210 }];
  const r = mergeEntries(local, remote);
  assert.equal(r.length, 2);
  assert.equal(r.find(e => e.id === "k1").title, "modifié par Marie");
  assert.equal(r.find(e => e.id === "k2").title, "modifié par Jean");
});

test("sur un même KPI, la version la plus récente l'emporte", () => {
  const r = mergeEntries(
    [{ id: "k1", title: "récent", _mtime: 300 }],
    [{ id: "k1", title: "ancien", _mtime: 250 }]
  );
  assert.equal(r[0].title, "récent");
});

test("à égalité de date, la version locale est conservée (évite les allers-retours)", () => {
  const r = mergeEntries(
    [{ id: "k1", title: "local",  _mtime: 100 }],
    [{ id: "k1", title: "distant", _mtime: 100 }]
  );
  assert.equal(r[0].title, "local");
});

test("une fiche sans date est traitée comme la plus ancienne", () => {
  const r = mergeEntries(
    [{ id: "k1", title: "sans date" }],
    [{ id: "k1", title: "datée", _mtime: 50 }]
  );
  assert.equal(r[0].title, "datée");
});

test("la fusion converge : après échange, les deux postes ont le même état", () => {
  const a = [{ id: "x", _mtime: 1 }, { id: "z", _mtime: 5 }];
  const b = [{ id: "y", _mtime: 2 }, { id: "z", _mtime: 9 }];
  const cloud = mergeEntries(a, b);
  const key = l => l.map(e => e.id + ":" + e._mtime).sort().join(",");
  assert.equal(key(mergeEntries(a, cloud)), key(mergeEntries(b, cloud)));
});

test("les entrées invalides sont ignorées sans planter", () => {
  const r = mergeEntries([null, { titre: "sans id" }, { id: "ok" }], undefined);
  assert.equal(r.length, 1);
  assert.equal(r[0].id, "ok");
});

/* ─── mergeDeleted : suppressions et restaurations ──────────── */

test("une fiche supprimée ne ressuscite pas via la fusion", () => {
  const r = mergeDeleted([{ id: "k9", at: 500, state: "deleted" }], []);
  assert.equal(isDeletedIn(r, "k9"), true);
});

test("une restauration plus récente annule une suppression antérieure", () => {
  const r = mergeDeleted(
    [{ id: "k9", at: 800, state: "restored" }],
    [{ id: "k9", at: 400, state: "deleted" }]
  );
  assert.equal(isDeletedIn(r, "k9"), false);
});

test("une suppression plus récente l'emporte sur une restauration antérieure", () => {
  const r = mergeDeleted(
    [{ id: "k9", at: 400, state: "restored" }],
    [{ id: "k9", at: 600, state: "deleted" }]
  );
  assert.equal(isDeletedIn(r, "k9"), true);
});

test("les marqueurs de restauration sont conservés (sinon la fiche redisparaîtrait)", () => {
  const r = mergeDeleted([{ id: "k9", at: 800, state: "restored" }], []);
  assert.equal(r.length, 1, "le marqueur doit survivre à la fusion");
});

/* ─── normalizeDeleted : compatibilité ascendante ───────────── */

test("l'ancien format (tableau de chaînes) est migré sans perte", () => {
  const r = normalizeDeleted(["a", "b"]);
  assert.equal(r.length, 2);
  assert.equal(r[0].id, "a");
  assert.equal(r[0].state, "deleted");
});

test("un état existant n'est pas écrasé par la normalisation", () => {
  const r = normalizeDeleted([{ id: "a", state: "restored", at: 10 }]);
  assert.equal(r[0].state, "restored");
});

test("une valeur non tableau renvoie une liste vide", () => {
  assert.deepEqual(normalizeDeleted(null), []);
  assert.deepEqual(normalizeDeleted("nimportequoi"), []);
});

/* ─── mergeOverrides ───────────────────────────────────────── */

test("les surcharges fusionnent clé par clé", () => {
  const r = mergeOverrides(
    { k1: { title: "local", _mtime: 200 } },
    { k2: { title: "distant", _mtime: 100 } }
  );
  assert.equal(Object.keys(r).length, 2);
  assert.equal(r.k1.title, "local");
  assert.equal(r.k2.title, "distant");
});

/* ─── mergeFavorites ───────────────────────────────────────── */

test("les favoris d'un collègue ne sont pas effacés par notre envoi", () => {
  const { map } = mergeFavorites(
    { marie: ["a", "b"] }, { marie: 900 },
    { jean: ["c"], marie: ["a"] }, { jean: 800, marie: 700 }
  );
  assert.deepEqual(map.marie, ["a", "b"], "Marie garde ses favoris récents");
  assert.deepEqual(map.jean, ["c"], "Jean garde les siens");
});

test("des favoris distants plus récents remplacent les nôtres", () => {
  const { map } = mergeFavorites(
    { marie: ["ancien"] }, { marie: 100 },
    { marie: ["recent"] }, { marie: 900 }
  );
  assert.deepEqual(map.marie, ["recent"]);
});

/* ─── mergeActivity ────────────────────────────────────────── */

test("les journaux fusionnent sans doublon, plus récent d'abord", () => {
  const a = [{ at: 2, by: "marie", action: "create", title: "A" }];
  const b = [{ at: 2, by: "marie", action: "create", title: "A" },
             { at: 3, by: "luc",   action: "delete", title: "C" }];
  const r = mergeActivity(a, b, 400);
  assert.equal(r.length, 2, "le doublon exact est éliminé");
  assert.equal(r[0].title, "C", "le plus récent est en tête");
});

test("le journal est plafonné au maximum demandé", () => {
  const big = Array.from({ length: 50 }, (_, i) => ({ at: i, by: "u", action: "update", title: "T" + i }));
  assert.equal(mergeActivity(big, [], 10).length, 10);
});
