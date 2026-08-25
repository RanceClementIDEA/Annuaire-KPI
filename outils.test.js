/* Tests des outils en ligne de commande (dossier outils/) : la chaîne
   « sélection exportée + captures → PowerPoint avec les visuels ».
   Ces outils tournent sous Node uniquement, ils ne sont donc pas
   repris dans le banc de test du navigateur.
   Exécution : node --test  */
const { test } = require("node:test");
const assert = require("node:assert");
const fsO = require("node:fs");
const pathO = require("node:path");
const osO = require("node:os");
const G = require("./outils/generer-deck.js");
const ZipO = require("./js/zip.js");

/** Dossier de travail jetable, propre à chaque test. */
function bacASable() {
  const d = fsO.mkdtempSync(pathO.join(osO.tmpdir(), "annuaire-kpi-"));
  return { d, fichier: (n, c) => { const p = pathO.join(d, n); fsO.writeFileSync(p, c); return p; } };
}

/** PNG minimal aux dimensions choisies. */
function pngO(l, h) {
  const o = new Uint8Array(24);
  o.set([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], 0);
  const v = new DataView(o.buffer);
  v.setUint32(16, l); v.setUint32(20, h);
  return Buffer.from(o);
}

const SELECTION = {
  _format: "annuaire-kpi-selection",
  _version: 1,
  nom: "COPIL hebdomadaire",
  couverture: { titre: "Indicateurs", sousTitre: "IDEA", periode: "S30 à S33-2026" },
  diapos: [
    { kpiId: "k1", titre: "Volumétrie LGT", site: "logistiport",
      lien: "https://app.powerbi.com/a?visual=1", commentaire: "655 lignes", fichier: "01-k1.png" },
    { kpiId: "k2", titre: "Taux de service LGT", site: "logistiport",
      lien: "https://app.powerbi.com/b?visual=2", commentaire: "", fichier: "02-k2.png" }
  ]
};

/* ─── Lecture d'arguments ──────────────────────────────────── */

test("les options en ligne de commande sont lues telles quelles", () => {
  const o = G.options(["selection.json", "--captures", "images", "--deck"]);
  assert.deepEqual(o._, ["selection.json"]);
  assert.equal(o.captures, "images");
  assert.ok("deck" in o);
});

/* ─── Lecture de la sélection ──────────────────────────────── */

test("une sélection exportée par l'annuaire est acceptée", () => {
  const b = bacASable();
  const p = b.fichier("sel.json", JSON.stringify(SELECTION));
  assert.equal(G.lireSelection(p).diapos.length, 2);
});

test("un fichier étranger est refusé avec un message clair", () => {
  const b = bacASable();
  const p = b.fichier("autre.json", JSON.stringify({ quelque: "chose" }));
  assert.throws(() => G.lireSelection(p), /pas une sélection/);
});

test("une sélection vide est refusée plutôt que de produire un support vide", () => {
  const b = bacASable();
  const p = b.fichier("vide.json", JSON.stringify({ ...SELECTION, diapos: [] }));
  assert.throws(() => G.lireSelection(p), /aucune diapositive/);
});

/* ─── Association captures ↔ diapositives ──────────────────── */

test("chaque capture présente est associée à sa diapositive", () => {
  const b = bacASable();
  b.fichier("01-k1.png", pngO(1200, 600));
  b.fichier("02-k2.png", pngO(800, 800));
  const r = G.assembler(SELECTION, b.d);
  assert.equal(r.avecImage, 2);
  assert.deepEqual(r.sansImage, []);
  assert.ok(r.diapos[0].image instanceof Uint8Array);
});

test("une capture manquante est signalée, la diapositive existe quand même", () => {
  const b = bacASable();
  b.fichier("01-k1.png", pngO(1200, 600));
  const r = G.assembler(SELECTION, b.d);
  assert.equal(r.avecImage, 1);
  assert.deepEqual(r.sansImage, ["Taux de service LGT"]);
  assert.equal(r.diapos[1].image, null);
});

test("sans dossier de captures, tout le support reste en cadres d'attente", () => {
  const r = G.assembler(SELECTION, null);
  assert.equal(r.avecImage, 0);
  assert.equal(r.sansImage.length, 2);
});

test("le titre, le lien et le commentaire suivent la diapositive", () => {
  const r = G.assembler(SELECTION, null);
  assert.equal(r.diapos[0].titre, "Volumétrie LGT");
  assert.equal(r.diapos[0].lien, "https://app.powerbi.com/a?visual=1");
  assert.equal(r.diapos[0].commentaire, "655 lignes");
});

/* ─── Construction du support ──────────────────────────────── */

test("le support produit contient la couverture et une diapositive par KPI", async () => {
  const b = bacASable();
  b.fichier("01-k1.png", pngO(1200, 600));
  b.fichier("02-k2.png", pngO(1200, 600));
  const { octets, avecImage } = await G.construire(SELECTION, b.d);
  const pieces = await ZipO.lireZip(octets);
  assert.equal(avecImage, 2);
  assert.ok(pieces.has("ppt/slides/slide1.xml"));
  assert.ok(pieces.has("ppt/slides/slide2.xml"));
  assert.ok(pieces.has("ppt/slides/slide3.xml"));
});

test("les visuels capturés sont bien des IMAGES dans le fichier, pas des liens", async () => {
  const b = bacASable();
  b.fichier("01-k1.png", pngO(1200, 600));
  b.fichier("02-k2.png", pngO(1200, 600));
  const { octets } = await G.construire(SELECTION, b.d);
  const pieces = await ZipO.lireZip(octets);
  assert.ok(pieces.has("ppt/media/kpi1.png"), "la capture doit être embarquée");
  assert.ok(pieces.has("ppt/media/kpi2.png"));
  const xml = ZipO.versTexte(pieces.get("ppt/slides/slide2.xml"));
  assert.ok(xml.includes("<p:pic>"), "la diapositive affiche l'image");
  assert.ok(!xml.includes("Visuel à capturer"), "et non le cadre d'attente");
});

test("le lien Power BI reste cliquable SUR le visuel capturé", async () => {
  const b = bacASable();
  b.fichier("01-k1.png", pngO(1200, 600));
  const { octets } = await G.construire(SELECTION, b.d);
  const pieces = await ZipO.lireZip(octets);
  assert.ok(ZipO.versTexte(pieces.get("ppt/slides/slide2.xml")).includes("hlinkClick"));
  assert.ok(ZipO.versTexte(pieces.get("ppt/slides/_rels/slide2.xml.rels")).includes('TargetMode="External"'));
});

