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
