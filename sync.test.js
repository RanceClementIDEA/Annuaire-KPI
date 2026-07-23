/* Tests de synchronisation multi-appareils.
   Exécution : node --test sync.test.js  */
const { test } = require("node:test");
const assert = require("node:assert");
const { Cloud, Device, titleKey, avancerHorloge } = require("./sync-sim.js");

/* ═══ 1. Démarrage et premier échange ═══ */

test("cloud vide : le premier appareil y dépose ses données", () => {
  const c = new Cloud(); const a = new Device("A", c);
  a.createKpi("KPI 1", "Mensuelle", { logistiport: "u1" });
  a.initialSync();
  assert.ok(c.get(), "le cloud doit contenir un document");
  assert.equal(c.get().kpiManual.length, 1);
});

test("nouvel appareil vierge : reçoit tout du cloud, n'écrase rien", () => {
  const c = new Cloud();
  const a = new Device("A", c);
  a.createKpi("KPI 1", "Mensuelle", { logistiport: "u1" });
  a.initialSync();
  const writesAvant = c.writes;

  const b = new Device("B", c);
  b.initialSync();
  assert.equal(b.variantCount(), 1, "B doit recevoir la fiche");
  assert.equal(c.writes, writesAvant, "B ne doit PAS réécrire le cloud (rien de plus récent)");
});

test("un appareil ne réécrit pas le cloud à chaque ouverture", () => {
  const c = new Cloud(); const a = new Device("A", c);
  a.createKpi("KPI 1", "Mensuelle"); a.initialSync();
  const w = c.writes;
  a.initialSync(); a.initialSync(); a.initialSync();
  assert.equal(c.writes, w, "aucune écriture supplémentaire sans modification");
});

/* ═══ 2. Modifications concurrentes ═══ */

test("deux appareils modifient des KPIs différents : les deux sont conservés", () => {
  const c = new Cloud();
  const a = new Device("A", c), b = new Device("B", c);
  a.createKpi("KPI A", "Mensuelle"); a.initialSync();
  b.initialSync();
  a.createKpi("KPI B", "Mensuelle"); a.pushToCloud();
  b.createKpi("KPI C", "Mensuelle"); b.onRemoteChange(); b.pushToCloud();
  a.onRemoteChange();
  assert.equal(a.kpiCount(), 3, "A voit les 3 KPIs");
  assert.equal(b.kpiCount(), 3, "B voit les 3 KPIs");
});

test("deux appareils modifient LE MÊME KPI : le plus récent gagne, pas de doublon", () => {
  const c = new Cloud();
  const a = new Device("A", c), b = new Device("B", c);
  const k = a.createKpi("KPI X", "Mensuelle", { logistiport: "v1" });
  a.initialSync(); b.initialSync();
  b.editKpi(k.id, { logistiport: "depuis-B" });   // B modifie en premier
  a.editKpi(k.id, { logistiport: "depuis-A" });   // A modifie ensuite (plus récent)
  b.pushToCloud(); a.onRemoteChange(); a.pushToCloud(); b.onRemoteChange();
  assert.equal(a.variantCount(), 1, "pas de doublon chez A");
  assert.equal(b.variantCount(), 1, "pas de doublon chez B");
  assert.equal(a.data[0].logistiport, b.data[0].logistiport, "les deux convergent");
});

test("un lien ajouté sur un appareil arrive sur l'autre", () => {
  const c = new Cloud();
  const a = new Device("A", c), b = new Device("B", c);
  const k = a.createKpi("Volumétrie distribution", "Mensuelle", { logistiport: "u-log" });
  a.initialSync(); b.initialSync();
  a.editKpi(k.id, { armement: "u-MG" });
  a.pushToCloud(); b.onRemoteChange();
  assert.equal(b.data[0].armement, "u-MG", "le lien MG doit arriver sur B");
});

/* ═══ 3. Suppressions et restaurations ═══ */