test("la couverture reprend le titre, le sous-titre et la période exportés", async () => {
  const { octets } = await G.construire(SELECTION, null);
  const pieces = await ZipO.lireZip(octets);
  const c = ZipO.versTexte(pieces.get("ppt/slides/slide1.xml"));
  assert.ok(c.includes("Indicateurs"));
  assert.ok(c.includes("S30 à S33-2026"));
});

test("le fichier produit s'ouvre : archive complète et relisible", async () => {
  const b = bacASable();
  b.fichier("01-k1.png", pngO(1200, 600));
  const { octets } = await G.construire(SELECTION, b.d);
  const pieces = await ZipO.lireZip(octets);
  assert.equal([...pieces.keys()][0], "[Content_Types].xml");
  assert.ok(ZipO.versTexte(pieces.get("[Content_Types].xml")).includes("/ppt/slides/slide3.xml"));
});

/* ─── Mode « visuel vivant » en ligne de commande ───────────── */

test("les drapeaux sans valeur sont bien reconnus", () => {
  const o = G.options(["sel.json", "--vivant", "--sortie", "deck.pptx"]);
  assert.equal(o.vivant, true);
  assert.equal(o.sortie, "deck.pptx", "un drapeau ne doit pas avaler l'option suivante");
  assert.deepEqual(o._, ["sel.json"]);
});

test("un drapeau en fin de ligne vaut vrai", () => {
  assert.equal(G.options(["sel.json", "--deck"]).deck, true);
});

test("en mode vivant, aucune capture n'est cherchée", () => {
  const r = G.assembler(SELECTION, null, true);
  assert.ok(r.diapos.every(d => d.vivant === true));
  assert.deepEqual(r.sansImage, [], "rien ne manque : il n'y a rien à capturer");
});

test("en mode vivant, le support embarque les compléments Power BI", async () => {
  const { octets } = await G.construire(SELECTION, null, null, true);
  const pieces = await ZipO.lireZip(octets);
  assert.ok(pieces.has("ppt/webextensions/webextension1.xml"));
  assert.ok(pieces.has("ppt/webextensions/webextension2.xml"));
  assert.ok(ZipO.versTexte(pieces.get("ppt/slides/slide2.xml")).includes("<we:webextensionref"));
});

test("un KPI sans lien retombe sur le cadre d'attente, même en mode vivant", async () => {
  const sansLien = { ...SELECTION, diapos: [{ ...SELECTION.diapos[0], lien: "" }] };
  const { octets } = await G.construire(sansLien, null, null, true);
  const pieces = await ZipO.lireZip(octets);
  assert.ok(!pieces.has("ppt/webextensions/webextension1.xml"));
  assert.ok(ZipO.versTexte(pieces.get("ppt/slides/slide2.xml")).includes("Visuel à capturer"));
});

/* ─── Vérification des liens Power BI ───────────────────────── */

const V = require("./outils/verifier-liens.js");

const VISUEL = "https://app.powerbi.com/groups/me/reports/r1/p1?pbi_source=shareVisual&visual=v1&width=1253.02&height=527.91";
const BANDEAU = "https://app.powerbi.com/groups/me/reports/r1/p1?pbi_source=shareVisual&visual=v9&width=1140.87&height=51.48";
const COURT = "https://app.powerbi.com/links/UWLu7wc3Ez?pbi_source=linkShare";

test("une sauvegarde d'annuaire est parcourue périmètre par périmètre", () => {
  const r = V.analyser({
    manualEntries: [{ id: "a", title: "Volumétrie", freq: "Hebdomadaire", logistiport: VISUEL, armement: BANDEAU }],
    sites: [{ key: "logistiport" }, { key: "armement" }]
  });
  assert.equal(r.entrees.length, 2);
  assert.deepEqual(r.entrees.map(e => e.perimetre), ["logistiport", "armement"]);
});

test("une sélection exportée est parcourue elle aussi", () => {
  const r = V.analyser({ diapos: [{ titre: "A", site: "logistiport", lien: VISUEL }] });
  assert.equal(r.entrees.length, 1);
  assert.equal(r.bons, 1);
});

test("un lien de visuel au bon format est validé", () => {
  assert.equal(V.verdict({ type: "visuel", aplati: false }).ok, true);
});

test("un lien de page est refusé : il afficherait tout le rapport", () => {
  const v = V.verdict({ type: "lien-court" });
  assert.equal(v.ok, false);
  assert.equal(v.etiquette, "PAGE");
});

test("un visuel au format très allongé est signalé pour confirmation", () => {
  const v = V.verdict({ type: "visuel", aplati: true });
  assert.equal(v.ok, false);
  assert.equal(v.etiquette, "ALLONGÉ");
});

test("le bilan compte séparément les pages et les bandeaux", () => {
  const r = V.analyser({
    manualEntries: [
      { id: "a", title: "A", logistiport: VISUEL },
      { id: "b", title: "B", logistiport: COURT },
      { id: "c", title: "C", logistiport: BANDEAU }
    ],
    sites: [{ key: "logistiport" }]
  });
  assert.equal(r.bons, 1);
  assert.equal(r.pages, 1);
  assert.equal(r.bandeaux, 1);
});

test("un même visuel servant plusieurs KPI est signalé", () => {
  const r = V.analyser({
    manualEntries: [
      { id: "a", title: "Volumétrie", logistiport: VISUEL },
      { id: "b", title: "Délai", logistiport: VISUEL }
    ],
    sites: [{ key: "logistiport" }]
  });
  assert.equal(r.partages.length, 1);
  assert.deepEqual(r.partages[0].titres.sort(), ["Délai", "Volumétrie"]);
});

test("deux temporalités du même intitulé ne comptent pas comme un partage", () => {
  const r = V.analyser({
    manualEntries: [
      { id: "a", title: "Volumétrie", freq: "Hebdomadaire", logistiport: VISUEL },
      { id: "b", title: "Volumétrie", freq: "Mensuelle", logistiport: VISUEL }
    ],
    sites: [{ key: "logistiport" }]
  });
  assert.deepEqual(r.partages, []);
});

