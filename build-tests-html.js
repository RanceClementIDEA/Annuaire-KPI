/* Génère tests.html : une page qui exécute la suite de tests dans le navigateur,
   sans Node.js, sans installation, et SANS toucher aux données réelles. */
const fs = require("fs");

const lire = f => fs.readFileSync(f, "utf8");

/* --- Retire les appels propres à Node des fichiers de test --- */
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

/* sync-sim.js : on remplace le require par une résolution tardive sur window */
const syncSim = lire("sync-sim.js")
  .replace(/^const M = require\("\.\/js\/merge\.js"\);\s*$/m, "const M = window;")
  .replace(/^module\.exports[^;]*;\s*$/m, "");

const tests = [
  ["Moteur de fusion", adapter(lire("merge.test.js"))],
  ["Synchronisation multi-appareils", adapter(lire("sync.test.js"))],
  ["Fonctions de l'application", adapter(lire("app.test.js"))]
];

const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Tests — Annuaire KPI</title>
<style>
  :root { --bg:#06202E; --card:#0B2C3D; --line:#164055; --txt:#E6F1F6; --dim:#8FA9B8;
          --ok:#22C55E; --ko:#EF4444; --acc:#00C4CC; --gold:#FFB020; }
  * { box-sizing:border-box; }
  body { margin:0; padding:24px; background:var(--bg); color:var(--txt);
         font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
  h1 { font-size:20px; margin:0 0 4px; }
  .sub { color:var(--dim); font-size:13px; margin-bottom:20px; }
  #resume { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:20px; }
  .carte { background:var(--card); border:1px solid var(--line); border-radius:10px;
           padding:12px 18px; min-width:110px; }
  .carte .n { font-size:26px; font-weight:700; }
  .carte .l { font-size:11px; color:var(--dim); text-transform:uppercase; letter-spacing:.5px; }
  .n.ok { color:var(--ok); } .n.ko { color:var(--ko); } .n.acc { color:var(--acc); }
  .groupe { background:var(--card); border:1px solid var(--line); border-radius:10px;
            margin-bottom:14px; overflow:hidden; }
  .groupe h2 { font-size:14px; margin:0; padding:12px 16px; background:rgba(0,196,204,.08);
               border-bottom:1px solid var(--line); }
  .ligne { display:flex; gap:10px; padding:6px 16px; font-size:12.5px;
           border-bottom:1px solid rgba(255,255,255,.04); align-items:flex-start; }
  .ligne:last-child { border-bottom:none; }
  .puce { flex:0 0 auto; font-weight:700; }
  .puce.ok { color:var(--ok); } .puce.ko { color:var(--ko); }
  .msg { color:var(--ko); font-size:11.5px; margin-top:3px;
         font-family:ui-monospace,Menlo,Consolas,monospace; }
  .etat { padding:14px 18px; border-radius:10px; margin-bottom:20px; font-size:14px; font-weight:600; }
  .etat.ok { background:rgba(34,197,94,.12); border:1px solid var(--ok); color:var(--ok); }
  .etat.ko { background:rgba(239,68,68,.12); border:1px solid var(--ko); color:var(--ko); }
  .etat.att { background:rgba(255,176,32,.12); border:1px solid var(--gold); color:var(--gold); }
  .note { color:var(--dim); font-size:12px; margin-top:22px; line-height:1.6;
          border-top:1px solid var(--line); padding-top:14px; }
  button { background:var(--acc); color:#04141d; border:0; border-radius:8px; padding:9px 16px;
           font-weight:700; cursor:pointer; font-size:13px; }
</style>
</head>
<body>
<h1>Tests automatiques — Annuaire KPI</h1>
<div class="sub">Vérifie le moteur de fusion, la synchronisation et les fonctions de l'application.
Aucune donnée réelle n'est lue ni modifiée : le stockage et le cloud sont simulés.</div>

<div id="etat" class="etat att">Chargement en cours…</div>
<div id="resume"></div>
<div id="sortie"></div>
<div class="note">
  Cette page charge <code>app.js</code> et le dossier <code>js/</code> dans un bac à sable :
  la mémoire du navigateur, Firebase et Excel sont remplacés par des simulations.
  Vos KPIs et votre synchronisation ne sont jamais touchés.
  <br><br>
  <button onclick="location.reload()">↻ Relancer les tests</button>
</div>

<script>
/* ══ Mini cadre de test (remplace node:test et node:assert) ══ */
const __groupes = [];
let __courant = null;
function __ouvrirGroupe(nom) { __courant = { nom, tests: [] }; __groupes.push(__courant); }
function test(nom, fn) { __courant.tests.push({ nom, fn }); }

const assert = {
  equal(a, b, m) { if (a != b) throw new Error(m || \`attendu \${JSON.stringify(b)}, obtenu \${JSON.stringify(a)}\`); },
  strictEqual(a, b, m) { if (a !== b) throw new Error(m || \`attendu \${JSON.stringify(b)}, obtenu \${JSON.stringify(a)}\`); },
  notEqual(a, b, m) { if (a == b) throw new Error(m || "les deux valeurs ne devraient pas être égales"); },
  ok(v, m) { if (!v) throw new Error(m || "valeur fausse alors qu'elle devrait être vraie"); },
  match(s, re, m) { if (!re.test(s)) throw new Error(m || \`"\${s}" ne correspond pas à \${re}\`); },
  deepEqual(a, b, m) {
    if (JSON.stringify(a) !== JSON.stringify(b))
      throw new Error(m || \`attendu \${JSON.stringify(b)}, obtenu \${JSON.stringify(a)}\`);
  }
};

/* ══ Bac à sable : charge le vrai app.js sans effets de bord ══ */
function __elementFactice() {
  return new Proxy({}, {
    get(o, p) {
      if (p === "style") return {};
      if (p === "classList") return { add(){}, remove(){}, toggle(){}, contains(){ return false; } };
      if (p === "dataset") return {};
      if (p === "children" || p === "childNodes") return [];
      if (p === "querySelectorAll") return () => [];
      if (p === "querySelector") return () => null;
      if (typeof p === "string" && ["addEventListener","appendChild","removeChild","focus","click",
        "insertBefore","remove","setAttribute","getAttribute","scrollTo","blur"].includes(p)) return () => {};
      return o[p] === undefined ? "" : o[p];
    },
    set(o, p, v) { o[p] = v; return true; }
  });
}

async function loadApp() {
  const fichiers = ["js/storage.js", "js/merge.js", "js/carousel.js", "app.js"];
  const sources = [];
  for (const f of fichiers) {
    const r = await fetch(f + "?anticache=" + Date.now());
    if (!r.ok) throw new Error("Fichier introuvable : " + f + " (" + r.status + ")");
    sources.push(await r.text());
  }
  // Mémoire simulée : on ne touche JAMAIS au vrai localStorage
  const memoire = {};
  const stockageFactice = {
    getItem: k => (memoire[k] === undefined ? null : memoire[k]),
    setItem: (k, v) => { memoire[k] = String(v); },
    removeItem: k => { delete memoire[k]; },
    key: i => Object.keys(memoire)[i],
    get length() { return Object.keys(memoire).length; }
  };
  const documentFactice = {
    getElementById: () => __elementFactice(), querySelector: () => __elementFactice(),
    querySelectorAll: () => [], createElement: () => __elementFactice(),
    addEventListener() {}, body: __elementFactice(), documentElement: __elementFactice()
  };

  const corps = sources.join("\\n;\\n") + "\\n; return { run: (c) => eval(c) };";
  const fabrique = new Function(
    "document", "localStorage", "navigator", "location", "firebase", "XLSX",
    "confirm", "alert", "prompt", "FileReader", "Blob", "URL", "fetch",
    "addEventListener", "removeEventListener", "matchMedia",
    "setTimeout", "setInterval", "clearTimeout", "console",
    corps
  );
  const noyau = fabrique(
    documentFactice, stockageFactice,
    { onLine: true, serviceWorker: { register: () => Promise.resolve() } },
    { protocol: "https:", origin: "https://test", href: "https://test/" },
    undefined, { utils: {} },
    () => false, () => {}, () => null,
    function () {}, function () {},
    { createObjectURL: () => "blob:x", revokeObjectURL() {} },
    () => Promise.resolve({ ok: true, json: () => ({}) }),
    () => {}, () => {}, () => ({ matches: false, addListener() {}, addEventListener() {} }),
    () => 0, () => 0, () => {},
    { log() {}, warn() {}, error() {}, info() {} }
  );

  const run = c => noyau.run(c);
  const outils = {
    run,
    get: expr => run("JSON.parse(JSON.stringify(" + expr + "))"),
    reset(opts) {
      opts = opts || {};
      const j = v => JSON.stringify(v === undefined ? null : v);
      run(\`
        manualEntries   = \${j(opts.manualEntries || [])};
        personalEntries = \${j(opts.personalEntries || [])};
        personalTrash   = \${j(opts.personalTrash || [])};
        deletedIds      = \${j(opts.deletedIds || [])};
        purgedIds       = \${j(opts.purgedIds || [])};
        activityLog     = \${j(opts.activityLog || [])};
        favorites       = \${j(opts.favorites || [])};
        sites           = \${j(opts.sites || [
          { key: "logistiport", name: "Logistiport", badge: "LOG", _mtime: 1 },
          { key: "armement", name: "MG + Débords", badge: "MG+D", _mtime: 1 }
        ])};
        currentUser = \${j(opts.currentUser || "marie")};
        data = [];
        applyingRemoteSync = true;
        isBooting = true;
      \`);
      return this;
    }
  };
  // Accès direct aux fonctions : A.titleKey("x") appelle titleKey dans le bac à sable
  return new Proxy(outils, {
    get(o, p) {
      if (p in o) return o[p];
      if (typeof p !== "string") return undefined;
      // Ne jamais répondre à then/catch/finally : sinon l'objet serait pris
      // pour une promesse par « await » et appelé avec des fonctions en argument.
      if (p === "then" || p === "catch" || p === "finally") return undefined;
      return (...args) => run(p + "(" + args.map(a => JSON.stringify(a === undefined ? null : a)).join(",") + ")");
    }
  });
}

/* ══ Simulateur d'appareils (synchronisation) ══ */
${syncSim}

/* ══ Les tests ══ */
let A = null;
${tests.map(([nom, src]) => `__ouvrirGroupe(${JSON.stringify(nom)});\n${src}`).join("\n")}

/* ══ Exécution ══ */
(async function () {
  const etat = document.getElementById("etat");
  const sortie = document.getElementById("sortie");
  const resume = document.getElementById("resume");
  try {
    A = await loadApp();
  } catch (e) {
    etat.className = "etat ko";
    etat.textContent = "❌ Impossible de charger l'application : " + e.message;
    sortie.innerHTML = '<div class="note">Placez cette page dans le MÊME dossier que <code>app.js</code> ' +
      'et le dossier <code>js/</code>, puis ouvrez-la via son adresse https (pas par double-clic).</div>';
    return;
  }

  let total = 0, reussis = 0, echoues = 0;
  for (const g of __groupes) {
    const bloc = document.createElement("div");
    bloc.className = "groupe";
    const titre = document.createElement("h2");
    bloc.appendChild(titre);
    let okG = 0, koG = 0;
    for (const t of g.tests) {
      total++;
      const ligne = document.createElement("div");
      ligne.className = "ligne";
      let erreur = null;
      try { t.fn(); } catch (e) { erreur = e; }
      if (erreur) { echoues++; koG++; } else { reussis++; okG++; }
      ligne.innerHTML =
        '<span class="puce ' + (erreur ? "ko" : "ok") + '">' + (erreur ? "✗" : "✓") + '</span>' +
        '<span>' + t.nom.replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c])) +
        (erreur ? '<div class="msg">' + String(erreur.message).replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c])) + '</div>' : '') +
        '</span>';
      bloc.appendChild(ligne);
    }
    titre.textContent = g.nom + " — " + okG + "/" + g.tests.length;
    sortie.appendChild(bloc);
  }

  resume.innerHTML =
    '<div class="carte"><div class="n acc">' + total + '</div><div class="l">Tests</div></div>' +
    '<div class="carte"><div class="n ok">' + reussis + '</div><div class="l">Réussis</div></div>' +
    '<div class="carte"><div class="n ' + (echoues ? "ko" : "ok") + '">' + echoues + '</div><div class="l">Échoués</div></div>';

  if (echoues === 0) {
    etat.className = "etat ok";
    etat.textContent = "✅ Tout va bien — les " + total + " tests passent.";
  } else {
    etat.className = "etat ko";
    etat.textContent = "❌ " + echoues + " test(s) en échec sur " + total + " — voir le détail en rouge ci-dessous.";
  }
})();
</script>
</body>
</html>
`;

fs.writeFileSync("tests.html", html);
console.log("tests.html généré :", (html.length / 1024).toFixed(1), "Ko");
