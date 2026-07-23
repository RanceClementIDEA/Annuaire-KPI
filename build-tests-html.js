/* Génère tests.html : injecte le harnais, le simulateur et les tests
   dans la coque de présentation (tests-shell.html).
   Aucune duplication : les tests sont exactement ceux exécutés en local. */
const fs = require("fs");
const lire = f => fs.readFileSync(f, "utf8");

/* Retire les appels propres à Node des fichiers de test */
function adapter(src) {
  return src
    .replace(/^const \{ test \} = require\("node:test"\);\s*$/m, "")
    .replace(/^const assert = require\("node:assert"\);\s*$/m, "")
    .replace(/^const \{[^}]*\} = require\("\.\/js\/merge\.js"\);\s*$/m, "")
    .replace(/^const \{[^}]*\} = require\("\.\/sync-sim\.js"\);\s*$/m, "")
    .replace(/^const \{ loadApp \} = require\("\.\/app-harness\.js"\);\s*$/m, "")
    .replace(/^const A = loadApp\(\);.*$/m, "")
    .replace(/^module\.exports[^;]*;\s*$/m, "");
}

const harnais = lire("harness-core.js").replace(/^\s*module\.exports[^;]*;\s*$/m, "");
const simulateur = lire("sync-sim.js")
  .replace(/^const M = require\("\.\/js\/merge\.js"\);\s*$/m,
           'const M = window;   // les fonctions de fusion sont exposées globalement')
  .replace(/^module\.exports[^;]*;\s*$/m, "");

const groupes = [
  ["Moteur de fusion", "merge.test.js"],
  ["Synchronisation multi-appareils", "sync.test.js"],
  ["Fonctions de l'application", "app.test.js"],
  ["Affichage, import/export et corbeille", "app-ui.test.js"],
  ["Flux complets : synchro, formulaire, persistance", "app-flows.test.js"]
];

const tests = groupes
  .map(([nom, fichier]) => `__ouvrirGroupe(${JSON.stringify(nom)});\n${adapter(lire(fichier))}`)
  .join("\n");

const html = lire("tests-shell.html")
  .replace("/*__HARNESS__*/", () => harnais)
  .replace("/*__SYNCSIM__*/", () => simulateur)
  .replace("/*__TESTS__*/", () => tests);

fs.writeFileSync("tests.html", html);
const nb = (tests.match(/^test\(/gm) || []).length;
console.log(`tests.html généré : ${(html.length / 1024).toFixed(1)} Ko · ${groupes.length} domaines · ~${nb} tests`);
