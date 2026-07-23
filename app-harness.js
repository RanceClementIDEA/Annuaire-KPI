/* Harnais de test : charge le VRAI app.js dans un environnement navigateur
   simulé, afin de tester les fonctions réellement livrées (et non des copies). */
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const DIR = __dirname;

function stubEl() {
  const t = {};
  return new Proxy(t, {
    get(o, p) {
      if (p === "style") return {};
      if (p === "classList") return { add() {}, remove() {}, toggle() {}, contains() { return false; } };
      if (p === "dataset") return {};
      if (p === "children" || p === "childNodes") return [];
      if (typeof p === "string" && ["addEventListener", "appendChild", "removeChild", "focus",
        "click", "insertBefore", "remove", "setAttribute", "getAttribute", "scrollTo", "blur"].includes(p)) return () => {};
      if (p === "querySelectorAll") return () => [];
      if (p === "querySelector") return () => null;
      return o[p] === undefined ? "" : o[p];
    },
    set(o, p, v) { o[p] = v; return true; }
  });
}

function loadApp() {
  const store = {};
  const sandbox = {
    console: { log() {}, warn() {}, error() {}, info() {} },
    document: {
      getElementById: () => stubEl(), querySelector: () => stubEl(), querySelectorAll: () => [],
      createElement: () => stubEl(), addEventListener() {}, body: stubEl(), documentElement: stubEl()
    },
    localStorage: {
      getItem: k => (store[k] === undefined ? null : store[k]),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
      key: i => Object.keys(store)[i],
      get length() { return Object.keys(store).length; }
    },
    navigator: { onLine: true, serviceWorker: { register: () => Promise.resolve() } },
    location: { protocol: "https:", origin: "https://test", href: "https://test/" },
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0,
    confirm: () => false, alert() {}, prompt: () => null,
    fetch: () => Promise.resolve({ json: () => ({}) }),
    XLSX: { utils: {} }, firebase: undefined,
    Blob: function () {}, URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
    FileReader: function () {}, Uint8Array, atob: s => s, btoa: s => s,
    addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: false, addListener() {}, addEventListener() {} })
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;
  vm.createContext(sandbox);
  for (const f of ["js/storage.js", "js/merge.js", "js/carousel.js"]) {
    vm.runInContext(fs.readFileSync(path.join(DIR, f), "utf8"), sandbox, { filename: f });
  }
  vm.runInContext(fs.readFileSync(path.join(DIR, "app.js"), "utf8"), sandbox, { filename: "app.js" });
  sandbox.__store = store;

  /* Les variables `let` d'app.js ne sont pas exposées sur l'objet global :
     on passe donc par une évaluation dans le contexte pour les lire/écrire. */
  const run = code => vm.runInContext(code, sandbox);
  sandbox.run = run;
  sandbox.get = expr => run(`JSON.parse(JSON.stringify(${expr}))`);

  /* Remet l'état applicatif à zéro entre deux tests */
  sandbox.reset = (opts = {}) => {
    const j = v => JSON.stringify(v === undefined ? null : v);
    run(`
      manualEntries   = ${j(opts.manualEntries || [])};
      personalEntries = ${j(opts.personalEntries || [])};
      personalTrash   = ${j(opts.personalTrash || [])};
      deletedIds      = ${j(opts.deletedIds || [])};
      purgedIds       = ${j(opts.purgedIds || [])};
      activityLog     = ${j(opts.activityLog || [])};
      favorites       = ${j(opts.favorites || [])};
      sites           = ${j(opts.sites || [
        { key: "logistiport", name: "Logistiport", badge: "LOG", _mtime: 1 },
        { key: "armement", name: "MG + Débords", badge: "MG+D", _mtime: 1 }
      ])};
      currentUser = ${j(opts.currentUser || "marie")};
      data = [];
      applyingRemoteSync = true;   // neutralise tout envoi automatique
      isBooting = true;
    `);
    return sandbox;
  };
  return sandbox;
}

module.exports = { loadApp };