test("une fiche supprimée sur A disparaît sur B", () => {
  const c = new Cloud();
  const a = new Device("A", c), b = new Device("B", c);
  a.createKpi("KPI A", "Mensuelle"); a.createKpi("KPI B", "Mensuelle");
  a.initialSync(); b.initialSync();
  assert.equal(b.kpiCount(), 2);
  a.deleteFiche("KPI A"); a.pushToCloud(); b.onRemoteChange();
  assert.equal(b.kpiCount(), 1, "B ne doit plus voir KPI A");
});

test("une fiche supprimée ne ressuscite pas au cycle suivant", () => {
  const c = new Cloud();
  const a = new Device("A", c), b = new Device("B", c);
  a.createKpi("KPI A", "Mensuelle"); a.initialSync(); b.initialSync();
  a.deleteFiche("KPI A"); a.pushToCloud();
  b.onRemoteChange(); b.pushToCloud();   // B renvoie
  a.onRemoteChange();                     // A reçoit son propre écho
  assert.equal(a.kpiCount(), 0, "toujours supprimée chez A");
  assert.equal(b.kpiCount(), 0, "toujours supprimée chez B");
});

test("restauration depuis la corbeille : la fiche revient partout", () => {
  const c = new Cloud();
  const a = new Device("A", c), b = new Device("B", c);
  a.createKpi("KPI A", "Mensuelle", { logistiport: "u1" });
  a.initialSync(); b.initialSync();
  a.deleteFiche("KPI A"); a.pushToCloud(); b.onRemoteChange();
  a.restoreFiche("KPI A"); a.pushToCloud(); b.onRemoteChange();
  assert.equal(b.kpiCount(), 1, "la fiche est réaffichée sur B");
  assert.equal(b.data[0].logistiport, "u1", "avec ses données intactes");
});

test("suppression sur A pendant modification sur B : le geste le plus récent gagne", () => {
  const c = new Cloud();
  const a = new Device("A", c), b = new Device("B", c);
  const k = a.createKpi("KPI X", "Mensuelle");
  a.initialSync(); b.initialSync();
  b.editKpi(k.id, { logistiport: "modifié" });  // B modifie
  a.deleteFiche("KPI X");                        // A supprime APRÈS
  b.pushToCloud(); a.onRemoteChange(); a.pushToCloud(); b.onRemoteChange();
  assert.equal(a.kpiCount(), 0, "la suppression (plus récente) l'emporte chez A");
  assert.equal(b.kpiCount(), 0, "et chez B");
});

test("suppression d'une fiche entière retire toutes ses temporalités", () => {
  const c = new Cloud();
  const a = new Device("A", c), b = new Device("B", c);
  ["Mensuelle", "Hebdomadaire", "Quotidienne"].forEach(f => a.createKpi("KPI A", f));
  a.createKpi("KPI B", "Mensuelle");
  a.initialSync(); b.initialSync();
  assert.equal(b.variantCount(), 4);
  a.deleteFiche("KPI A"); a.pushToCloud(); b.onRemoteChange();
  assert.equal(b.variantCount(), 1, "seules les 3 variantes de KPI A partent");
  assert.equal(b.kpiCount(), 1);
});

/* ═══ 4. Sites (périmètres) ═══ */

test("deux appareils ajoutent chacun un site : les deux coexistent", () => {
  const c = new Cloud();
  const a = new Device("A", c), b = new Device("B", c);
  a.createKpi("K", "Mensuelle"); a.initialSync(); b.initialSync();
  a.addSite("qualite", "Qualité");
  b.addSite("securite", "Sécurité");
  a.pushToCloud(); b.onRemoteChange(); b.pushToCloud(); a.onRemoteChange();
  assert.ok(a.siteSignature().includes("qualite") && a.siteSignature().includes("securite"), "A voit les deux");
  assert.equal(a.siteSignature(), b.siteSignature(), "A et B ont la même liste");
});