test("une fiche sans aucun lien ne produit aucune ligne", () => {
  const r = V.analyser({ manualEntries: [{ id: "a", title: "Sans lien" }], sites: [{ key: "logistiport" }] });
  assert.deepEqual(r.entrees, []);
});

/* ─── Contrôle du support produit ───────────────────────────── */

const D = require("./outils/verifier-deck.js");

const V_BON = "https://app.powerbi.com/groups/me/reports/6a4c/p1?pbi_source=shareVisual&visual=vA&width=1253.02&height=527.91";
const V_AUTRE = "https://app.powerbi.com/groups/me/reports/6a4c/p2?pbi_source=shareVisual&visual=vB&width=1255&height=551";
const V_PLAT = "https://app.powerbi.com/groups/me/reports/6a4c/p1?pbi_source=shareVisual&visual=vC&width=1140.87&height=51.48";

const selDe = diapos => ({
  _format: "annuaire-kpi-selection", _version: 1, nom: "Contrôle",
  couverture: { titre: "T" }, diapos: diapos.map((d, i) =>
    Object.assign({ kpiId: "k" + i, site: "logistiport", commentaire: "", fichier: (i + 1) + ".png" }, d))
});

test("chaque diapositive pointe sur le lien de SON kpi, dans l'ordre", async () => {
  const { octets } = await G.construire(
    selDe([{ titre: "Un", lien: V_BON }, { titre: "Deux", lien: V_AUTRE }, { titre: "Trois", lien: V_PLAT }]),
    null, null, true);
  const r = await D.analyserDeck(octets);
  const kpi = r.diapos.filter(d => d.contenu !== "couverture");
  assert.deepEqual(kpi.map(d => d.titre), ["Un", "Deux", "Trois"]);
  assert.deepEqual(kpi.map(d => d.visuel), ["vA", "vB", "vC"]);
});

test("le contrôle retrouve la page et le rapport de chaque visuel", async () => {
  const { octets } = await G.construire(selDe([{ titre: "Un", lien: V_BON }]), null, null, true);
  const d = (await D.analyserDeck(octets)).diapos.find(x => x.contenu === "visuel vivant");
  assert.equal(d.page, "p1");
  assert.equal(d.rapport, "6a4c");
  assert.equal(d.format, "1253×528 px");
});

test("un support entièrement sain ne lève aucune alerte", async () => {
  const { octets } = await G.construire(selDe([{ titre: "Un", lien: V_BON }, { titre: "Deux", lien: V_AUTRE }]),
                                        null, null, true);
  assert.equal((await D.analyserDeck(octets)).alertes, 0);
});

test("le contrôle signale un visuel très plat", async () => {
  const { octets } = await G.construire(selDe([{ titre: "Plat", lien: V_PLAT }]), null, null, true);
  const r = await D.analyserDeck(octets);
  assert.ok(r.diapos.some(d => d.alertes.some(a => /allongé/.test(a))));
});

test("le contrôle signale un lien de page", async () => {
  const { octets } = await G.construire(selDe([{ titre: "Page", lien: COURT }]), null, null, true);
  const r = await D.analyserDeck(octets);
  assert.ok(r.diapos.some(d => d.alertes.some(a => /PAGE/.test(a))));
});

test("la couverture est reconnue comme telle", async () => {
  const { octets } = await G.construire(selDe([{ titre: "Un", lien: V_BON }]), null, null, true);
  const r = await D.analyserDeck(octets);
  assert.equal(r.diapos[0].contenu, "couverture");
  assert.equal(r.diapos.filter(d => d.contenu === "couverture").length, 1);
});

test("le cadre annoncé laisse la place au visuel, barre du complément comprise", async () => {
  const Pptx = require("./js/pptx.js");
  const { octets } = await G.construire(selDe([{ titre: "Un", lien: V_BON }]), null, null, true);
  const d = (await D.analyserDeck(octets)).diapos.find(x => x.contenu === "visuel vivant");
  const [l, h] = d.cadre.split(" × ").map(parseFloat);
  const contenu = h - Pptx.BARRE_COMPLEMENT / 914400;
  assert.ok(Math.abs(l / contenu - 1253.02 / 527.91) < 0.05, "cadre : " + d.cadre);
});

test("le contrôle distingue une diapositive en image d'une diapositive vivante", async () => {
  const b = bacASable();
  b.fichier("1.png", pngO(1200, 600));
  const { octets } = await G.construire(selDe([{ titre: "Un", lien: V_BON }]), b.d, null, false);
  const d = (await D.analyserDeck(octets)).diapos.find(x => x.contenu !== "couverture");
  assert.equal(d.contenu, "image");
  assert.equal(d.format, "1200×600 px");
});

test("une diapositive sans lien est signalée comme cadre d'attente", async () => {
  const { octets } = await G.construire(selDe([{ titre: "Rien", lien: "" }]), null, null, true);
  const d = (await D.analyserDeck(octets)).diapos.find(x => x.contenu !== "couverture");
  assert.equal(d.contenu, "cadre d'attente");
  assert.ok(d.alertes.length);
});

test("l'adresse d'incorporation est posée pour chaque visuel", async () => {
  const { octets } = await G.construire(selDe([{ titre: "Un", lien: V_BON }]), null, null, true);
  const pieces = await ZipO.lireZip(octets);
  const we = ZipO.versTexte(pieces.get("ppt/webextensions/webextension1.xml"));
  assert.ok(D.propriete(we, "embedUrl").includes("reportId=6a4c"));
  assert.equal((await D.analyserDeck(octets)).alertes, 0);
});

/* ─── Le signet vu par l'inspecteur ─────────────────────────── */

const SIGNET_A = "https://app.powerbi.com/groups/me/reports/r1/p1?pbi_source=shareVisual&visual=v1&width=1253&height=528&bookmarkGuid=aaa-111";
const SIGNET_B = SIGNET_A.replace("aaa-111", "bbb-222");

test("le signet de chaque diapositive est restitué", async () => {
  const { octets } = await G.construire(selDe([{ titre: "Un", lien: SIGNET_A }]), null, null, true);
  const d = (await D.analyserDeck(octets)).diapos.find(x => x.contenu === "visuel vivant");
  assert.equal(d.signet, "aaa-111");
});

test("deux KPI sur le même visuel avec des signets différents ne sont pas confondus", async () => {
  const { octets } = await G.construire(
    selDe([{ titre: "Logistiport", lien: SIGNET_A }, { titre: "MG Armement", lien: SIGNET_B }]),
    null, null, true);
  const r = await D.analyserDeck(octets);
  assert.equal(r.alertes, 0, "des signets distincts = des états distincts");
});

