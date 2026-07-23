/* Vérifie le mode « données réelles » de tests.html :
   fournit une mémoire locale et un cloud réalistes, lance l'analyse,
   et contrôle que les écarts sont correctement détectés. */
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const script = fs.readFileSync("tests.html", "utf8").match(/<script>([\s\S]*)<\/script>/)[1];

/* --- DOM simulé --- */
const registre = new Map();
function elem(tag, id) {
  const el = {
    tagName: (tag || "div").toUpperCase(), id: id || "", textContent: "", innerHTML: "",
    value: "", disabled: false, children: [], style: {}, dataset: {}, _cls: new Set(),
    classList: {
      add: c => el._cls.add(c), remove: c => el._cls.delete(c), contains: c => el._cls.has(c),
      toggle: (c, f) => (f === undefined ? (el._cls.has(c) ? el._cls.delete(c) : el._cls.add(c))
                                         : (f ? el._cls.add(c) : el._cls.delete(c)))
    },
    get className() { return [...el._cls].join(" "); },
    set className(v) { el._cls = new Set(String(v).split(/\s+/).filter(Boolean)); },
    appendChild(c) { el.children.push(c); return c; },
    addEventListener(ev, fn) { (el._ev = el._ev || {})[ev] = fn; },
    setAttribute() {}, querySelectorAll: () => [], querySelector: () => null, focus() {}, remove() {}
  };
  return el;
}
const tete = elem("head");
const documentSim = {
  getElementById(id) { if (!registre.has(id)) registre.set(id, elem("div", id)); return registre.get(id); },
  createElement: tag => elem(tag),
  querySelectorAll: () => [],
  addEventListener() {},
  head: tete
};

/* --- Données locales réalistes, avec anomalies volontaires --- */
const fiche = (t, f, extra) => Object.assign(
  { id: "kpi_" + t.toLowerCase().replace(/\W+/g, "_") + "_" + f.toLowerCase(),
    manual: true, title: t, freq: f, _mtime: 1000 }, extra || {});

const SAIN = process.argv.includes("--sain");

const localFiches = SAIN ? [
  fiche("Volumétrie distribution", "Mensuelle", { logistiport: "https://a" }),
  fiche("Taux service", "Mensuelle", { logistiport: "https://c" })
] : [
  fiche("Volumétrie distribution", "Mensuelle", { logistiport: "https://a", armement: "https://mg" }),
  fiche("Volumétrie distribution", "Hebdomadaire", { logistiport: "https://b" }),
  fiche("Taux service", "Mensuelle", { logistiport: "https://c" }),
  fiche("Seulement ici", "Mensuelle", { logistiport: "https://d" }),   // absente du cloud
  { id: "kpi_sans_lien_mensuelle", manual: true, title: "Sans lien", freq: "Mensuelle", _mtime: 900 },
  { id: "kpi_doublon_a", manual: true, title: "Doublon", freq: "Mensuelle", _mtime: 800, logistiport: "x" },
  { id: "kpi_doublon_b", manual: true, title: "Doublon", freq: "Mensuelle", _mtime: 810, logistiport: "y" }
];
const memoire = {
  kpiUser: "marie",
  kpiManualEntries: JSON.stringify(localFiches),
  kpiDeletedIds: JSON.stringify(SAIN ? [] : [{ id: "kpi_disparue", title: "Disparue", at: 500, state: "deleted" }]),
  kpiPurged: JSON.stringify([]),
  kpiSites: JSON.stringify(SAIN
    ? [{ key: "logistiport", name: "Logistiport", _mtime: 1 }]
    : [{ key: "logistiport", name: "Logistiport", _mtime: 1 },
       { key: "armement", name: "MG + Débords", _mtime: 1 }]),
  kpiMigratedV2: "1"
};
const stockageSim = {
  getItem: k => (memoire[k] === undefined ? null : memoire[k]),
  setItem: (k, v) => { memoire[k] = String(v); },
  removeItem: k => { delete memoire[k]; },
  key: i => Object.keys(memoire)[i],
  get length() { return Object.keys(memoire).length; }
};

/* --- Cloud simulé : contient une fiche de plus, une divergente, une de moins --- */
const cloudFiches = SAIN ? JSON.parse(JSON.stringify(localFiches)) : [
  Object.assign({}, localFiches[0], { armement: "https://MG-DIFFERENT" }),  // divergente
  localFiches[1],
  localFiches[2],
  fiche("Seulement dans le cloud", "Mensuelle", { logistiport: "https://e" })
];
const docCloud = {
  kpiManual: cloudFiches, kpiDeleted: [], kpiPurged: [],
  kpiSites: SAIN ? [{ key: "logistiport", name: "Logistiport", _mtime: 1 }]
                 : [{ key: "logistiport", name: "Logistiport", _mtime: 1 },
                    { key: "armement", name: "MG + Débords", _mtime: 1 }],
  updatedAt: Date.now()
};
let ecritures = 0, suppressions = 0;
const firebaseSim = {
  apps: [],
  initializeApp() { firebaseSim.apps = [{}]; return {}; },
  firestore: Object.assign(function () {
    return {
      collection: () => ({
        doc: (id) => ({
          async get() { return id.indexOf("autotest") >= 0
            ? { exists: true, data: () => ({ jeton: firebaseSim.__jeton }) }
            : { exists: true, data: () => docCloud }; },
          async set(p) { ecritures++; firebaseSim.__jeton = p.jeton; },
          async delete() { suppressions++; }
        })
      })
    };
  }, { FieldValue: { serverTimestamp: () => ({ toMillis: () => Date.now() }) } })
};

