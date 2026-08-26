/* ============================================================
   PLUSIEURS UTILISATEURS EN MÊME TEMPS
   ------------------------------------------------------------
   L'annuaire est partagé : plusieurs personnes le modifient depuis
   des postes différents, parfois à la seconde près. Le document
   Firestore est remplacé EN ENTIER à chaque envoi — c'est donc là
   que le travail d'un collègue peut disparaître.

   Ce banc ouvre N navigateurs réels sur la même application et les
   fait travailler simultanément, contre un même nuage. Ce qu'il
   vérifie :

     • aucune fiche ne disparaît quand deux personnes écrivent
       en même temps ;
     • la nouvelle fenêtre de génération — zones multiples comprises —
       ne perturbe pas la synchronisation ;
     • personne ne fait tomber la page (aucune erreur JavaScript) ;
     • les empreintes livrées restent intactes chez tout le monde.

   Le nuage est simulé ici : Firestore est hors d'atteinte depuis ce
   bac à sable. Le faux nuage reproduit ce qui compte pour l'épreuve —
   un document unique et partagé, remplacé en entier, avec la même
   latence pour tous. Toute la logique de fusion exercée est celle de
   l'application, pas une imitation.

   Lancement :  node smoke-concurrence.js [--postes 6] [--tours 4]
   ============================================================ */
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const RACINE = __dirname;
const PORT = 8955;

const argv = process.argv.slice(2);
const lire = (n, d) => {
  const i = argv.indexOf("--" + n);
  return i >= 0 ? Number(argv[i + 1]) : d;
};
const POSTES = lire("postes", 6);
const TOURS = lire("tours", 4);

/* ─── Le nuage : UN document, partagé, remplacé en entier ──── */

const nuage = new Map();           // chemin → { donnees, version }
let ecritures = 0, lectures = 0, conflits = 0;

const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".ico": "image/x-icon",
  ".svg": "image/svg+xml", ".pptx": "application/octet-stream"
};

const serveur = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");

  if (url.pathname === "/nuage") {
    const cle = url.searchParams.get("doc") || "";
    if (req.method === "GET") {
      lectures++;
      const d = nuage.get(cle);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(d ? { existe: true, donnees: d.donnees, version: d.version } : { existe: false }));
    }
    if (req.method === "PUT") {
      let corps = "";
      req.on("data", c => { corps += c; });
      return req.on("end", () => {
        const avant = nuage.get(cle);
        const attendue = url.searchParams.get("version");
        /* Comme Firestore : le dernier arrivé remplace tout — SAUF si
           l'écriture annonce la version qu'elle a lue. Elle est alors
           refusée quand le document a bougé entre-temps, exactement comme
           une transaction qui doit se rejouer. */
        if (attendue !== null && Number(attendue) !== (avant ? avant.version : 0)) {
          conflits++;
          res.writeHead(409, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ conflit: true }));
        }
        ecritures++;
        nuage.set(cle, { donnees: JSON.parse(corps), version: (avant ? avant.version : 0) + 1 });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
    }
  }

  const f = path.join(RACINE, url.pathname === "/" ? "/index.html" : url.pathname);
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "text/plain" });
    res.end(d);
  });
});

/* ─── Le faux firebase, posé avant que l'application démarre ── */

