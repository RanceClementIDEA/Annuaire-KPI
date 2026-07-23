/* Vérifie que tests.html fonctionne : extrait son script et l'exécute
   avec un DOM et un fetch simulés, puis lit le résultat affiché. */
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const html = fs.readFileSync("tests.html", "utf8");
const m = html.match(/<script>([\s\S]*)<\/script>/);
if (!m) { console.log("✗ aucun script trouvé dans tests.html"); process.exit(1); }
let script = m[1];
// DEBUG_STACK : expose la pile complète en cas d'échec de chargement
script = script.replace(
  'etat.textContent = "❌ Impossible de charger l\'application : " + e.message;',
  'etat.textContent = "❌ " + e.message; console.log("PILE:", e && e.stack);');

/* --- DOM simulé, suffisant pour la page --- */
function elem(tag) {
  return {
    tagName: tag, className: "", textContent: "", innerHTML: "",
    children: [], style: {},
    appendChild(c) { this.children.push(c); return c; },
    addEventListener() {}, setAttribute() {}, classList: { add() {}, remove() {} }
  };
}
const noeuds = { etat: elem("div"), resume: elem("div"), sortie: elem("div") };
const documentSim = {
  getElementById: id => noeuds[id] || elem("div"),
  createElement: tag => elem(tag),
  addEventListener() {}
};

const sandbox = {
  console,
  document: documentSim,
  location: { reload() {} },
  setTimeout, clearTimeout, setInterval,   // les minuteries viennent de l'hôte
  /* fetch simulé : lit les fichiers sur le disque */
  fetch: async (url) => {
    const f = String(url).split("?")[0];
    const p = path.join(__dirname, f);
    if (!fs.existsSync(p)) return { ok: false, status: 404, text: async () => "" };
    return { ok: true, status: 200, text: async () => fs.readFileSync(p, "utf8") };
  }
};
// Dans un vrai navigateur ces membres existent nativement ; on les simule ici
sandbox.addEventListener = () => {};
sandbox.removeEventListener = () => {};
sandbox.matchMedia = () => ({ matches: false, addListener() {}, addEventListener() {} });
sandbox.navigator = { onLine: true, serviceWorker: { register: () => Promise.resolve() } };
sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;
vm.createContext(sandbox);

try {
  vm.runInContext(script, sandbox, { filename: "tests.html" });
} catch (e) {
  console.log("✗ erreur à l'exécution du script :", e.message);
  process.exit(1);
}

/* Laisse les promesses se résoudre, puis lit l'état affiché */
setTimeout(() => {
  const etat = noeuds.etat.textContent;
  const resume = noeuds.resume.innerHTML;
  const nombres = [...resume.matchAll(/>(\d+)<\/div>/g)].map(x => +x[1]);
  console.log("État affiché :", etat);
  if (nombres.length >= 3) {
    console.log(`Tests : ${nombres[0]} · Réussis : ${nombres[1]} · Échoués : ${nombres[2]}`);
    process.exit(nombres[2] === 0 && nombres[0] > 0 ? 0 : 1);
  } else {
    console.log("✗ résumé illisible");
    process.exit(1);
  }
}, 2000);