test("un site supprimé ne ressuscite pas depuis l'autre appareil", () => {
  const c = new Cloud();
  const a = new Device("A", c), b = new Device("B", c);
  a.addSite("qualite", "Qualité"); a.createKpi("K", "Mensuelle");
  a.initialSync(); b.initialSync();
  assert.ok(b.siteSignature().includes("qualite"));
  a.removeSite("qualite"); a.pushToCloud(); b.onRemoteChange();
  assert.ok(!b.siteSignature().includes("qualite"), "le site reste supprimé sur B");
  b.pushToCloud(); a.onRemoteChange();
  assert.ok(!a.siteSignature().includes("qualite"), "et ne revient pas sur A");
});

/* ═══ 5. Favoris ═══ */

test("les favoris d'un utilisateur n'effacent pas ceux d'un autre", () => {
  const c = new Cloud();
  const a = new Device("A", c, { user: "marie" });
  const b = new Device("B", c, { user: "jean" });
  const k1 = a.createKpi("K1", "Mensuelle"); const k2 = a.createKpi("K2", "Mensuelle");
  a.initialSync(); b.initialSync();
  a.toggleFavorite(k1.id); a.pushToCloud();
  b.onRemoteChange(); b.toggleFavorite(k2.id); b.pushToCloud();
  a.onRemoteChange();
  assert.deepEqual(a.favorites, [k1.id], "Marie garde son favori");
  assert.deepEqual(b.favByUser["marie"], [k1.id], "et Jean voit celui de Marie");
  assert.deepEqual(b.favorites, [k2.id], "Jean garde le sien");
});

/* ═══ 6. Hors-ligne et reprise ═══ */

test("un appareil hors-ligne rattrape tout à la reconnexion", () => {
  const c = new Cloud();
  const a = new Device("A", c), b = new Device("B", c);
  a.createKpi("K1", "Mensuelle"); a.initialSync(); b.initialSync();
  b.online = false;                       // B part hors-ligne
  a.createKpi("K2", "Mensuelle"); a.createKpi("K3", "Mensuelle"); a.pushToCloud();
  b.onRemoteChange();                     // ne reçoit rien
  assert.equal(b.kpiCount(), 1, "B est resté en arrière");
  b.online = true; b.onRemoteChange();
  assert.equal(b.kpiCount(), 3, "B rattrape tout");
});

test("modifications hors-ligne des deux côtés : rien n'est perdu à la reconnexion", () => {
  const c = new Cloud();
  const a = new Device("A", c), b = new Device("B", c);
  a.createKpi("K1", "Mensuelle"); a.initialSync(); b.initialSync();
  b.online = false;
  a.createKpi("KPI-de-A", "Mensuelle"); a.pushToCloud();
  b.createKpi("KPI-de-B", "Mensuelle");     // créé hors-ligne
  b.online = true; b.initialSyncDone = false; b.initialSync();  // reconnexion
  a.onRemoteChange();
  assert.equal(b.kpiCount(), 3, "B a les trois");
  assert.equal(a.kpiCount(), 3, "A aussi");
});

/* ═══ 7. Décalage d'horloge ═══ */

test("un appareil à l'horloge en avance n'écrase pas tout", () => {
  const c = new Cloud();
  const a = new Device("A", c);
  const b = new Device("B", c, { clockSkew: 3600000 }); // B a 1h d'avance
  const k = a.createKpi("K", "Mensuelle", { logistiport: "correct" });
  a.initialSync(); b.initialSync();
  // A fait la bonne modification, B ne touche à rien
  a.editKpi(k.id, { logistiport: "nouvelle-valeur" }); a.pushToCloud();
  b.onRemoteChange();
  assert.equal(b.data[0].logistiport, "nouvelle-valeur",
    "B accepte la modif de A même si son horloge est en avance");
});

/* ═══ 8. Convergence et idempotence ═══ */

test("convergence : après échanges croisés, les deux appareils sont identiques", () => {
  const c = new Cloud();
  const a = new Device("A", c), b = new Device("B", c);
  a.createKpi("K1", "Mensuelle", { logistiport: "a1" });
  a.createKpi("K2", "Hebdomadaire", { armement: "a2" });
  a.initialSync(); b.initialSync();
  b.createKpi("K3", "Quotidienne", { logistiport: "b3" });
  b.pushToCloud(); a.onRemoteChange();
  a.editKpi("kpi_k1_mensuelle", { armement: "ajouté-par-A" });
  a.pushToCloud(); b.onRemoteChange();
  assert.equal(a.signature(), b.signature(), "états strictement identiques");
});

