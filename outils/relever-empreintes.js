#!/usr/bin/env node
/* ============================================================
   RELEVÉ DES EMPREINTES DE VISUELS
   ------------------------------------------------------------
   Lit un ou plusieurs PowerPoint dans lesquels les visuels Power BI
   ont été insérés À LA MAIN, et en extrait ce que le complément avait
   mémorisé. Ce relevé, versé dans l'annuaire, permet ensuite de
   fabriquer autant de supports qu'on veut sans refaire l'insertion.

   Un fichier fabriqué de toutes pièces ne suffit pas : sans cette
   mémoire, le complément conclut que l'objet visuel n'existe plus,
   même quand l'adresse est rigoureusement la bonne.

   Utilisation :
     node outils/relever-empreintes.js support.pptx [autre.pptx …]
     node outils/relever-empreintes.js *.pptx --sortie empreintes.json

   L'état sérialisé pèse ~5 Ko par visuel et n'est pas facultatif :
   vérifié en conditions réelles, une empreinte réduite à la carte
   d'identité laisse le complément afficher « l'objet visuel n'existe
   plus ». C'est le prix d'une génération qui marche.
   ============================================================ */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const Zip = require("../js/zip.js");
const Empreintes = require("../js/empreintes.js");

/** Propriétés d'un complément, valeurs laissées encodées pour XML. */
function proprietesDe(xml) {
  const out = {};
  const re = /<we:property name="([^"]+)" value="(.*?)"\/>/gs;
  let m;
  while ((m = re.exec(xml))) out[m[1]] = m[2];
  return out;
}

/** Toutes les empreintes exploitables d'un fichier. */
async function relever(octets, options) {
  const o = options || {};
  const pieces = await Zip.lireZip(octets);
  const noms = [...pieces.keys()]
    .filter(n => /^ppt\/webextensions\/webextension\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/(\d+)/)[1]) - Number(b.match(/(\d+)/)[1]));

  /* Un même visuel peut avoir été inséré sur plusieurs diapositives :
     on garde le relevé le plus complet, jamais le dernier vu. */
  const map = new Map();
  noms.forEach(nom => {
    const props = proprietesDe(Zip.versTexte(pieces.get(nom)));
    const emp = Empreintes.creerEmpreinte(props, {
      horodatage: o.horodatage || 0,
      auteur: o.auteur || "relevé"
    });
    if (!emp) return;
    const retenue = emp;
    const avant = map.get(retenue.id);
    if (!avant || Object.keys(retenue.proprietes).length > Object.keys(avant.proprietes).length) {
      map.set(retenue.id, retenue);
    }
  });
  return [...map.values()];
}

/**
 * Relevé de plusieurs fichiers, dédoublonné.
 * Deux fichiers peuvent porter le même visuel : on garde le relevé le
 * plus complet, faute de quoi une version allégée écraserait l'autre.
 */
async function releverPlusieurs(chemins, options) {
  const map = new Map();
  for (const chemin of chemins) {
    const lot = await relever(new Uint8Array(fs.readFileSync(chemin)), options);
    lot.forEach(emp => {
      const avant = map.get(emp.id);
      const mieux = !avant
        || Object.keys(emp.proprietes).length > Object.keys(avant.proprietes).length;
      if (mieux) map.set(emp.id, Object.assign({}, emp, { source: path.basename(chemin) }));
    });
  }
  return [...map.values()];
}

function options(argv) {
  const o = { fichiers: [], sortie: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--sortie") o.sortie = argv[++i];
    else if (a.startsWith("--")) throw new Error("Option inconnue : " + a);
    else o.fichiers.push(a);
  }
  return o;
}

async function principal() {
  let o;
  try { o = options(process.argv.slice(2)); }
  catch (err) { console.error("✗ " + err.message); process.exit(1); }

  if (!o.fichiers.length) {
    console.log("Utilisation : node outils/relever-empreintes.js <support.pptx> [autre.pptx …]"
      + " [--sortie empreintes.json]");
    process.exit(1);
  }

  const manquants = o.fichiers.filter(f => !fs.existsSync(f));
  if (manquants.length) {
    console.error("✗ Fichier introuvable : " + manquants.join(", "));
    process.exit(1);
  }

  const lot = await releverPlusieurs(o.fichiers, { horodatage: Date.now() });
  if (!lot.length) {
    console.log("Aucun visuel Power BI inséré à la main dans ce ou ces fichiers.");
    console.log("Le relevé ne fonctionne que sur un support où l'insertion a été faite"
      + " depuis PowerPoint (Insertion › Compléments › Power BI).");
    process.exit(2);
  }

  const json = JSON.stringify(lot, null, 2);
  if (o.sortie) fs.writeFileSync(o.sortie, json);

  console.log(lot.length + " empreinte(s) relevée(s) — " + (Empreintes.poids(lot) / 1024).toFixed(1) + " Ko");
  lot.forEach(e => {
    const noms = Object.keys(e.proprietes);
    console.log("  " + (e.libelle || "(sans nom)") + "  ·  " + e.id);
    console.log("      " + noms.length + " champ(s) : " + noms.join(", ")
      + (e.source ? "   [" + e.source + "]" : ""));
  });

  if (o.sortie) console.log("\n✓ " + o.sortie + "\n  À verser dans l'annuaire : bouton « Importer des empreintes ».");
  else console.log("\n" + json);
}

if (require.main === module) {
  principal().catch(err => { console.error("✗ " + err.message); process.exit(1); });
}

module.exports = { proprietesDe, relever, releverPlusieurs, options };