function fauxFirebase() {
  const attendre = ms => new Promise(ok => setTimeout(ok, ms));
  const doc = chemin => ({
    _chemin: chemin,
    async get() {
      // Une latence variable : sans elle, les envois ne se croiseraient jamais.
      await attendre(20 + Math.floor(Math.random() * 60));
      const r = await fetch("/nuage?doc=" + encodeURIComponent(chemin));
      const j = await r.json();
      return { exists: j.existe, data: () => j.donnees };
    },
    async set(valeur) {
      await attendre(20 + Math.floor(Math.random() * 60));
      await fetch("/nuage?doc=" + encodeURIComponent(chemin),
        { method: "PUT", body: JSON.stringify(valeur) });
    },
    onSnapshot(cb) {
      // Une écoute qui interroge : suffisant pour propager entre postes.
      const t = setInterval(async () => {
        try {
          const r = await fetch("/nuage?doc=" + encodeURIComponent(chemin));
          const j = await r.json();
          if (j.existe) cb({ exists: true, data: () => j.donnees });
        } catch (e) { /* poste fermé */ }
      }, 500);
      return () => clearInterval(t);
    }
  });

  /* La transaction : on relit, on laisse le bloc s'exécuter, on écrit en
     annonçant la version lue. Refusée, on rejoue — comme Firestore. */
  async function runTransaction(bloc) {
    for (let essai = 0; essai < 8; essai++) {
      let lu = null;
      const t = {
        async get(ref) {
          const r = await fetch("/nuage?doc=" + encodeURIComponent(ref._chemin));
          const j = await r.json();
          lu = j.existe ? j.version : 0;
          return { exists: j.existe, data: () => j.donnees };
        },
        set(ref, valeur) { t._ecriture = { ref, valeur }; }
      };
      await bloc(t);
      if (!t._ecriture) return;
      await attendre(10 + Math.floor(Math.random() * 40));
      const r = await fetch("/nuage?doc=" + encodeURIComponent(t._ecriture.ref._chemin)
        + "&version=" + (lu === null ? 0 : lu),
        { method: "PUT", body: JSON.stringify(t._ecriture.valeur) });
      if (r.ok) return;
      await attendre(30 + essai * 60 + Math.floor(Math.random() * 80));
    }
    throw new Error("transaction abandonnée après 8 essais");
  }

  window.firebase = {
    apps: [],
    initializeApp(cfg) { window.firebase.apps.push(cfg); return cfg; },
    firestore: Object.assign(
      () => ({ collection: nom => ({ doc: id => doc(nom + "/" + id) }), runTransaction }),
      { FieldValue: { serverTimestamp: () => Date.now() } }
    )
  };
}

/* ─── Les fiches de départ, communes à tous les postes ─────── */

const ZONES = ["logistiport", "armement", "global", "site"];
const lienDe = (p, v, s) =>
  `https://app.powerbi.com/groups/me/reports/r1/${p}?pbi_source=shareVisual&visual=${v}&bookmarkGuid=${s}`;

const FICHES = [];
["Volumétrie Distribution", "Taux de service Réception", "Anticipation des Demandes"]
  .forEach((titre, ti) => {
    ["Mensuelle", "Hebdomadaire", "Quotidienne"].forEach((freq, fi) => {
      const fiche = {
        id: `kpi_${ti}_${fi}`, manual: true, title: titre, freq,
        ritual: "COPIL", type: "Contractuel", process: "Distribution",
        _mtime: 1000, _by: "depart"
      };
      ZONES.forEach((z, zi) => {
        fiche[z] = lienDe("p" + ti, "v" + ti, `${ti}-${fi}-${zi}`);
      });
      FICHES.push(fiche);
    });
  });

/* ─── L'épreuve ───────────────────────────────────────────── */

const resultats = [];
const etape = (nom, ok, detail) => {
  resultats.push({ nom, ok, detail });
  console.log((ok ? "  ✓ " : "  ✗ ") + nom + (detail ? " → " + detail : ""));
};