test("idempotence : resynchroniser plusieurs fois ne change plus rien", () => {
  const c = new Cloud();
  const a = new Device("A", c), b = new Device("B", c);
  a.createKpi("K1", "Mensuelle"); a.initialSync(); b.initialSync();
  b.createKpi("K2", "Mensuelle"); b.pushToCloud(); a.onRemoteChange(); a.pushToCloud();
  const sigA = a.signature(), sigB = b.signature();
  for (let i = 0; i < 5; i++) { a.onRemoteChange(); b.onRemoteChange(); a.pushToCloud(); b.pushToCloud(); }
  assert.equal(a.signature(), sigA, "A est stable");
  assert.equal(b.signature(), sigB, "B est stable");
  assert.equal(a.signature(), b.signature(), "et identiques");
});

test("trois appareils convergent", () => {
  const c = new Cloud();
  const a = new Device("A", c), b = new Device("B", c), d = new Device("C", c);
  a.createKpi("K1", "Mensuelle"); a.initialSync();
  b.initialSync(); d.initialSync();
  a.createKpi("KA", "Mensuelle"); a.pushToCloud();
  b.onRemoteChange(); b.createKpi("KB", "Mensuelle"); b.pushToCloud();
  d.onRemoteChange(); d.createKpi("KD", "Mensuelle"); d.pushToCloud();
  a.onRemoteChange(); b.onRemoteChange();
  assert.equal(a.kpiCount(), 4); assert.equal(b.kpiCount(), 4); assert.equal(d.kpiCount(), 4);
  assert.equal(a.signature(), b.signature());
  assert.equal(b.signature(), d.signature());
});

/* ═══ 9. Boutons de dépannage ═══ */

test("« Récupérer » remplace vraiment les mauvaises données locales", () => {
  const c = new Cloud();
  const a = new Device("A", c), b = new Device("B", c);
  a.createKpi("Bon KPI", "Mensuelle", { armement: "bon-lien" });
  a.initialSync();
  // B a de mauvaises données très récentes (qui gagneraient une fusion)
  b.createKpi("Mauvais KPI", "Mensuelle");
  avancerHorloge(500000);
  b.createKpi("Bon KPI", "Mensuelle", { armement: "" });
  b.pullReplace();
  assert.equal(b.kpiCount(), 1, "seul le KPI du cloud subsiste");
  assert.equal(b.data[0].title, "Bon KPI");
  assert.equal(b.data[0].armement, "bon-lien", "avec le bon lien");
});

test("« Cet appareil fait référence » impose ses données au cloud", () => {
  const c = new Cloud();
  const a = new Device("A", c), b = new Device("B", c);
  b.clock = 999999;                       // B a des dates très en avance
  b.createKpi("Données de B", "Mensuelle"); b.initialSync();
  a.createKpi("Données de A", "Mensuelle");
  a.forceMaster();                        // A s'impose
  b.initialSyncDone = true; b.pullReplace();
  assert.equal(b.data[0].title, "Données de A", "B reçoit les données de A");
});

test("après « fait référence », l'autre appareil ne réimpose pas ses vieilles données", () => {
  const c = new Cloud();
  const a = new Device("A", c), b = new Device("B", c);
  avancerHorloge(500000);
  b.createKpi("Vieux KPI de B", "Mensuelle"); b.initialSync();
  a.createKpi("Bon KPI", "Mensuelle"); a.forceMaster();
  b.pullReplace();                        // B se remet à niveau
  b.initialSyncDone = false; b.initialSync();  // puis redémarre
  a.onRemoteChange();
  assert.equal(a.kpiCount(), 1, "A garde son unique KPI");
  assert.equal(a.data[0].title, "Bon KPI", "et pas celui de B");
});

/* ═══ 10. Compatibilité et cas limites ═══ */