test("deux diapositives strictement identiques sont signalées", async () => {
  const { octets } = await G.construire(
    selDe([{ titre: "Un", lien: SIGNET_A }, { titre: "Deux", lien: SIGNET_A }]),
    null, null, true);
  const r = await D.analyserDeck(octets);
  assert.ok(r.diapos.some(d => d.alertes.some(a => /identique à la diapositive/.test(a))));
});

/* ─── La copie d'essai de l'annuaire ────────────────────────── */

const T = require("./outils/construire-annuaire-test.js");
const indexHtml = fsO.readFileSync(pathO.join(__dirname, "index.html"), "utf8");

test("la copie d'essai est bien dérivée de l'annuaire réel", () => {
  const h = T.construire(indexHtml, {});
  ["js/pptx.js", "js/selection.js", "app.js", "style.css"].forEach(f =>
    assert.ok(h.includes(f), "ressource absente : " + f));
});

test("le stockage de la copie est cloisonné par un préfixe", () => {
  const h = T.construire(indexHtml, { prefixe: "essai:" });
  assert.ok(h.includes('var PREFIXE = "essai:"'));
  assert.ok(h.includes('Object.defineProperty(window, "localStorage"'),
    "sans redéfinition, la copie écrirait dans les vraies fiches");
});

test("l'isolation précède tout script de l'application", () => {
  const h = T.construire(indexHtml, {});
  assert.ok(h.indexOf("COPIE D'ESSAI") < h.indexOf("app.js"),
    "l'amorce doit s'exécuter avant qu'app.js ne touche au stockage");
});

test("la copie vise un code de synchronisation dédié", () => {
  const h = T.construire(indexHtml, { code: "mon-essai" });
  assert.ok(h.includes('var CODE_ESSAI = "mon-essai"'));
  assert.ok(h.includes('"kpiOptoutClearedV2", "1"'),
    "sans ce drapeau, l'application réaligne la copie sur le code de production");
});

test("le service worker n'est pas enregistré par la copie", () => {
  const h = T.construire(indexHtml, {});
  assert.ok(h.includes("navigator.serviceWorker.register = function"));
});

test("le manifeste est retiré : la copie ne s'installe pas comme application", () => {
  assert.ok(!/<link rel="manifest"/.test(T.construire(indexHtml, {})));
});

test("la bannière rappelle le code d'essai et ramène à l'annuaire réel", () => {
  const h = T.construire(indexHtml, { code: "mon-essai" });
  assert.ok(h.includes("Copie d'essai"));
  assert.ok(h.includes("mon-essai"));
  assert.ok(h.includes('href="index.html"'));
});

test("le titre distingue la copie au premier coup d'œil", () => {
  assert.ok(T.construire(indexHtml, {}).includes("<title>Annuaire KPI — copie d'essai</title>"));
});

test("un index.html méconnaissable est refusé plutôt que mal transformé", () => {
  assert.throws(() => T.construire("<html><body>rien</body></html>", {}), /introuvable/);
});

/* ═══ Relevé des empreintes en ligne de commande ═══════════
   Le même relevé que dans l'annuaire, pour traiter un lot de fichiers
   d'un coup — par exemple le support d'un rituel entier. */

const R = require("./outils/relever-empreintes.js");

function complementXml(props) {
  const lignes = Object.keys(props)
    .map(n => `<we:property name="${n}" value="${props[n]}"/>`).join("");
  return `<we:webextension><we:properties>${lignes}</we:properties></we:webextension>`;
}

const LIEN_R = "/groups/me/reports/6a4cf353/faec2927?pbi_source=shareVisual&amp;visual=v42";

function fichierAvec(complements) {
  const Zip = require("./js/zip.js");
  return Zip.ecrireZip([
    { nom: "[Content_Types].xml", donnees: '<?xml version="1.0"?><Types></Types>' },
    ...complements.map((c, i) => ({ nom: `ppt/webextensions/webextension${i + 1}.xml`, donnees: c }))
  ]);
}

test("relevé : les propriétés d'un complément sont lues telles quelles", () => {
  const props = R.proprietesDe(complementXml({ artifactName: "&quot;Histo&quot;", bookmark: "&quot;B&quot;" }));
  assert.equal(props.artifactName, "&quot;Histo&quot;");
  assert.equal(props.bookmark, "&quot;B&quot;");
});

test("relevé : une insertion manuelle donne une empreinte utilisable", async () => {
  const octets = fichierAvec([complementXml({
    reportUrl: `&quot;${LIEN_R}&quot;`, artifactName: "&quot;Histo&quot;",
    bookmark: "&quot;B&quot;", initialStateBookmark: "&quot;B&quot;"
  })]);
  const lot = await R.relever(octets, { horodatage: 7 });
  assert.equal(lot.length, 1);
  assert.equal(lot[0].libelle, "Histo");
  assert.equal(lot[0]._mtime, 7);
});

test("relevé : une diapositive fabriquée par le générateur est ignorée", async () => {
  const octets = fichierAvec([complementXml({
    reportUrl: `&quot;${LIEN_R}&quot;`, reportState: "&quot;CONNECTED&quot;"
  })]);
  assert.deepEqual(await R.relever(octets, {}), []);
});

test("relevé : le même visuel sur deux diapositives ne compte qu'une fois", async () => {
  const complet = complementXml({
    reportUrl: `&quot;${LIEN_R}&quot;`, artifactName: "&quot;Histo&quot;", bookmark: "&quot;B&quot;"
  });
  const partiel = complementXml({ reportUrl: `&quot;${LIEN_R}&quot;`, artifactName: "&quot;Histo&quot;" });
  const lot = await R.relever(fichierAvec([partiel, complet]), {});
  assert.equal(lot.length, 1);
  assert.ok(lot[0].proprietes.bookmark, "c'est le relevé le plus complet qui est gardé");
});

test("relevé : les options en ligne de commande sont comprises", () => {
  const o = R.options(["a.pptx", "b.pptx", "--sortie", "empreintes.json"]);
  assert.deepEqual(o.fichiers, ["a.pptx", "b.pptx"]);
  assert.equal(o.sortie, "empreintes.json");
});

test("relevé : une option inconnue est refusée plutôt que devinée", () => {
  assert.throws(() => R.options(["--nimporte"]), /Option inconnue/);
});