async function principal() {
  await new Promise(ok => serveur.listen(PORT, "127.0.0.1", ok));
  console.log(`\n${POSTES} postes, ${TOURS} tours — sur le même annuaire partagé\n`);

  const nav = await chromium.launch();
  const postes = [];
  const erreurs = [];

  for (let i = 0; i < POSTES; i++) {
    const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const nom = "poste" + (i + 1);
    page.on("pageerror", e => erreurs.push(nom + " · " + e.message));
    // Sans cela, Playwright REFUSE chaque confirm() et la génération s'annule.
    page.on("dialog", d => d.accept().catch(() => {}));
    page.on("console", m => {
            /* Un 409 n'est pas une panne : c'est une transaction qui se rejoue,
         exactement ce qu'on lui demande. */
      if (m.type() === "error" && !/favicon|net::ERR|409 \(Conflict\)/.test(m.text())) {
        erreurs.push(nom + " · console · " + m.text());
      }
    });
    await page.addInitScript(fauxFirebase);
    await page.addInitScript(([fiches, utilisateur]) => {
      localStorage.setItem("kpiUser", utilisateur);
      localStorage.setItem("kpiManualEntries", JSON.stringify(fiches));
    }, [FICHES, nom]);
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
    postes.push({ page, nom, i });
  }
  await Promise.all(postes.map(p => p.page.waitForTimeout(2500)));

  /* Tout le monde sur le même code de synchronisation. */
  await Promise.all(postes.map(p => p.page.evaluate(() => {
    setSyncConfig({ config: { projectId: "annuaire-kpi", apiKey: "x" }, code: "concurrence", enabled: true });
    connectSync(false);
  })));
  await Promise.all(postes.map(p => p.page.waitForTimeout(1500)));

  const etatSync = await postes[0].page.evaluate(() => !!fbDb);
  etape("la synchronisation démarre sur chaque poste", etatSync,
    etatSync ? "" : "fbDb absent — le faux nuage n'est pas branché");

  /* ── Tour par tour : tout le monde écrit EN MÊME TEMPS ── */
  for (let tour = 1; tour <= TOURS; tour++) {
    await Promise.all(postes.map(async ({ page, nom, i }) => {
      await page.evaluate(([n, t, idx]) => {
        // Chaque poste crée SA fiche, et ne touche qu'à elle.
        const id = "kpi_" + n + "_" + t;
        manualEntries.push({
          id, manual: true, title: "Ajout " + n, freq: "Mensuelle",
          ritual: "COPIL", type: "Contractuel", process: "Distribution",
          _mtime: Date.now(), _by: n,
          logistiport: "https://app.powerbi.com/groups/me/reports/r1/p9?pbi_source=shareVisual"
            + "&visual=v9&bookmarkGuid=" + idx + "-" + t
        });
        rebuildData(false);
        return pushToCloud(false, false);
      }, [nom, tour, i]);
    }));
    await Promise.all(postes.map(p => p.page.waitForTimeout(900)));
  }

  /* Laisser les écoutes se rattraper, puis un dernier envoi partout. */
  await Promise.all(postes.map(p => p.page.waitForTimeout(2500)));
  for (const { page } of postes) {
    await page.evaluate(() => pushToCloud(false, false));
    await page.waitForTimeout(300);
  }
  await Promise.all(postes.map(p => p.page.waitForTimeout(2500)));

  /* ── Ce qui doit rester ── */
  const attendu = POSTES * TOURS;
  const doc = nuage.get("kpi_sync/concurrence");
  const survivantes = doc ? doc.donnees.kpiManual.filter(k => /^kpi_poste/.test(k.id)).length : 0;
  etape(`les ${attendu} fiches créées simultanément survivent toutes`,
    survivantes === attendu, survivantes + "/" + attendu + " dans le nuage");

  const parPoste = await Promise.all(postes.map(p =>
    p.page.evaluate(() => manualEntries.filter(k => /^kpi_poste/.test(k.id)).length)));
  etape("chaque poste voit le travail de tous les autres",
    parPoste.every(n => n === attendu), parPoste.join(" / "));

  const fichesDepart = doc ? doc.donnees.kpiManual.filter(k => /^kpi_\d/.test(k.id)).length : 0;
  etape("les fiches de départ ne sont pas emportées", fichesDepart === FICHES.length,
    fichesDepart + "/" + FICHES.length);

  /* ── La nouvelle fenêtre, sous la même pression ── */
  await Promise.all(postes.map(async ({ page }) => {
    await page.evaluate(() => {
      basculerModeSelection(true);
      [...data].slice(0, 4).forEach(k => basculerSelection(k.id));
    });
    await page.click("#deckBtn");
    await page.waitForSelector("#deckModal:not(.hidden)", { timeout: 5000 });
  }));
  await Promise.all(postes.map(p => p.page.waitForTimeout(1200)));

  const lignesAvant = await Promise.all(postes.map(p =>
    p.page.locator("#deckList .deck-row").count()));
  etape("la fenêtre de génération s'ouvre partout", lignesAvant.every(n => n > 0),
    lignesAvant.join(" / "));

  /* Toutes les zones, sur tous les postes, pendant que la synchro tourne. */
  await Promise.all(postes.map(p => p.page.evaluate(() => toutesLesZones())));
  await Promise.all(postes.map(p => p.page.waitForTimeout(1200)));
  const lignesApres = await Promise.all(postes.map(p =>
    p.page.locator("#deckList .deck-row").count()));
  etape("« toutes les zones » multiplie les diapositives sans faillir",
    lignesApres.every((n, k) => n >= lignesAvant[k]), lignesApres.join(" / "));

  /* Une génération réelle, simultanée sur tous les postes. */
  const produits = await Promise.all(postes.map(async ({ page }) => {
    try {
      return await page.evaluate(async () => {
        const r = await genererDeck();
        return r ? r.diapos : 0;
      });
    } catch (e) { return -1; }
  }));
  etape("un PowerPoint est produit sur chaque poste en même temps",
    produits.every(n => n > 0), produits.join(" / "));

  /* Une écriture pendant que les fenêtres sont ouvertes : le pire moment. */
  await Promise.all(postes.map(({ page }, i) => page.evaluate(idx => {
    manualEntries.push({
      id: "kpi_final_" + idx, manual: true, title: "Pendant la génération",
      freq: "Mensuelle", ritual: "COPIL", _mtime: Date.now(), _by: "poste" + idx,
      logistiport: "https://app.powerbi.com/groups/me/reports/r1/p9?visual=v9&bookmarkGuid=f" + idx
    });
    rebuildData(false);
    return pushToCloud(false, false);
  }, i)));
  /* Quatre envois lancés à la même milliseconde : le dernier arrivé écrase
     tout. La question n'est donc pas « perd-on quelque chose dans l'instant »
     — c'est inévitable avec un document remplacé en entier — mais « est-ce
     rattrapé ». L'écoute distante et le renvoi en attente doivent recoller
     les morceaux sans intervention. */
  const compter = () => {
    const d = nuage.get("kpi_sync/concurrence");
    return d ? d.donnees.kpiManual.filter(k => /^kpi_final_/.test(k.id)).length : 0;
  };
  await Promise.all(postes.map(p => p.page.waitForTimeout(1500)));
  const aussitot = compter();
  for (let essai = 0; essai < 6 && compter() < POSTES; essai++) {
    await Promise.all(postes.map(p => p.page.waitForTimeout(1200)));
    await Promise.all(postes.map(({ page }) => page.evaluate(() => pushToCloud(false, false))));
  }
  await Promise.all(postes.map(p => p.page.waitForTimeout(1500)));
  const finales = compter();
  etape("une rafale d'écritures simultanées finit par tout conserver",
    finales === POSTES, finales + "/" + POSTES + " (aussitôt après la rafale : " + aussitot + ")");

  /* ═══ Les conflits qui font vraiment mal ═══════════════════
     Jusqu'ici chaque poste travaillait sur SA fiche. Les vrais dégâts
     viennent d'ailleurs : deux personnes sur la même fiche, une qui
     supprime pendant qu'une autre modifie, un poste hors-ligne qui
     revient avec du retard. */

  const refermer = async () => {
    await Promise.all(postes.map(({ page }) => page.evaluate(() => {
      if (typeof fermerDeckModal === "function") fermerDeckModal();
      basculerModeSelection(false);
    })));
    await Promise.all(postes.map(p => p.page.waitForTimeout(300)));
  };
  const poser = async () => {
    for (let essai = 0; essai < 5; essai++) {
      await Promise.all(postes.map(p => p.page.waitForTimeout(1000)));
      await Promise.all(postes.map(({ page }) => page.evaluate(() => pushToCloud(false, false))));
    }
    await Promise.all(postes.map(p => p.page.waitForTimeout(1500)));
  };
  await refermer();

  /* ── Tous sur LA MÊME fiche, au même instant ── */
  await Promise.all(postes.map(({ page }, i) => page.evaluate(idx => {
    const k = manualEntries.find(x => x.id === "kpi_0_0");
    if (k) { k.ritual = "Rituel du poste " + idx; k._mtime = Date.now() + idx; k._by = "poste" + idx; }
    rebuildData(false);
    return pushToCloud(false, false);
  }, i)));
  await poser();
  const docM = nuage.get("kpi_sync/concurrence");
  const commune = docM ? docM.donnees.kpiManual.find(k => k.id === "kpi_0_0") : null;
  const vues = await Promise.all(postes.map(p =>
    p.page.evaluate(() => (manualEntries.find(k => k.id === "kpi_0_0") || {}).ritual)));
  etape("une même fiche modifiée par tous garde UNE valeur, la même pour tous",
    !!commune && vues.every(v => v === commune.ritual),
    commune ? "« " + commune.ritual + " » partout : " + (new Set(vues).size === 1) : "fiche disparue");

  /* ── Un supprime pendant que les autres modifient ── */
  await Promise.all(postes.map(({ page }, i) => page.evaluate(idx => {
    if (idx === 0) {
      const k = manualEntries.find(x => x.id === "kpi_1_1");
      markDeleted("kpi_1_1", k);
      manualEntries = manualEntries.filter(x => x.id !== "kpi_1_1");
    } else {
      const k = manualEntries.find(x => x.id === "kpi_1_1");
      if (k) { k.ritual = "Modifié par " + idx; k._mtime = Date.now(); }
    }
    rebuildData(false);
    return pushToCloud(false, false);
  }, i)));
  await poser();
  const docS = nuage.get("kpi_sync/concurrence");
  const survit = docS && docS.donnees.kpiManual.some(k => k.id === "kpi_1_1");
  const marquee = docS && (docS.donnees.kpiDeleted || []).some(d => d.id === "kpi_1_1");
  const accord = await Promise.all(postes.map(p =>
    p.page.evaluate(() => data.some(k => k.id === "kpi_1_1"))));
  etape("suppression contre modification : tous les postes tranchent pareil",
    new Set(accord).size === 1,
    "visible chez " + accord.filter(Boolean).length + "/" + POSTES
      + " · marqueur au nuage : " + (marquee ? "oui" : "non")
      + " · fiche au nuage : " + (survit ? "oui" : "non"));

  /* ── Un poste hors-ligne, qui revient ── */
  const isole = postes[POSTES - 1];
  await isole.page.evaluate(() => { navigator.__enLigne = false;
    Object.defineProperty(navigator, "onLine", { get: () => navigator.__enLigne, configurable: true }); });
  await isole.page.evaluate(() => {
    manualEntries.push({ id: "kpi_horsligne", manual: true, title: "Fait hors-ligne",
      freq: "Mensuelle", ritual: "COPIL", _mtime: Date.now(), _by: "isolé",
      logistiport: "https://app.powerbi.com/groups/me/reports/r1/p9?visual=v9&bookmarkGuid=hl" });
    rebuildData(false);
    return pushToCloud(false, false);
  });
  const enAttente = await isole.page.evaluate(() => pendingPush);
  // Pendant ce temps, les autres continuent.
  await Promise.all(postes.slice(0, -1).map(({ page }, i) => page.evaluate(idx => {
    manualEntries.push({ id: "kpi_pendant_" + idx, manual: true, title: "Pendant l'absence",
      freq: "Mensuelle", ritual: "COPIL", _mtime: Date.now(), _by: "poste" + idx,
      logistiport: "https://app.powerbi.com/groups/me/reports/r1/p9?visual=v9&bookmarkGuid=pa" + idx });
    rebuildData(false);
    return pushToCloud(false, false);
  }, i)));
  await poser();
  await isole.page.evaluate(() => { navigator.__enLigne = true; window.dispatchEvent(new Event("online")); });
  await poser();
  const docH = nuage.get("kpi_sync/concurrence");
  const horsLigne = docH && docH.donnees.kpiManual.some(k => k.id === "kpi_horsligne");
  const pendant = docH ? docH.donnees.kpiManual.filter(k => /^kpi_pendant_/.test(k.id)).length : 0;
  etape("un poste hors-ligne retrouve le fil sans rien écraser",
    enAttente && horsLigne && pendant === POSTES - 1,
    "envoi mis en attente : " + enAttente + " · sa fiche revenue : " + horsLigne
      + " · fiches des autres : " + pendant + "/" + (POSTES - 1));

  /* ── Les ZONES, modifiées de partout : c'est la nouveauté ── */
  await Promise.all(postes.map(({ page }, i) => page.evaluate(idx => {
    sites.push({ key: "zone" + idx, name: "Zone du poste " + idx, _mtime: Date.now() });
    saveSites(true);
  }, i)));
  await poser();
  const docZ = nuage.get("kpi_sync/concurrence");
  const zones = docZ ? (docZ.donnees.kpiSites || []).filter(z => /^zone\d/.test(z.key)).length : 0;
  const zonesVues = await Promise.all(postes.map(p =>
    p.page.evaluate(() => activeSites().filter(z => /^zone\d/.test(z.key)).length)));
  etape("les zones créées simultanément survivent toutes",
    zones === POSTES && zonesVues.every(n => n === POSTES),
    zones + "/" + POSTES + " au nuage · vues : " + zonesVues.join("/"));

  /* ── Des sélections enregistrées en même temps ── */
  await Promise.all(postes.map(({ page }, i) => page.evaluate(idx => {
    selectionIds = data.slice(0, 3).map(k => k.id);
    enregistrerSelection("Rituel " + idx);
  }, i)));
  await poser();
  const docP = nuage.get("kpi_sync/concurrence");
  const presets = docP ? (docP.donnees.kpiPresets || []).length : 0;
  etape("les sélections enregistrées en même temps survivent toutes",
    presets >= POSTES, presets + "/" + POSTES);

  /* ── Et après un rechargement complet ── */
  const attenduApres = nuage.get("kpi_sync/concurrence").donnees.kpiManual.length;
  await Promise.all(postes.map(async ({ page }) => {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    await page.evaluate(() => connectSync(false));
  }));
  await Promise.all(postes.map(p => p.page.waitForTimeout(3000)));
  const apresRechargement = await Promise.all(postes.map(p =>
    p.page.evaluate(() => manualEntries.length)));
  etape("après rechargement, chaque poste retrouve tout",
    apresRechargement.every(n => n === attenduApres),
    apresRechargement.join("/") + " (attendu " + attenduApres + ")");

  /* ── Les empreintes publiées en même temps ──
     Elles vivent dans un document à part, et suivent la même règle : le
     dernier arrivé remplace tout. Chaque poste en publie une qui n'existe
     que chez lui ; aucune ne doit se perdre. */
  await Promise.all(postes.map(({ page }, i) => page.evaluate(idx => {
    const base = empreintes.find(e => e.proprietes && e.proprietes.bookmark);
    if (!base) return false;
    empreintes = empreintes.concat([{
      id: "rapport/page/visuel-poste" + idx + "/signet" + idx,
      libelle: "Empreinte du poste " + idx,
      signet: "signet" + idx,
      proprietes: JSON.parse(JSON.stringify(base.proprietes)),
      _mtime: Date.now(), _by: "poste" + idx
    }]);
    return pousserEmpreintes();
  }, i)));
  for (let essai = 0; essai < 4; essai++) {
    await Promise.all(postes.map(p => p.page.waitForTimeout(900)));
    await Promise.all(postes.map(({ page }) => page.evaluate(() => pousserEmpreintes())));
  }
  await Promise.all(postes.map(p => p.page.waitForTimeout(1200)));
  const docE = nuage.get("kpi_sync/concurrence__empreintes");
  const publiees = docE
    ? (docE.donnees.kpiEmpreintes || []).filter(e => /visuel-poste/.test(e.id)).length : 0;
  etape("des empreintes publiées en même temps ne s'écrasent pas",
    publiees === POSTES, publiees + "/" + POSTES);

  /* Les empreintes livrées doivent être intactes partout. */
  const livrees = await Promise.all(postes.map(p =>
    p.page.evaluate(() => empreintes
      .filter(e => e.proprietes && e.proprietes.bookmark && !/visuel-poste/.test(e.id)).length)));
  etape("les empreintes livrées restent intactes sur tous les postes",
    livrees.every(n => n === livrees[0] && n > 0), livrees.join(" / "));

  etape("aucune erreur JavaScript nulle part", erreurs.length === 0,
    erreurs.slice(0, 4).join(" | "));

  console.log(`\n  ${lectures} lectures, ${ecritures} écritures, ${conflits} transaction(s) rejouée(s)`);

  await nav.close();
  serveur.close();

  const rates = resultats.filter(r => !r.ok);
  console.log(rates.length
    ? `\n${rates.length} contrôle(s) en échec.\n`
    : "\nRien ne casse : les postes travaillent ensemble sans se marcher dessus.\n");
  process.exitCode = rates.length ? 1 : 0;
}

principal().catch(err => {
  console.error("✗ " + err.stack);
  process.exit(1);
});