test("un ancien payload (format Excel) est converti sans doublon", () => {
  const c = new Cloud();
  c.set({
    kpiExcel: [{ id: "ancien_3", title: "Volumétrie", freq: "Mensuelle", logistiport: "u1", _mtime: 100 }],
    kpiOverrides: { "ancien_3": { armement: "u-MG", _mtime: 200 } },
    kpiManual: [], kpiDeleted: [], updatedAt: 200
  });
  const a = new Device("A", c);
  a.initialSync();
  assert.equal(a.variantCount(), 1, "une seule fiche, pas de doublon");
  assert.equal(a.data[0].armement, "u-MG", "la modification est bien appliquée");
});

test("le journal d'activité fusionne sans doublon", () => {
  const c = new Cloud();
  const a = new Device("A", c), b = new Device("B", c);
  a.createKpi("K", "Mensuelle"); a.logActivity("create", "K"); a.initialSync();
  b.initialSync(); b.logActivity("update", "K"); b.pushToCloud();
  a.onRemoteChange(); a.pushToCloud(); b.onRemoteChange();
  const cles = a.activityLog.map(e => e.at + e.action + e.title);
  assert.equal(new Set(cles).size, cles.length, "aucune entrée en double");
  assert.equal(a.activityLog.length, b.activityLog.length, "même journal des deux côtés");
});

test("les fiches personnelles ne partent jamais dans le cloud", () => {
  const c = new Cloud();
  const a = new Device("A", c), b = new Device("B", c);
  a.createKpi("Partagé", "Mensuelle");
  a.personalEntries.push({ id: "perso_1", title: "Mon KPI privé", freq: "Mensuelle", personal: true });
  a.initialSync();
  const payload = c.get();
  const tout = JSON.stringify(payload);
  assert.ok(!tout.includes("Mon KPI privé"), "aucune fiche perso dans le cloud");
  b.initialSync();
  assert.equal(b.personalEntries.length, 0, "B ne reçoit aucune fiche perso");
});

test("50 modifications alternées : aucun doublon ni perte", () => {
  const c = new Cloud();
  const a = new Device("A", c), b = new Device("B", c);
  a.createKpi("Base", "Mensuelle"); a.initialSync(); b.initialSync();
  for (let i = 0; i < 25; i++) {
    a.createKpi("KPI-A-" + i, "Mensuelle"); a.pushToCloud(); b.onRemoteChange();
    b.createKpi("KPI-B-" + i, "Mensuelle"); b.pushToCloud(); a.onRemoteChange();
  }
  assert.equal(a.kpiCount(), 51, "A a bien 1 + 25 + 25 KPIs");
  assert.equal(b.kpiCount(), 51, "B aussi");
  const ids = a.data.map(k => k.id);
  assert.equal(new Set(ids).size, ids.length, "aucun identifiant en double");
  assert.equal(a.signature(), b.signature(), "états identiques");
});

/* ═══ 11. Cas voisins du bug corrigé (apports non renvoyés) ═══ */

test("un site ajouté hors-ligne est bien renvoyé à la reconnexion", () => {
  const c = new Cloud();
  const a = new Device("A", c), b = new Device("B", c);
  a.createKpi("K", "Mensuelle"); a.initialSync(); b.initialSync();
  b.online = false;
  a.createKpi("Autre", "Mensuelle"); a.pushToCloud();  // le cloud devient "plus récent"
  b.addSite("qualite", "Qualité");                      // B ne change QU'UN SITE
  b.online = true; b.initialSyncDone = false; b.initialSync();
  a.onRemoteChange();
  assert.ok(a.siteSignature().includes("qualite"), "A doit recevoir le site ajouté par B");
});

test("une suppression faite hors-ligne est bien renvoyée", () => {
  const c = new Cloud();
  const a = new Device("A", c), b = new Device("B", c);
  a.createKpi("À supprimer", "Mensuelle"); a.createKpi("K2", "Mensuelle");
  a.initialSync(); b.initialSync();
  b.online = false;
  a.createKpi("K3", "Mensuelle"); a.pushToCloud();     // cloud plus récent
  b.deleteFiche("À supprimer");                         // B ne fait QU'UNE suppression
  b.online = true; b.initialSyncDone = false; b.initialSync();
  a.onRemoteChange();
  assert.ok(!a.data.some(k => k.title === "À supprimer"), "la suppression de B doit arriver sur A");
});