const sandbox = {
  console,
  document: documentSim,
  localStorage: stockageSim,
  firebase: firebaseSim,
  location: { href: "https://ranceclementidea.github.io/Annuaire-KPI/tests.html",
              origin: "https://ranceclementidea.github.io", protocol: "https:", reload() {} },
  performance: { now: () => Date.now() },
  navigator: { userAgent: "Vérificateur", onLine: true, clipboard: { writeText: async () => {} },
               serviceWorker: { register: async () => {} } },
  setTimeout, clearTimeout, setInterval,
  addEventListener() {}, removeEventListener() {},
  matchMedia: () => ({ matches: false, addListener() {}, addEventListener() {} }),
  fetch: async (url) => {
    const f = String(url).split("?")[0];
    const p = path.join(__dirname, f);
    if (!fs.existsSync(p)) return { ok: false, status: 404, text: async () => "" };
    return { ok: true, status: 200, text: async () => fs.readFileSync(p, "utf8") };
  }
};
sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;
vm.createContext(sandbox);
vm.runInContext(script, sandbox, { filename: "tests.html" });

/* On attend la fin de la suite en bac à sable, puis on lance l'analyse réelle */
setTimeout(async () => {
  try {
    await sandbox.analyseReelle(true);   // avec test d'écriture
  } catch (e) {
    console.log("✗ l'analyse réelle a échoué :", e.message);
    process.exit(1);
  }

  const cartes = registre.get("cartesR").innerHTML;
  const nb = [...cartes.matchAll(/class="n [^"]*">([^<]+)</g)].map(x => x[1]);
  console.log("État :", registre.get("etatR").innerHTML.replace(/<[^>]+>/g, ""));
  console.log(`Contrôles : ${nb[0]} · Conformes : ${nb[1]} · À vérifier : ${nb[2]} · Problèmes : ${nb[3]}`);

  /* Détail par ligne */
  const lignes = [];
  (function parcourir(n) {
    (n.children || []).forEach(c => {
      if (c.innerHTML && c.innerHTML.indexOf('class="puce') >= 0) {
        const etat = c.innerHTML.indexOf('puce ok') >= 0 ? "OK"
                   : c.innerHTML.indexOf('puce warn') >= 0 ? "!!" : "KO";
        const nom = (c.innerHTML.match(/class="nom">([^<]+)/) || [])[1] || "?";
        lignes.push({ etat, nom: nom.trim(), html: c.innerHTML });
      }
      parcourir(c);
    });
  })(registre.get("sortieR"));

  console.log("\nContrôles signalés :");
  lignes.filter(l => l.etat !== "OK").forEach(l => console.log("  " + l.etat + "  " + l.nom));

  /* Vérifications attendues sur ce jeu de données volontairement défectueux */
  const trouve = (motif) => lignes.find(l => l.nom.indexOf(motif) >= 0);
  const controles = SAIN ? [
    ["aucun écart signalé dans la comparaison",
      !lignes.some(l => l.etat !== "OK" && l.nom.indexOf("Fiches") >= 0)],
    ["aucune anomalie de temporalité", trouve("Cohérence des temporalités")?.etat === "OK"],
    ["aucun marqueur orphelin", trouve("Marqueurs de corbeille")?.etat === "OK"],
    ["toutes les fiches ont un lien", trouve("au moins un lien")?.etat === "OK"],
    ["périmètres alignés", trouve("Périmètres identiques")?.etat === "OK"],
    ["aucun problème bloquant", nb[3] === "0"]
  ] : [
    ["détecte la fiche absente du cloud", trouve("absentes du cloud")?.html.includes("Seulement ici")],
    ["détecte la fiche absente d'ici", trouve("absentes de cet appareil")?.html.includes("Seulement dans le cloud")],
    ["détecte la fiche divergente", trouve("identiques des deux côtés")?.html.includes("armement")],
    ["détecte le doublon de temporalité", trouve("Cohérence des temporalités")?.html.includes("double")],
    ["détecte la fiche sans lien", trouve("au moins un lien")?.html.includes("Sans lien")],
    ["détecte le marqueur orphelin", trouve("Marqueurs de corbeille")?.html.includes("1")],
    ["compte correctement les KPIs", trouve("Nombre de KPIs")?.html.includes("<b>5</b>")],
    ["le test d'écriture a bien écrit", ecritures > 0],
    ["le document de test a été effacé", suppressions > 0]
  ];
  console.log("\nVérifications du diagnostic :");
  let ko = 0;
  controles.forEach(([nom, ok]) => { console.log("  " + (ok ? "✓" : "✗") + " " + nom); if (!ok) ko++; });
  console.log(ko ? `\n✗ ${ko} vérification(s) en échec` : "\n✓ Le diagnostic réel détecte correctement tous les écarts");
  process.exit(ko ? 1 : 0);
}, 14000);
