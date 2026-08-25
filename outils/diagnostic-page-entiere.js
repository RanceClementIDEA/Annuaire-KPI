#!/usr/bin/env node
/* ============================================================
   DIAGNOSTIC : LA PAGE ENTIÈRE, SANS EMPREINTE
   ------------------------------------------------------------
   Acquis, et coûteux : un lien de VISUEL exige une empreinte —
   l'état mémorisé lors d'une insertion manuelle — et cette
   empreinte est propre à son signet, donc à un seul KPI.

   D'où l'idée : ne plus désigner un visuel, mais la PAGE. Il n'y
   a alors plus d'objet à retrouver, donc peut-être plus rien à
   mémoriser. Et la page apporte en prime ses sélecteurs — mois,
   semaines, année, filtres — que le visuel seul ne montre pas.

   Cinq formes d'adresse, AUCUNE empreinte nulle part.

   Utilisation :
     node outils/diagnostic-page-entiere.js --lien "<url d'un KPI>"
   ============================================================ */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const Pptx = require("../js/pptx.js");

const RACINE = path.join(__dirname, "..");

/** Adresse privée du paramètre demandé. */
function sansParametre(url, nom) {
  return String(url)
    .replace(new RegExp("([?&])" + nom + "=[^&]*&?", "g"), "$1")
    .replace(/[?&]$/, "");
}

/** Ne garde que les paramètres nommés. */
function seulement(url, noms) {
  const [base, requete] = String(url).split("?");
  if (!requete) return base;
  const gardes = requete.split("&")
    .filter(p => noms.indexOf(p.split("=")[0]) >= 0);
  return gardes.length ? base + "?" + gardes.join("&") : base;
}

function variantes(lien) {
  const sansVisuel = sansParametre(lien, "visual");
  return [
    { code: "A", titre: "A — la page, avec le signet du KPI",
      explication: "plus de « visual » : la page entière, filtres et sélecteurs compris, "
        + "avec le signet qui porte la sélection de ce KPI",
      lien: sansVisuel },

    { code: "B", titre: "B — la page, sans le signet",
      explication: "la page dans son état par défaut : montre ce qu'on obtient sans aucune sélection",
      lien: sansParametre(sansVisuel, "bookmarkGuid") },

    { code: "C", titre: "C — la page, sans la marque de partage",
      explication: "« pbi_source=shareVisual » retiré : une adresse de rapport ordinaire, "
        + "avec le signet conservé",
      lien: sansParametre(sansVisuel, "pbi_source") },

    { code: "D", titre: "D — l'adresse la plus simple : rapport et page",
      explication: "seulement l'identifiant du locataire et le signet — rien d'autre",
      lien: seulement(sansVisuel, ["ctid", "bookmarkGuid"]) },

    { code: "E", titre: "E — témoin : le visuel seul, sans empreinte",
      explication: "connu pour échouer — sert de repère",
      lien }
  ];
}

async function construire(lien) {
  const modele = new Uint8Array(fs.readFileSync(path.join(RACINE, "modele-deck.pptx")));
  return Pptx.construireDeck(modele, {
    titre: "La page entière, sans empreinte",
    sousTitre: "Si l'une s'affiche, plus aucune insertion manuelle",
    periode: "Notez ce que montre chaque diapositive",
    diapos: variantes(lien).map(v => ({
      titre: v.titre, commentaire: v.explication, lien: v.lien, vivant: true
    }))
  });
}

async function principal() {
  const argv = process.argv.slice(2);
  const lire = n => { const i = argv.indexOf("--" + n); return i >= 0 ? argv[i + 1] : null; };
  const lien = lire("lien");
  if (!lien) {
    console.log('Utilisation : node outils/diagnostic-page-entiere.js --lien "<url>" [--sortie f.pptx]');
    process.exit(1);
  }
  const sortie = lire("sortie") || path.join(process.cwd(), "DIAGNOSTIC-page-entiere.pptx");
  fs.writeFileSync(sortie, Buffer.from(await construire(lien)));
  console.log("✓ " + sortie + "\n");
  variantes(lien).forEach(v => console.log("  " + v.code + " · " + v.lien));
}

if (require.main === module) {
  principal().catch(err => { console.error("✗ " + err.message); process.exit(1); });
}

module.exports = { sansParametre, seulement, variantes, construire };