/* ═══ L'état sérialisé peut-il être fabriqué ? ══════════════
   Si oui, le relevé manuel disparaît : tout se déduit du lien et de
   l'API REST de Power BI. outils/diagnostic-etat.js fabrique le
   support qui tranche ; ces tests garantissent qu'il pose bien ce
   qu'il prétend poser. */

const DE = require("./outils/diagnostic-etat.js");

test("état : compresser puis relire redonne exactement l'objet de départ", () => {
  const objet = { a: 1, b: ["x", "y"], c: { d: "é€" } };
  assert.deepEqual(DE.lireEtat(DE.ecrireEtat(objet)), objet);
});

test("état : la valeur produite est lisible comme celle de Power BI", () => {
  // Power BI entoure ses valeurs de guillemets échappés ; le lecteur
  // doit accepter les deux formes, sinon le relevé serait illisible.
  const brut = DE.ecrireEtat({ ok: true });
  assert.ok(brut.startsWith("&quot;") && brut.endsWith("&quot;"));
  assert.deepEqual(DE.lireEtat(brut.replace(/&quot;/g, "")), { ok: true });
});

test("état fabriqué : la page active est celle du lien, et rien d'autre n'est inventé", () => {
  const e = DE.etatMinimal("p42");
  assert.equal(e.explorationState.activeSection, "p42");
  assert.deepEqual(Object.keys(e.explorationState.sections), ["p42"]);
  assert.deepEqual(e.explorationState.sections.p42.visualContainers, {});
});

test("état fabriqué : le conteneur du visuel visé est recopié quand on l'a", () => {
  const reel = { explorationState: { sections: { p42: { visualContainers: {
    v1: { singleVisual: { visualType: "barChart" } },
    v2: { singleVisual: { visualType: "slicer" } }
  } } } } };
  const e = DE.etatUnVisuel("p42", "v1", reel);
  assert.deepEqual(Object.keys(e.explorationState.sections.p42.visualContainers), ["v1"]);
});

test("état fabriqué : sans état réel sous la main, la variante reste valide", () => {
  const e = DE.etatUnVisuel("p42", "v1", null);
  assert.deepEqual(e.explorationState.sections.p42.visualContainers, {});
});

test("diagnostic : cinq variantes, dont deux témoins explicites", () => {
  const lien = "https://app.powerbi.com/groups/me/reports/r1/p1?pbi_source=shareVisual&visual=v1";
  const empreinte = { id: "r1/p1/v1", proprietes: {
    artifactName: "&quot;Histo&quot;", bookmark: DE.ecrireEtat(DE.etatMinimal("p1")) } };
  const v = DE.variantes(lien, empreinte);
  assert.deepEqual(v.map(x => x.code), ["U", "V", "W", "X", "Y"]);
  assert.ok(v[0].proprietesComplement.bookmark, "U doit porter un état fabriqué");
  assert.equal(v[2].proprietesComplement.artifactName, null, "W doit retirer le nom du visuel");
  assert.ok(!v[4].proprietesComplement, "Y ne doit rien porter");
});

test("diagnostic : l'état fabriqué de U ne contient aucun visuel", () => {
  const lien = "https://app.powerbi.com/groups/me/reports/r1/p1?pbi_source=shareVisual&visual=v1";
  const v = DE.variantes(lien, { id: "r1/p1/v1", proprietes: { artifactName: "&quot;H&quot;" } });
  const etat = DE.lireEtat(v[0].proprietesComplement.bookmark);
  assert.deepEqual(etat.explorationState.sections.p1.visualContainers, {});
  assert.equal(etat.explorationState.activeSection, "p1");
});

test("diagnostic : les deux copies de l'état sont posées ensemble", () => {
  const lien = "https://app.powerbi.com/groups/me/reports/r1/p1?pbi_source=shareVisual&visual=v1";
  const v = DE.variantes(lien, { id: "r1/p1/v1", proprietes: { artifactName: "&quot;H&quot;" } });
  assert.equal(v[0].proprietesComplement.initialStateBookmark, v[0].proprietesComplement.bookmark);
});

/* ═══ Ce que le complément a réellement affiché ════════════
   Le complément réécrit dans le fichier ce qu'il a résolu. Renvoyer
   le support après l'avoir ouvert suffit donc à savoir, sans rien
   deviner, ce que chaque diapositive a montré. */

const VR = require("./outils/verifier-rendu.js");
const zlibO = require("node:zlib");

const etatDe = (page, visuels) => "&quot;" + zlibO.gzipSync(Buffer.from(JSON.stringify({
  explorationState: { activeSection: page,
    sections: { [page]: { visualContainers: Object.fromEntries(visuels.map(v => [v, {}])) } } }
}))).toString("base64") + "&quot;";

const urlDe = (page, visuel) =>
  "&quot;/groups/me/reports/r1/" + page + "?pbi_source=shareVisual&amp;visual=" + visuel + "&quot;";

