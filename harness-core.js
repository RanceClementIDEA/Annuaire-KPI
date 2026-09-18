/* Cœur du harnais de test — utilisable à l'identique sous Node et dans le navigateur.
   Charge le VRAI app.js dans un bac à sable dont on peut OBSERVER les effets :
   ce qui est écrit dans la page, les messages affichés, les fichiers exportés… */
(function (root) {
  "use strict";

  /** Élément de page simulé : mémorise ce qu'on lui écrit. */
  function creerElement(id) {
    const el = {
      id, tagName: "DIV", textContent: "", value: "", checked: false,
      // Une liste déroulante garde toujours son option « Tous » en tête
      options: [{ tagName: "OPTION", value: "", textContent: "Tous" }],
      style: {}, dataset: {}, children: [], _classes: new Set(),
      classList: {
        add: c => el._classes.add(c), remove: c => el._classes.delete(c),
        toggle: (c, f) => (f === undefined ? (el._classes.has(c) ? el._classes.delete(c) : el._classes.add(c))
                                           : (f ? el._classes.add(c) : el._classes.delete(c))),
        contains: c => el._classes.has(c)
      },
      appendChild(c) {
        if (c) { el.children.push(c); if (c.tagName === "OPTION") el.options.push(c); }
        return c;
      },
      removeChild(c) { el.children = el.children.filter(x => x !== c); return c; },
      insertBefore(c) { el.children.unshift(c); return c; },
      remove() {}, focus() {}, blur() {}, click() {},
      addEventListener() {}, removeEventListener() {},
      setAttribute(k, v) { el[k] = v; }, getAttribute(k) { return el[k]; },
      querySelector() { return creerElement("sous-élément"); }, querySelectorAll() { return []; },
      scrollTo() {}, closest() { return null; }
    };
    // Une liste déroulante réelle change de VALEUR quand on change son index :
    // sans cela, resetFilters() remettait l'index à zéro en laissant l'ancienne
    // valeur en place, et les tests de filtre ne reflétaient pas le navigateur.
    let _selIdx = 0;
    Object.defineProperty(el, "selectedIndex", {
      get: () => _selIdx,
      set(i) {
        _selIdx = Number(i) || 0;
        const opt = el.options[_selIdx];
        if (opt) el.value = opt.value !== undefined ? opt.value : opt.textContent;
      }
    });

    // Comme dans la vraie page, une fenêtre modale démarre fermée
    if (/Modal$/.test(String(id))) el._classes.add("hidden");
    // innerHTML = "" doit réellement vider le contenu (options comprises)
    let _html = "";
    Object.defineProperty(el, "innerHTML", {
      get: () => _html,
      set(v) { _html = String(v); if (_html === "") { el.children.length = 0; el.options.length = 0; } }
    });
    return el;
  }

  /**
   * @param {string[]} sources  contenu de js/storage.js, js/merge.js, js/carousel.js, app.js
   * @returns {object} harnais
   */
  function creerHarnais(sources) {
    const registre = new Map();          // id → élément simulé (persistant)
    const requetes = new Map();          // sélecteur → liste d'éléments
    const memoire = {};                  // localStorage simulé
    const captures = { ouvertures: [], alertes: [], fichiers: [] };
    let reponseConfirm = false;
    /* Fichiers servis par fetch() : un test peut déposer le contenu que
       l'application ira chercher (empreintes-livrees.json, par exemple). */
    let fichiersServis = {};

    const elementPourId = id => {
      if (!registre.has(id)) registre.set(id, creerElement(id));
      return registre.get(id);
    };

    const documentSim = {
      getElementById: id => elementPourId(id),
      querySelector: sel => (requetes.get(sel) || [null])[0] || null,
      querySelectorAll: sel => requetes.get(sel) || [],
      createElement: tag => { const e = creerElement("créé:" + tag); e.tagName = String(tag).toUpperCase(); return e; },
      addEventListener() {},
      body: creerElement("body"),
      documentElement: creerElement("html")
    };
    const stockageOrigine = {
      getItem: k => (memoire[k] === undefined ? null : memoire[k]),
      setItem: (k, v) => { memoire[k] = String(v); },
      removeItem: k => { delete memoire[k]; },
      clear: () => { Object.keys(memoire).forEach(k => delete memoire[k]); },
      key: i => Object.keys(memoire)[i],
      get length() { return Object.keys(memoire).length; }
    };
    // Copie de travail : un test peut la détourner, reset() la remet en place
    const stockageSim = Object.create(Object.getPrototypeOf(stockageOrigine),
      Object.getOwnPropertyDescriptors(stockageOrigine));
    // Tableur simulé : mémorise ce qui serait écrit dans le fichier Excel
    const xlsxSim = {
      utils: {
        aoa_to_sheet(aoa) {
          const ws = { "!aoa": aoa };
          aoa.forEach((ligne, r) => ligne.forEach((v, c) => { ws[xlsxSim.utils.encode_cell({ r, c })] = { v }; }));
          return ws;
        },
        encode_cell: ({ r, c }) => String.fromCharCode(65 + c) + (r + 1),
        book_new: () => ({ SheetNames: [], Sheets: {} }),
        book_append_sheet(wb, ws, nom) { wb.SheetNames.push(nom); wb.Sheets[nom] = ws; },
        sheet_to_json: () => []
      },
      read: () => ({ SheetNames: ["Feuil1"], Sheets: { Feuil1: {} } }),
      write: () => new Uint8Array(0),
      writeFile(wb, nom) { captures.fichiers.push({ nom, wb }); }
    };

    const corps = sources.join("\n;\n") + "\n; return { run: function (c) { return eval(c); } };";
    const fabrique = new Function(
      // module/exports/require neutralisés : les fichiers js/ doivent se comporter
      // comme dans un navigateur (exposition globale), quel que soit l'environnement.
      "module", "exports", "require",
      "document", "localStorage", "navigator", "location", "firebase", "XLSX", "window",
      "confirm", "alert", "prompt", "FileReader", "Blob", "URL", "fetch",
      "addEventListener", "removeEventListener", "matchMedia",
      "setTimeout", "setInterval", "clearTimeout", "console",
      corps
    );
    const noyau = fabrique(
      undefined, undefined, undefined,
      documentSim, stockageSim,
      /* Le vrai `navigator.serviceWorker` écoute aussi les messages : sans
         cette méthode, le banc divergeait du navigateur et laissait passer
         un plantage au démarrage. */
      { onLine: true, serviceWorker: {
          register: () => Promise.resolve(),
          __ecoutes: {},
          addEventListener(type, cb) { (this.__ecoutes[type] = this.__ecoutes[type] || []).push(cb); },
          removeEventListener(type, cb) {
            this.__ecoutes[type] = (this.__ecoutes[type] || []).filter(f => f !== cb);
          },
          __emettre(type, data) { (this.__ecoutes[type] || []).forEach(cb => cb({ data })); }
        } },
      { protocol: "https:", origin: "https://test", href: "https://test/" },
      undefined, xlsxSim,
      { innerWidth: 1200, innerHeight: 800, addEventListener() {}, removeEventListener() {},
        open: (u) => { captures.ouvertures.push(u); return null; } },
      () => reponseConfirm,
      m => captures.alertes.push(String(m)),
      () => null,
      function () { this.readAsText = () => {}; this.readAsArrayBuffer = () => {}; },
      function () {},
      /* `URL` est AUSSI un constructeur dans un navigateur : le stubber en
         simple objet faisait échouer tout `new URL(...)` en silence, et le
         banc s'écartait du réel. */
      Object.assign(
        function URL(entree, base) {
          const t = String(entree == null ? "" : entree);
          const m = t.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
          this.href = m ? t : String(base || "https://test/").replace(/[^/]*$/, "") + t;
          this.protocol = (m ? m[1] : "https") + ":";
          const reste = this.href.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, "");
          this.host = reste.split(/[/?#]/)[0] || "";
          this.origin = this.protocol + "//" + this.host;
          this.pathname = "/" + reste.split(/[?#]/)[0].split("/").slice(1).join("/");
          const q = this.href.indexOf("?");
          this.search = q >= 0 ? this.href.slice(q).split("#")[0] : "";
        },
        { createObjectURL: () => "blob:x", revokeObjectURL() {} }
      ),
      url => {
        const chemin = String(url).replace(/^\.\//, "");
        if (Object.prototype.hasOwnProperty.call(fichiersServis, chemin)) {
          const contenu = fichiersServis[chemin];
          if (contenu === null) return Promise.resolve({ ok: false, status: 404 });
          return Promise.resolve({ ok: true, json: () => JSON.parse(contenu), text: () => contenu });
        }
        return Promise.resolve({ ok: true, json: () => ({}), text: () => "" });
      },
      () => {}, () => {}, () => ({ matches: false, addListener() {}, addEventListener() {} }),
      () => 0, () => 0, () => {},
      { log() {}, warn() {}, error() {}, info() {} }
    );

    const run = c => noyau.run(c);
    const j = v => JSON.stringify(v === undefined ? null : v);

    // Les messages affichés à l'utilisateur sont détournés pour être vérifiables
    run("globalThis.__msg = []; showToast = function (m) { globalThis.__msg.push(String(m)); };");
    // Un test peut remplacer confirm/alert/XLSX/FileReader : on garde l'original
    // pour les rétablir à chaque reset et éviter toute contamination entre tests.
    run(`globalThis.__origine = { confirm: confirm, alert: alert, XLSX: XLSX,
                                  FileReader: FileReader, navigator: navigator,
                                  fetch: fetch };`);

    const outils = {
      run,
      get: expr => run("JSON.parse(JSON.stringify(" + expr + "))"),
      version: (() => { try { return run("typeof APP_VERSION !== 'undefined' ? APP_VERSION : '?'"); } catch { return "?"; } })(),

      /* --- état applicatif --- */
      reset(opts) {
        opts = opts || {};
        run(`
          manualEntries   = ${j(opts.manualEntries || [])};
          personalEntries = ${j(opts.personalEntries || [])};
          personalTrash   = ${j(opts.personalTrash || [])};
          deletedIds      = ${j(opts.deletedIds || [])};
          purgedIds       = ${j(opts.purgedIds || [])};
          activityLog     = ${j(opts.activityLog || [])};
          favorites       = ${j(opts.favorites || [])};
          sites           = ${j(opts.sites || [
            { key: "logistiport", name: "Logistiport", badge: "LOG", color: "#0891B2", _mtime: 1 },
            { key: "armement", name: "MG + Débords", badge: "MG+D", color: "#D97706", _mtime: 1 }
          ])};
          currentUser = ${j(opts.currentUser || "marie")};
          data = []; groupSel = {}; groupReport = {};
          currentView = "all";                       // on repart toujours de la vue « Tous »
          if (typeof searchInput === "object" && searchInput) searchInput.value = "";
          if (typeof typeFilter === "object" && typeFilter) typeFilter.selectedIndex = 0;
          if (typeof processFilter === "object" && processFilter) processFilter.selectedIndex = 0;
          if (typeof ritualFilter === "object" && ritualFilter) ritualFilter.selectedIndex = 0;
          applyingRemoteSync = ${opts.autoriserSync ? "false" : "true"};
          isBooting = ${opts.autoriserSync ? "false" : "true"};
          globalThis.__msg = [];
        `);
        captures.ouvertures.length = 0; captures.alertes.length = 0; captures.fichiers.length = 0;
        // Mémoire du navigateur remise à neuf : les tests ne se contaminent pas
        if (!opts.conserverStockage) Object.keys(memoire).forEach(k => delete memoire[k]);
        // Un test a pu détourner setItem (simulation de mémoire saturée) : on rétablit
        Object.assign(stockageSim, Object.getOwnPropertyDescriptors
          ? {} : {});
        run(`confirm = globalThis.__origine.confirm; alert = globalThis.__origine.alert;
             XLSX = globalThis.__origine.XLSX; FileReader = globalThis.__origine.FileReader;
             navigator = globalThis.__origine.navigator;
             fetch = globalThis.__origine.fetch;`);
        stockageSim.setItem = stockageOrigine.setItem;
        stockageSim.getItem = stockageOrigine.getItem;
        stockageSim.removeItem = stockageOrigine.removeItem;
        return this;
      },

      /* --- observation de la page --- */
      el: id => elementPourId(id),
      texte: id => { const v = elementPourId(id).textContent; return v === undefined || v === null ? "" : String(v); },
      html: id => { const v = elementPourId(id).innerHTML; return v === undefined || v === null ? "" : String(v); },
      saisir(id, valeur) { elementPourId(id).value = valeur; return this; },
      /* Choisit une option d'une liste déroulante : positionne l'index ET la
         valeur, exactement comme un clic dans le navigateur. */
      selectionner(id, valeur) {
        const el = elementPourId(id);
        const i = el.options.findIndex(o => (o.value !== undefined ? o.value : o.textContent) === valeur);
        if (i >= 0) el.selectedIndex = i; else el.value = valeur;
        return this;
      },
      cocher(id, v) { elementPourId(id).checked = !!v; return this; },
      requete(selecteur, elements) { requetes.set(selecteur, elements); return this; },

      /* --- Firebase simulé : permet d'éprouver les VRAIS flux de synchro --- */
      firebaseSimule() {
        run(`
          globalThis.__cloud = {};          // documents du faux Firestore
          globalThis.__ecoutes = [];        // abonnements temps réel actifs
          globalThis.__erreurCloud = null;  // panne à simuler
          globalThis.__ecritures = 0;
          globalThis.__versions = {};       // pour les transactions
          globalThis.__rejeux = 0;          // transactions rejouées
          globalThis.__collisionUneFois = null;  // simule un collègue qui s'intercale
          firebase = {
            apps: [],
            initializeApp(cfg) { firebase.apps = [{ cfg }]; return firebase.apps[0]; },
            firestore: Object.assign(function () {
              return {
                collection: (col) => ({
                  /* Lecture d'une collection entière (fiches d'accès). */
                  async get() {
                    if (globalThis.__erreurCloud) throw globalThis.__erreurCloud;
                    const docs = Object.keys(globalThis.__cloud)
                      .filter(k => k.indexOf(col + "/") === 0)
                      .map(k => ({ id: k.slice(col.length + 1), data: () => globalThis.__cloud[k] }));
                    return { docs, size: docs.length, empty: !docs.length, forEach: f => docs.forEach(f) };
                  },
                  doc: (id) => {
                    const cle = col + "/" + id;
                    return {
                      async get() {
                        if (globalThis.__erreurCloud) throw globalThis.__erreurCloud;
                        const d = globalThis.__cloud[cle];
                        return { exists: d !== undefined, data: () => d };
                      },
                      _cle: cle,
                      /* Comme Firestore : une mise à jour exige un document existant. */
                      async update(partiel) {
                        if (globalThis.__erreurCloud) throw globalThis.__erreurCloud;
                        if (globalThis.__cloud[cle] === undefined) {
                          throw Object.assign(new Error("not-found"), { code: "not-found" });
                        }
                        globalThis.__cloud[cle] = Object.assign({}, globalThis.__cloud[cle],
                          JSON.parse(JSON.stringify(partiel)));
                        globalThis.__versions[cle] = (globalThis.__versions[cle] || 0) + 1;
                      },
                      async delete() {
                        if (globalThis.__erreurCloud) throw globalThis.__erreurCloud;
                        delete globalThis.__cloud[cle];
                        globalThis.__versions[cle] = (globalThis.__versions[cle] || 0) + 1;
                      },
                      async set(payload) {
                        if (globalThis.__erreurCloud) throw globalThis.__erreurCloud;
                        globalThis.__cloud[cle] = JSON.parse(JSON.stringify(payload));
                        globalThis.__versions[cle] = (globalThis.__versions[cle] || 0) + 1;
                        // La mesure d'horloge écrit dans un document annexe : on ne la compte pas
                        if (cle.indexOf("__clock") < 0) globalThis.__ecritures++;
                        globalThis.__ecoutes
                          .filter(e => e.cle === cle)
                          .forEach(e => e.cb({ exists: true, data: () => globalThis.__cloud[cle] }));
                      },
                      onSnapshot(cb, errCb) {
                        const abo = { cle, cb, errCb };
                        globalThis.__ecoutes.push(abo);
                        return function () {
                          globalThis.__ecoutes = globalThis.__ecoutes.filter(x => x !== abo);
                        };
                      }
                    };
                  }
                }),
                /* Une transaction : relire, laisser le bloc travailler, puis
                   n'écrire que si le document n'a pas bougé entre-temps.
                   Sinon on rejoue — c'est exactement ce que fait Firestore,
                   et c'est ce qui empêche un envoi d'en écraser un autre. */
                async runTransaction(bloc) {
                  for (let essai = 0; essai < 8; essai++) {
                    let cle = null, luA = 0, ecriture = null;
                    const t = {
                      async get(ref) {
                        if (globalThis.__erreurCloud) throw globalThis.__erreurCloud;
                        cle = ref._cle;
                        luA = globalThis.__versions[cle] || 0;
                        const d = globalThis.__cloud[cle];
                        return { exists: d !== undefined, data: () => d };
                      },
                      set(ref, payload) { ecriture = { ref, payload }; }
                    };
                    await bloc(t);
                    if (!ecriture) return;
                    /* Un collègue qui écrit juste entre la lecture et
                       l'écriture : le cas qu'on ne peut pas provoquer autrement. */
                    if (globalThis.__collisionUneFois) {
                      const f = globalThis.__collisionUneFois;
                      globalThis.__collisionUneFois = null;
                      f();
                    }
                    if ((globalThis.__versions[cle] || 0) !== luA) { globalThis.__rejeux++; continue; }
                    await ecriture.ref.set(ecriture.payload);
                    return;
                  }
                  throw new Error("transaction abandonnée");
                }
              };
            }, { FieldValue: { serverTimestamp: () => ({ toMillis: () => Date.now() }) } })
          };
          fbApp = null; fbDb = null; fbUnsub = null; connectedSyncCode = null;
          initialSyncDone = false; syncBusy = false;
        `);
        return this;
      },
      /* --- Comptes simulés (Firebase Authentication) : à appeler APRÈS firebaseSimule().
             Une fois installés, l'annuaire passe en « mode comptes », exactement comme
             dans la page réelle où le module de comptes est chargé. --- */
      comptesSimules() {
        run(`
          globalThis.__comptes = {};          // adresse → { uid, mail, mdp }
          globalThis.__sessionCompte = null;  // personne connectée
          globalThis.__ecoutesAuth = [];
          globalThis.__erreurAuth = null;     // panne à simuler (code Firebase)
          globalThis.__mailsReinit = [];
          globalThis.__compteurUid = 0;
          globalThis.__notifierAuth = function () {
            globalThis.__ecoutesAuth.slice().forEach(function (cb) { cb(globalThis.__sessionCompte); });
          };
          globalThis.__utilisateur = function (c) {
            return { uid: c.uid, email: c.mail,
              async updatePassword(n) {
                if (globalThis.__erreurAuth) throw globalThis.__erreurAuth;
                globalThis.__comptes[c.mail].mdp = n;
              } };
          };
          const refus = code => Object.assign(new Error(code), { code });
          const authSimule = {
            get currentUser() { return globalThis.__sessionCompte; },
            onAuthStateChanged(cb) {
              globalThis.__ecoutesAuth.push(cb);
              Promise.resolve().then(() => cb(globalThis.__sessionCompte));
              return function () { globalThis.__ecoutesAuth = globalThis.__ecoutesAuth.filter(x => x !== cb); };
            },
            async signInWithEmailAndPassword(mail, mdp) {
              if (globalThis.__erreurAuth) throw globalThis.__erreurAuth;
              const c = globalThis.__comptes[String(mail).trim().toLowerCase()];
              if (!c || c.mdp !== mdp) throw refus("auth/invalid-credential");
              globalThis.__sessionCompte = globalThis.__utilisateur(c);
              globalThis.__notifierAuth();
              return { user: globalThis.__sessionCompte };
            },
            async createUserWithEmailAndPassword(mail, mdp) {
              if (globalThis.__erreurAuth) throw globalThis.__erreurAuth;
              const k = String(mail).trim().toLowerCase();
              if (globalThis.__comptes[k]) throw refus("auth/email-already-in-use");
              const c = { uid: "uid-" + (++globalThis.__compteurUid), mail: k, mdp };
              globalThis.__comptes[k] = c;
              globalThis.__sessionCompte = globalThis.__utilisateur(c);
              globalThis.__notifierAuth();
              return { user: globalThis.__sessionCompte };
            },
            async sendPasswordResetEmail(mail) {
              if (globalThis.__erreurAuth) throw globalThis.__erreurAuth;
              globalThis.__mailsReinit.push(mail);
            },
            async setPersistence(p) { globalThis.__persistance = p; },
            async signOut() { globalThis.__sessionCompte = null; globalThis.__notifierAuth(); }
          };
          globalThis.__persistance = null;
          firebase.auth = function () { return authSimule; };
          firebase.auth.Auth = { Persistence: { LOCAL: "local", SESSION: "session", NONE: "none" } };
          authCompte = null; compte = null; accesListe = null; accesErreur = "";
          modeCreation = false; sessionSurveillee = false; deconnexionVolontaire = false;
        `);
        return this;
      },
      /** Un compte déjà créé (dans la console, par exemple), avec sa fiche si fournie. */
      compteExistant(mail, mdp, fiche) {
        return run(`(function () {
          const k = ${JSON.stringify(String(mail).trim().toLowerCase())};
          const c = { uid: "uid-" + (++globalThis.__compteurUid), mail: k, mdp: ${JSON.stringify(mdp)} };
          globalThis.__comptes[k] = c;
          ${fiche ? `globalThis.__cloud["acces/" + c.uid] = ${JSON.stringify(fiche)};` : ""}
          return c.uid;
        })()`);
      },
      /** Une session déjà ouverte dans ce navigateur (rechargement de page). */
      sessionOuverte(mail) {
        run(`globalThis.__sessionCompte = globalThis.__utilisateur(globalThis.__comptes[${JSON.stringify(String(mail).trim().toLowerCase())}]);`);
        return this;
      },
      /** Session perdue sans l'avoir demandé (mot de passe changé ailleurs…). */
      sessionPerdue() { run("globalThis.__sessionCompte = null; globalThis.__notifierAuth();"); return this; },
      panneAuth(code) { run(`globalThis.__erreurAuth = ${code ? `Object.assign(new Error(${JSON.stringify(code)}), { code: ${JSON.stringify(code)} })` : "null"}`); return this; },
      mailsReinitialisation: () => run("globalThis.__mailsReinit.slice()"),
      persistanceChoisie: () => run("globalThis.__persistance"),
      comptesCrees: () => run("Object.keys(globalThis.__comptes)"),
      fiche: (uid) => run(`globalThis.__cloud[${JSON.stringify("acces/" + uid)}] || null`),
      ecrireCloud(cle, valeur) { run(`globalThis.__cloud[${JSON.stringify(cle)}] = ${JSON.stringify(valeur)};`); return this; },

      cloud: (cle) => run(`globalThis.__cloud[${JSON.stringify(cle)}] || null`),
      cloudPrincipal() { const c = run("globalThis.__cloud"); const k = Object.keys(c).find(x => !x.includes("__clock")); return k ? c[k] : null; },
      ecrituresCloud: () => run("globalThis.__ecritures"),
      rejeuxCloud: () => run("globalThis.__rejeux"),
      /* Fait écrire « quelqu'un d'autre » entre la lecture et l'écriture de
         la prochaine transaction. */
      collisionUneFois(payload, suffixe) {
        run(`globalThis.__collisionUneFois = function () {
          const cle = "kpi_sync/" + (getSyncConfig() || {}).code + ${JSON.stringify(suffixe || "")};
          globalThis.__cloud[cle] = ${JSON.stringify(payload)};
          globalThis.__versions[cle] = (globalThis.__versions[cle] || 0) + 1;
        };`);
        return this;
      },
      ecoutesActives: () => run("globalThis.__ecoutes.length"),
      /* Les documents écoutés, pour distinguer l'annuaire lui-même du
         document séparé des empreintes. */
      ecoutesCles: () => run("globalThis.__ecoutes.map(e => e.cle)"),
      panneCloud(message) { run(`globalThis.__erreurCloud = ${message ? `Object.assign(new Error(${JSON.stringify(message)}), { code: ${JSON.stringify(message)} })` : "null"}`); return this; },

      /* --- interactions simulées --- */
      confirmer(v) { reponseConfirm = !!v; return this; },
      /* Dépose un fichier que fetch() servira. Une valeur null simule une
         absence (404), ce qui doit rester sans conséquence. */
      servir(chemin, contenu) { fichiersServis[String(chemin).replace(/^\.\//, "")] = contenu; return this; },
      oublierFichiers() { fichiersServis = {}; return this; },
      messages: () => run("globalThis.__msg.slice()"),
      dernierMessage: () => { const m = run("globalThis.__msg.slice()"); return m[m.length - 1] || ""; },
      alertes: () => captures.alertes.slice(),
      ouvertures: () => captures.ouvertures.slice(),
      fichiersExportes: () => captures.fichiers.slice(),
      stockage: () => Object.assign({}, memoire),
      ecrireStockage(cle, valeur) { memoire[cle] = typeof valeur === "string" ? valeur : JSON.stringify(valeur); return this; }
    };

    // A.titleKey("x") appelle directement la fonction dans le bac à sable
    return new Proxy(outils, {
      get(o, p) {
        if (p in o) return o[p];
        if (typeof p !== "string") return undefined;
        if (p === "then" || p === "catch" || p === "finally") return undefined;
        return (...args) => run(p + "(" + args.map(a => JSON.stringify(a === undefined ? null : a)).join(",") + ")");
      }
    });
  }

  const API = { creerHarnais, creerElement };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else Object.assign(root, API);
})(typeof globalThis !== "undefined" ? globalThis : this);