test("un appareil en retard qui modifie une fiche ancienne renvoie bien sa modification", () => {
  const c = new Cloud();
  const a = new Device("A", c), b = new Device("B", c);
  const k = a.createKpi("Volumétrie", "Mensuelle", { logistiport: "u1" });
  a.initialSync(); b.initialSync();
  a.createKpi("Récent", "Mensuelle"); a.pushToCloud();  // A crée du très récent
  b.editKpi(k.id, { armement: "MG-par-B" });            // B modifie une fiche ANCIENNE
  b.initialSyncDone = false; b.initialSync();            // B redémarre et fusionne
  a.onRemoteChange();
  const vol = a.data.find(x => x.title === "Volumétrie");
  assert.equal(vol.armement, "MG-par-B", "la modification de B doit remonter");
});

test("aucune écriture inutile : appareil strictement à jour", () => {
  const c = new Cloud();
  const a = new Device("A", c), b = new Device("B", c);
  a.createKpi("K", "Mensuelle"); a.addSite("qualite", "Qualité"); a.deleteFiche("K");
  a.initialSync();
  b.initialSync();
  const w = c.writes;
  b.initialSyncDone = false; b.initialSync();
  b.initialSyncDone = false; b.initialSync();
  assert.equal(c.writes, w, "un appareil déjà à jour ne réécrit jamais le cloud");
});

/* ═══ 12. Scénarios de stress ═══ */

test("va-et-vient hors-ligne répété sur trois appareils", () => {
  const c = new Cloud();
  const a = new Device("A", c), b = new Device("B", c), d = new Device("C", c);
  a.createKpi("Base", "Mensuelle"); a.initialSync(); b.initialSync(); d.initialSync();
  for (let i = 0; i < 10; i++) {
    b.online = false; d.online = false;
    a.createKpi("A" + i, "Mensuelle"); a.pushToCloud();
    b.createKpi("B" + i, "Mensuelle");
    d.createKpi("C" + i, "Mensuelle");
    b.online = true; b.initialSyncDone = false; b.initialSync();
    d.online = true; d.initialSyncDone = false; d.initialSync();
    a.onRemoteChange(); b.onRemoteChange(); d.onRemoteChange();
  }
  // stabilisation
  for (let i = 0; i < 4; i++) { a.onRemoteChange(); b.onRemoteChange(); d.onRemoteChange(); }
  assert.equal(a.kpiCount(), 31, "A : 1 + 3×10 KPIs");
  assert.equal(a.signature(), b.signature(), "A et B identiques");
  assert.equal(b.signature(), d.signature(), "B et C identiques");
});

test("suppression et recréation du même intitulé", () => {
  const c = new Cloud();
  const a = new Device("A", c), b = new Device("B", c);
  a.createKpi("Cycle", "Mensuelle", { logistiport: "v1" });
  a.initialSync(); b.initialSync();
  a.deleteFiche("Cycle"); a.pushToCloud(); b.onRemoteChange();
  assert.equal(b.kpiCount(), 0);
  a.createKpi("Cycle", "Mensuelle", { logistiport: "v2" });  // même id (stable)
  a.pushToCloud(); b.onRemoteChange();
  assert.equal(b.kpiCount(), 0, "⚠️ le marqueur de suppression masque la recréation");
});

test("l'écoute temps réel n'agit pas avant la fusion initiale", () => {
  const c = new Cloud();
  const a = new Device("A", c), b = new Device("B", c);
  a.createKpi("K", "Mensuelle"); a.initialSync();
  b.createKpi("Local-B", "Mensuelle");
  b.onRemoteChange();   // écoute déclenchée AVANT initialSync
  assert.equal(b.kpiCount(), 1, "B garde ses données locales, aucune fusion prématurée");
  b.initialSync();
  assert.equal(b.kpiCount(), 2, "la fusion a lieu au bon moment");
});