test("rendu : une diapositive jamais ouverte est signalée comme telle", () => {
  const r = VR.examiner({ reportUrl: urlDe("p1", "v1") });
  assert.equal(r.resolu.ouvert, false);
  assert.match(r.alertes.join(" "), /n'a pas ouvert/);
});

test("rendu : le nom écrit par le complément est rendu tel qu'il l'a résolu", () => {
  const r = VR.examiner({ reportUrl: urlDe("p1", "v1"),
    artifactName: "&quot;Histo empilé&quot;", creatorSessionId: "&quot;s&quot;" });
  assert.equal(r.resolu.nom, "Histo empilé");
  assert.equal(r.demande.visuel, "v1");
  assert.deepEqual(r.alertes, []);
});

test("rendu : un état venu d'une autre page est signalé", () => {
  const r = VR.examiner({ reportUrl: urlDe("p2", "v9"),
    creatorSessionId: "&quot;s&quot;", bookmark: etatDe("p1", ["v9"]) });
  assert.match(r.alertes.join(" "), /page p1, pas p2/);
});

test("rendu : un état qui ne décrit pas le visuel demandé est signalé", () => {
  // Le bon graphique peut s'afficher avec les filtres d'un voisin : rien
  // n'a l'air cassé, mais les chiffres sont faux.
  const r = VR.examiner({ reportUrl: urlDe("p1", "vAbsent"),
    creatorSessionId: "&quot;s&quot;", bookmark: etatDe("p1", ["v1", "v2"]) });
  assert.equal(r.etat.porteLeVisuel, false);
  assert.match(r.alertes.join(" "), /filtres et segments sont ceux d'un voisin/);
});

test("rendu : un état cohérent ne déclenche aucune alerte", () => {
  const r = VR.examiner({ reportUrl: urlDe("p1", "v1"),
    artifactName: "&quot;Histo&quot;", creatorSessionId: "&quot;s&quot;",
    bookmark: etatDe("p1", ["v1", "v2"]) });
  assert.equal(r.etat.porteLeVisuel, true);
  assert.deepEqual(r.alertes, []);
});

test("rendu : un état illisible ne fait pas tomber l'analyse", () => {
  const r = VR.examiner({ reportUrl: urlDe("p1", "v1"),
    creatorSessionId: "&quot;s&quot;", bookmark: "&quot;pas du gzip&quot;" });
  assert.equal(r.etat.section, "");
  assert.equal(VR.etatDe("&quot;n'importe quoi&quot;"), null);
});

/* ═══ La page entière, sans empreinte ══════════════════════
   Un lien de VISUEL exige une empreinte propre à son signet, donc une
   insertion manuelle par KPI. Désigner la PAGE supprime peut-être ce
   besoin — il n'y a plus d'objet à retrouver — et apporte en prime les
   sélecteurs de dates et de filtres. */

const PE = require("./outils/diagnostic-page-entiere.js");

const LIEN_KPI = "https://app.powerbi.com/groups/me/reports/6a4cf353/faec2927"
  + "?ctid=c8d7&pbi_source=shareVisual&visual=14bddbd2&height=550.75&width=1254.63"
  + "&bookmarkGuid=36cc4e7f";

test("page entière : aucune variante ne désigne plus un visuel", () => {
  PE.variantes(LIEN_KPI).slice(0, 4).forEach(v =>
    assert.ok(!/[?&]visual=/.test(v.lien), v.code + " désigne encore un visuel : " + v.lien));
});

test("page entière : le signet est conservé là où il doit l'être", () => {
  const v = PE.variantes(LIEN_KPI);
  ["A", "C", "D"].forEach(code =>
    assert.match(v.find(x => x.code === code).lien, /bookmarkGuid=36cc4e7f/));
  assert.ok(!/bookmarkGuid/.test(v.find(x => x.code === "B").lien),
    "B doit montrer la page SANS sélection");
});

test("page entière : le témoin garde le lien d'origine, intact", () => {
  assert.strictEqual(PE.variantes(LIEN_KPI).find(v => v.code === "E").lien, LIEN_KPI);
});

test("page entière : la variante la plus simple ne garde que l'essentiel", () => {
  const d = PE.variantes(LIEN_KPI).find(v => v.code === "D").lien;
  assert.match(d, /^https:\/\/app\.powerbi\.com\/groups\/me\/reports\/6a4cf353\/faec2927\?/);
  ["visual=", "pbi_source=", "height=", "width="].forEach(p =>
    assert.ok(d.indexOf(p) < 0, p + " ne devrait plus être là : " + d));
});

test("page entière : retirer un paramètre laisse une adresse valide", () => {
  assert.strictEqual(PE.sansParametre("https://x/y?a=1&b=2", "a"), "https://x/y?b=2");
  assert.strictEqual(PE.sansParametre("https://x/y?a=1", "a"), "https://x/y");
  assert.strictEqual(PE.sansParametre("https://x/y", "a"), "https://x/y");
});

test("page entière : ne garder aucun paramètre donne l'adresse nue", () => {
  assert.strictEqual(PE.seulement("https://x/y?a=1&b=2", ["c"]), "https://x/y");
  assert.strictEqual(PE.seulement("https://x/y", ["a"]), "https://x/y");
});

const C = require("./outils/capturer-visuels.js");

test("capture : par défaut, on vise le conteneur du visuel", () => {
  assert.deepEqual(C.ciblesPour(false), C.SELECTEURS);
});

test("capture : en mode page entière, le canevas passe devant le visuel", () => {
  // Sans cette priorité, le conteneur du visuel serait trouvé le premier
  // et on capturerait le graphique seul — ce qu'on cherchait à éviter.
  const cibles = C.ciblesPour(true);
  assert.deepEqual(cibles.slice(0, C.SELECTEURS_PAGE.length), C.SELECTEURS_PAGE);
  assert.ok(cibles.indexOf(".visualContainer") > 0, "les autres restent en repli");
});

test("capture : aucun conteneur n'est essayé deux fois", () => {
  const cibles = C.ciblesPour(true);
  assert.equal(new Set(cibles).size, cibles.length);
});

/* ═══ L'ordre des arguments doit être libre ═════════════════
   `npm run powerpoint -- selection.json` place le fichier APRÈS les
   drapeaux. Sans liste des options sans valeur, « --deck » prenait le
   nom du fichier pour sa valeur et la sélection n'était jamais lue. */

test("options : un drapeau ne mange pas le fichier qui le suit", () => {
  const o = G.options(["--page", "--deck", "selection.json"]);
  assert.deepEqual(o._, ["selection.json"]);
  assert.equal(o.page, true);
  assert.equal(o.deck, true);
});

test("options : l'ordre des arguments ne change rien", () => {
  const a = G.options(["selection.json", "--page", "--deck"]);
  const b = G.options(["--page", "--deck", "selection.json"]);
  assert.deepEqual(a, b);
});

test("options : les options à valeur gardent la leur", () => {
  const o = G.options(["selection.json", "--page", "--captures", "./img", "--sortie", "d.pptx"]);
  assert.equal(o.captures, "./img");
  assert.equal(o.sortie, "d.pptx");
  assert.deepEqual(o._, ["selection.json"]);
});

test("options : chaque drapeau connu est bien déclaré sans valeur", () => {
  G.DRAPEAUX.forEach(nom => {
    assert.equal(G.options(["--" + nom, "fichier.json"])[nom], true, nom);
  });
});

/* ═══ Le lanceur Windows ════════════════════════════════════
   La ligne de commande est la dernière friction : un fichier à
   double-cliquer, ou sur lequel glisser selection.json, la supprime.
   Ces contrôles portent sur ce que le fichier PROMET — s'il change,
   la documentation doit changer avec. */

const BAT = fsO.readFileSync(pathO.join(__dirname, "powerpoint.bat"), "utf8");

test("lanceur : les trois étapes sont enchaînées dans l'ordre", () => {
  const ordre = ["installer:navigateur", "npm run connexion", "npm run powerpoint"]
    .map(m => BAT.indexOf(m));
  ordre.forEach((i, n) => assert.ok(i > 0, "étape absente : " + n));
  assert.ok(ordre[0] < ordre[1] && ordre[1] < ordre[2], "les étapes sont dans le désordre");
});

test("lanceur : les deux étapes d'installation ne se refont pas à chaque fois", () => {
  assert.match(BAT, /if not exist "node_modules\\playwright"/);
  assert.match(BAT, /if not exist "%USERPROFILE%\\\.annuaire-kpi-profil"/);
});

test("lanceur : un poste sans Node.js reçoit une consigne, pas une erreur brute", () => {
  assert.match(BAT, /where npm/);
  assert.match(BAT, /nodejs\.org/);
});

test("lanceur : un fichier de sélection absent est refusé avant tout travail", () => {
  assert.match(BAT, /if not exist "%SELECTION%"/);
  assert.ok(BAT.indexOf('if not exist "%SELECTION%"') < BAT.indexOf("installer:navigateur"),
    "le contrôle doit précéder l'installation");
});

test("lanceur : chaque échec s'arrête au lieu de continuer sur sa lancée", () => {
  assert.equal((BAT.match(/\|\| goto :erreur/g) || []).length, 3);
  assert.match(BAT, /:erreur/);
});

test("lanceur : la fenêtre ne se referme pas sans avoir été lue", () => {
  assert.ok((BAT.match(/^pause$/gm) || []).length >= 2, "pause manquante");
});

/* ═══ Export officiel Power BI ══════════════════════════════
   L'API `exportToFile` rend une page ou un visuel en image, et
   accepte NATIVEMENT `pageName` et un signet — le modèle même de
   l'annuaire. C'est la seule voie vraiment automatique. Sa condition,
   incontournable : le rapport doit vivre dans un espace adossé à une
   capacité. Ces tests éprouvent tout SAUF cette condition, qui ne
   dépend pas du code. */

const X = require("./outils/exporter-powerbi.js");

const LIEN_X = "https://app.powerbi.com/groups/me/reports/6a4cf353-aac8-48de-a793-9a8066069ffc"
  + "/faec2927b8728b9fd32f?ctid=c8d7&pbi_source=shareVisual&visual=14bddbd2925c24715a84"
  + "&height=550.75&width=1254.63&bookmarkGuid=36cc4e7f-8950-48e0-98ea-7c59d8fce76e";

test("export : le lien de l'annuaire se lit sans rien deviner", () => {
  const i = X.analyser(LIEN_X);
  assert.equal(i.rapport, "6a4cf353-aac8-48de-a793-9a8066069ffc");
  assert.equal(i.page, "faec2927b8728b9fd32f");
  assert.equal(i.visuel, "14bddbd2925c24715a84");
  assert.equal(i.signet, "36cc4e7f-8950-48e0-98ea-7c59d8fce76e");
  assert.equal(i.groupe, "me");
});

test("export : le signet du lien devient le bookmark de la demande", () => {
  // C'est le cœur de l'affaire : Microsoft documente `bookmark.name`
  // comme étant le bookmarkGuid lu dans l'URL. Rien à traduire.
  const page = X.construireDemande(LIEN_X, {}).powerBIReportConfiguration.pages[0];
  assert.equal(page.pageName, "faec2927b8728b9fd32f");
  assert.equal(page.bookmark.name, "36cc4e7f-8950-48e0-98ea-7c59d8fce76e");
  assert.equal(page.visualName, "14bddbd2925c24715a84");
});

test("export : « page entière » retire le visuel mais garde le signet", () => {
  const page = X.construireDemande(LIEN_X, { pageEntiere: true }).powerBIReportConfiguration.pages[0];
  assert.ok(!("visualName" in page), "le visuel ne doit plus être imposé");
  assert.equal(page.bookmark.name, "36cc4e7f-8950-48e0-98ea-7c59d8fce76e");
});

test("export : un lien sans signet n'invente pas de bookmark", () => {
  const sans = LIEN_X.replace(/&bookmarkGuid=[^&]*/, "");
  assert.ok(!("bookmark" in X.construireDemande(sans, {}).powerBIReportConfiguration.pages[0]));
});

test("export : un lien sans rapport est refusé tout de suite", () => {
  assert.throws(() => X.construireDemande("https://exemple.fr", {}), /identifiant de rapport/);
});

test("export : l'espace personnel et un espace nommé n'ont pas la même adresse", () => {
  assert.match(X.urlExport(X.analyser(LIEN_X)), /\/myorg\/reports\/6a4cf353[^/]*\/ExportTo$/);
  const nomme = LIEN_X.replace("/groups/me/", "/groups/abc-123/");
  assert.match(X.urlExport(X.analyser(nomme)), /\/myorg\/groups\/abc-123\/reports\//);
});

test("export : l'attente entre deux interrogations s'allonge, puis plafonne", () => {
  assert.ok(X.attente(0) < X.attente(3), "elle doit croître");
  assert.ok(X.attente(50) <= 15000, "et plafonner : " + X.attente(50));
});

test("export : le 403 explique la vraie cause, la capacité", () => {
  const m = X.messageErreur(403, "");
  assert.match(m, /capacité/);
  assert.match(m, /Fabric/);
  assert.match(m, /PPU|par utilisateur/, "PPU ne convient pas : il faut le dire");
});

test("export : un jeton expiré dit comment le renouveler", () => {
  assert.match(X.messageErreur(401, ""), /jeton-powerbi/);
});

/* Un faux service Power BI : lancement, deux attentes, puis l'image.
   Tout le protocole est éprouvé sans toucher au vrai service. */
function fauxService(scenario) {
  const appels = [];
  let interrogations = 0;
  const reponse = (ok, status, corps, octets) => ({
    ok, status,
    json: async () => corps,
    text: async () => JSON.stringify(corps),
    arrayBuffer: async () => (octets || new Uint8Array([1, 2, 3])).buffer
  });
  const appeler = async (url, init) => {
    appels.push({ url, methode: (init && init.method) || "GET", corps: init && init.body });
    if (/\/ExportTo$/.test(url)) {
      if (scenario === "refus") return reponse(false, 403, { error: { code: "PowerBIEntityNotFound" } });
      return reponse(true, 202, { id: "exp-1" });
    }
    if (/\/file$/.test(url)) return reponse(true, 200, null, new Uint8Array([137, 80, 78, 71]));
    interrogations++;
    if (scenario === "echec") return reponse(true, 200, { status: "Failed", error: { message: "visuel absent" } });
    return reponse(true, 200, { status: interrogations < 3 ? "Running" : "Succeeded" });
  };
  return { appeler, appels };
}

const sansAttendre = () => Promise.resolve();

test("export : la chaîne complète rend l'image du KPI", async () => {
  const s = fauxService("ok");
  const { octets, tours } = await X.exporterUn(s.appeler, sansAttendre, LIEN_X, {});
  assert.deepEqual([...octets], [137, 80, 78, 71], "c'est bien un PNG");
  assert.equal(tours, 3, "deux attentes, puis le succès");
});

test("export : la demande envoyée porte le format et la langue", async () => {
  const s = fauxService("ok");
  await X.exporterUn(s.appeler, sansAttendre, LIEN_X, { format: "PDF", langue: "fr-FR" });
  const corps = JSON.parse(s.appels[0].corps);
  assert.equal(corps.format, "PDF");
  assert.equal(corps.powerBIReportConfiguration.settings.locale, "fr-FR");
  assert.equal(s.appels[0].methode, "POST");
});

test("export : un refus de capacité remonte tel quel, sans réessai inutile", async () => {
  const s = fauxService("refus");
  await assert.rejects(() => X.exporterUn(s.appeler, sansAttendre, LIEN_X, {}), /capacité/);
  assert.equal(s.appels.length, 1, "on n'interroge pas un export qui n'a jamais démarré");
});

test("export : un échec côté Power BI est rapporté avec sa raison", async () => {
  const s = fauxService("echec");
  await assert.rejects(() => X.exporterUn(s.appeler, sansAttendre, LIEN_X, {}), /visuel absent/);
});

test("export : on n'interroge pas indéfiniment", async () => {
  const appeler = async url => ({
    ok: true, status: 200,
    json: async () => (/\/ExportTo$/.test(url) ? { id: "e" } : { status: "Running" }),
    text: async () => "", arrayBuffer: async () => new Uint8Array().buffer
  });
  await assert.rejects(() => X.exporterUn(appeler, sansAttendre, LIEN_X, { maxTours: 4 }),
    /n'a pas abouti/);
});

test("export : chaque KPI reçoit un nom de fichier stable", () => {
  assert.equal(X.nomFichier({ fichier: "kpi3.png" }, 0, "PNG"), "kpi3.png");
  assert.equal(X.nomFichier({ fichier: "kpi3.png" }, 0, "PDF"), "kpi3.pdf");
  assert.equal(X.nomFichier({}, 4, "PNG"), "kpi5.png");
});

/* ═══ Connexion par code d'appareil ═════════════════════════
   Aucun secret sur le poste : un code s'affiche, vous l'entrez dans
   un navigateur, le jeton arrive. « authorization_pending » n'est pas
   une erreur — c'est l'état normal tant que personne n'a validé. */

const J = require("./outils/jeton-powerbi.js");

test("jeton : les adresses visent le bon locataire", () => {
  const a = J.adresses("contoso.onmicrosoft.com");
  assert.match(a.code, /contoso\.onmicrosoft\.com\/oauth2\/v2\.0\/devicecode$/);
  assert.match(a.jeton, /contoso\.onmicrosoft\.com\/oauth2\/v2\.0\/token$/);
  assert.match(J.adresses(null).code, /\/organizations\//, "à défaut, le locataire de l'utilisateur");
});

test("jeton : la portée demandée est celle de l'API Power BI", () => {
  assert.match(J.PORTEE, /analysis\.windows\.net\/powerbi\/api/);
});

test("jeton : le corps est un formulaire, pas du JSON — Entra refuse le JSON", () => {
  assert.equal(J.formulaire({ a: "1", b: "x y" }), "a=1&b=x%20y");
});

test("jeton : l'attente traverse « autorisation en attente » sans broncher", async () => {
  let passe = 0;
  const appeler = async () => {
    passe++;
    return passe < 3
      ? { ok: false, json: async () => ({ error: "authorization_pending" }) }
      : { ok: true, json: async () => ({ access_token: "eyJ0", expires_in: 3600 }) };
  };
  const jeton = await J.attendreJeton(appeler, () => Promise.resolve(), "org", "cli",
    { interval: 0, expires_in: 900, device_code: "d" });
  assert.equal(jeton.access_token, "eyJ0");
  assert.equal(passe, 3);
});

test("jeton : « slow_down » est traité comme une attente, pas comme un refus", async () => {
  let passe = 0;
  const appeler = async () => {
    passe++;
    return passe < 2
      ? { ok: false, json: async () => ({ error: "slow_down" }) }
      : { ok: true, json: async () => ({ access_token: "t" }) };
  };
  assert.ok(await J.attendreJeton(appeler, () => Promise.resolve(), "org", "cli",
    { interval: 0, expires_in: 900, device_code: "d" }));
});

test("jeton : un vrai refus s'arrête tout de suite, avec son motif", async () => {
  const appeler = async () => ({
    ok: false, json: async () => ({ error: "access_denied", error_description: "refusé par l'utilisateur" })
  });
  await assert.rejects(() => J.attendreJeton(appeler, () => Promise.resolve(), "org", "cli",
    { interval: 0, expires_in: 900, device_code: "d" }), /refusé par l'utilisateur/);
});

test("jeton : un code expiré le dit clairement", async () => {
  const appeler = async () => ({ ok: false, json: async () => ({ error: "authorization_pending" }) });
  await assert.rejects(() => J.attendreJeton(appeler, () => Promise.resolve(), "org", "cli",
    { interval: 1, expires_in: 2, device_code: "d" }), /expiré/);
});

test("jeton : la demande de code porte l'application et la portée", async () => {
  let vu = null;
  const appeler = async (url, init) => {
    vu = init.body;
    return { ok: true, json: async () => ({ user_code: "ABC", verification_uri: "https://x" }) };
  };
  await J.demanderCode(appeler, "org", "mon-app");
  assert.match(vu, /client_id=mon-app/);
  assert.match(vu, /scope=https%3A%2F%2Fanalysis/);
});
