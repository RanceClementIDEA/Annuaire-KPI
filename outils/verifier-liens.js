#!/usr/bin/env node
/* ============================================================
   VÉRIFICATION DES LIENS POWER BI DE L'ANNUAIRE
   ------------------------------------------------------------
   Répond à une seule question, fiche par fiche : ce lien
   affichera-t-il LE graphique, ou autre chose ?

     • lien de visuel      → le graphique seul  ✓
     • lien de page        → tout le rapport    ✗
     • visuel très allongé → format inhabituel : à ouvrir pour
                             confirmer que c'est le bon élément

   Il signale aussi les visuels utilisés par PLUSIEURS KPI : un
   même graphique pour deux indicateurs différents est presque
   toujours un copier-coller resté en place.

   Utilisation :
     node outils/verifier-liens.js sauvegarde.json
     node outils/verifier-liens.js selection.json

   La sauvegarde s'obtient dans l'application (Synchronisation →
   « Exporter la sauvegarde »), la sélection dans la fenêtre de
   génération (« ⬇ Exporter la sélection »).
   ============================================================ */
"use strict";

const fs = require("node:fs");
const Pptx = require("../js/pptx.js");

/** Extrait les couples (KPI, lien) d'une sauvegarde ou d'une sélection. */
function liensDuFichier(donnees) {
  if (Array.isArray(donnees.diapos)) {
    return donnees.diapos.map(d => ({ titre: d.titre, freq: "", perimetre: d.site || "", lien: d.lien }));
  }
  const fiches = [].concat(donnees.manualEntries || [], donnees.personalEntries || []);
  const perimetres = (donnees.sites || []).map(s => s && s.key).filter(Boolean);
  const cles = perimetres.length ? perimetres : ["logistiport", "armement", "armateur", "global"];
  const sortie = [];
  fiches.forEach(k => {
    cles.forEach(cle => {
      if (k && typeof k[cle] === "string" && k[cle]) {
        sortie.push({ titre: k.title || "?", freq: k.freq || "", perimetre: cle, lien: k[cle] });
      }
    });
  });
  return sortie;
}

/** Verdict lisible pour une entrée. */
function verdict(info) {
  if (info.type === "visuel" && info.aplati) {
    return { ok: false, etiquette: "ALLONGÉ",
             note: "plus de dix fois plus large que haut — ouvrez-le pour confirmer" };
  }
  if (info.type === "visuel") return { ok: true, etiquette: "visuel", note: "" };
  if (info.type === "lien-court") {
    return { ok: false, etiquette: "PAGE", note: "lien court : affiche toute la page du rapport" };
  }
  if (info.type === "page") {
    return { ok: false, etiquette: "PAGE", note: "adresse de page : affiche tout le rapport" };
  }
  return { ok: false, etiquette: "?", note: "adresse non reconnue" };
}

/** Analyse complète, sans affichage : testable directement. */
function analyser(donnees) {
  const entrees = liensDuFichier(donnees).map(e => {
    const info = Pptx.analyserLien(e.lien);
    return Object.assign({}, e, { info, verdict: verdict(info) });
  });

  // Un même visuel servant plusieurs intitulés = copier-coller oublié
  const parVisuel = new Map();
  entrees.forEach(e => {
    if (e.info.type !== "visuel") return;
    const cle = e.info.visualName;
    if (!parVisuel.has(cle)) parVisuel.set(cle, new Set());
    parVisuel.get(cle).add(e.titre);
  });
  const partages = [...parVisuel.entries()]
    .filter(([, titres]) => titres.size > 1)
    .map(([visuel, titres]) => ({ visuel, titres: [...titres] }));

  return {
    entrees,
    bons: entrees.filter(e => e.verdict.ok).length,
    pages: entrees.filter(e => e.verdict.etiquette === "PAGE").length,
    bandeaux: entrees.filter(e => e.verdict.etiquette === "ALLONGÉ").length,
    partages
  };
}

function principal() {
  const chemin = process.argv[2];
  if (!chemin) {
    console.log("Utilisation : node outils/verifier-liens.js <sauvegarde.json | selection.json>");
    process.exit(1);
  }
  const r = analyser(JSON.parse(fs.readFileSync(chemin, "utf8")));

  const col = (v, n) => String(v === undefined || v === null ? "" : v).slice(0, n).padEnd(n);
  console.log(col("KPI", 42) + col("Fréquence", 14) + col("Périmètre", 13) + col("Verdict", 9) + "Détail");
  console.log("-".repeat(120));
  r.entrees.forEach(e => {
    const format = e.info.largeur ? Math.round(e.info.largeur) + "×" + Math.round(e.info.hauteur) + " px" : "";
    console.log(col(e.titre, 42) + col(e.freq, 14) + col(e.perimetre, 13) +
                col(e.verdict.ok ? "  ✓" : "  ✗", 9) +
                [e.verdict.etiquette, format, e.verdict.note].filter(Boolean).join(" · "));
  });
  console.log("-".repeat(120));
  console.log(`${r.entrees.length} lien(s) · ${r.bons} sans réserve · ${r.pages} de page · ${r.bandeaux} au format allongé`);

  if (r.partages.length) {
    console.log("\nUn même visuel sert plusieurs KPI — vérifiez qu'il s'agit bien du bon :");
    r.partages.forEach(p => console.log(`  visuel ${p.visuel} → ${p.titres.join(", ")}`));
  }
  if (r.pages || r.bandeaux) {
    console.log("\nPour reprendre un lien : dans Power BI, sur LE visuel, « … » → Partager →");
    console.log("« Lien vers cet élément visuel », puis collez-le dans la fiche du KPI.");
  }
  process.exit(r.pages || r.bandeaux ? 1 : 0);
}

if (require.main === module) principal();

module.exports = { liensDuFichier, verdict, analyser };
