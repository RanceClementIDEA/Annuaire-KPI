#!/usr/bin/env node
/* ============================================================
   DIAGNOSTIC : PEUT-ON DÉRIVER UNE EMPREINTE D'UNE AUTRE ?
   ------------------------------------------------------------
   L'enjeu est le seul qui compte encore. Un annuaire de 13 KPI ×
   3 temporalités × 4 zones, c'est 156 liens, donc 156 insertions
   manuelles. Intenable.

   Or l'état sérialisé d'un signet contient les SEGMENTS de la page :
   le KPI choisi, la priorité, la dimension d'affichage, le code aire.
   Comparés deux à deux, deux états du même visuel ne diffèrent que
   par une dizaine de conteneurs sur cinquante-quatre — ceux-là mêmes.

   Si le complément accepte un état ré-encodé, alors une empreinte
   relevée à la main peut engendrer toutes ses variantes, et 156
   redevient 13.

   Quatre diapositives, dans cet ordre :

     1  l'empreinte A, intacte              → doit marcher
     2  A décompressée puis RECOMPRESSÉE,   → si elle échoue, tout
        sans la moindre modification           s'arrête ici
     3  A dérivée vers B, posée sur B       → la question
     4  l'empreinte B, intacte              → le repère de comparaison

   Utilisation :
     node outils/diagnostic-derivation.js --reference <support.pptx>
   ============================================================ */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const Pptx = require("../js/pptx.js");
const Empreintes = require("../js/empreintes.js");
const { relever } = require("./relever-empreintes.js");

const RACINE = path.join(__dirname, "..");

/* ─── L'état, dans les deux sens ───────────────────────────── */

function lireEtat(valeur) {
  const b64 = String(valeur || "").replace(/&quot;/g, "").replace(/^"|"$/g, "");
  return JSON.parse(zlib.gunzipSync(Buffer.from(b64, "base64")).toString("utf8"));
}

function ecrireEtat(objet) {
  const b64 = zlib.gzipSync(Buffer.from(JSON.stringify(objet), "utf8")).toString("base64");
  return "&quot;" + b64 + "&quot;";
}

/** La section active d'un état — celle qui porte les conteneurs. */
function section(etat) {
  const e = etat.explorationState;
  return e.sections[e.activeSection] || { visualContainers: {} };
}

/**
 * Les conteneurs qui distinguent deux états du même visuel.
 * Ce sont les segments : KPI retenu, priorité, dimension, code aire.
 * @returns {string[]}
 */
function conteneursDivergents(a, b) {
  const va = section(a).visualContainers || {};
  const vb = section(b).visualContainers || {};
  return Object.keys(va).filter(k => JSON.stringify(va[k]) !== JSON.stringify(vb[k]));
}

/**
 * L'état A, dont les conteneurs divergents ont pris la valeur de B.
 *
 * On ne fabrique rien : on recopie, conteneur par conteneur, ce que
 * Power BI a lui-même écrit. Tout le reste de l'état — les 44 autres
 * conteneurs, les filtres de section, les objets — reste celui de A,
 * intact.
 */
function deriver(a, b) {
  const sortie = JSON.parse(JSON.stringify(a));
  const cible = section(sortie).visualContainers;
  const source = section(b).visualContainers || {};
  conteneursDivergents(a, b).forEach(k => {
    if (source[k] === undefined) delete cible[k];
    else cible[k] = JSON.parse(JSON.stringify(source[k]));
  });
  return sortie;
}

/** Deux empreintes du même visuel, s'il y en a. */
function deuxDuMemeVisuel(lot) {
  for (let i = 0; i < lot.length; i++) {
    for (let j = i + 1; j < lot.length; j++) {
      const va = Empreintes.pageDeCle(lot[i].id) + "/" + lot[i].id.split("/")[2];
      const vb = Empreintes.pageDeCle(lot[j].id) + "/" + lot[j].id.split("/")[2];
      if (va === vb && lot[i].proprietes.bookmark && lot[j].proprietes.bookmark) {
        return [lot[i], lot[j]];
      }
    }
  }
  return null;
}

/** Le lien d'une empreinte, reconstitué depuis sa clé et son signet. */
function lienDe(emp) {
  const [rapport, page, visuel] = emp.id.split("/");
  return "https://app.powerbi.com/groups/me/reports/" + rapport + "/" + page
    + "?pbi_source=shareVisual&visual=" + visuel
    + (emp.signet ? "&bookmarkGuid=" + emp.signet : "");
}

function variantes(a, b) {
  const pa = Empreintes.proprietesPour(a);
  const pb = Empreintes.proprietesPour(b);
  const etatA = lireEtat(pa.bookmark);
  const etatB = lireEtat(pb.bookmark);
  const derive = deriver(etatA, etatB);
  const avec = (props, etat) => Object.assign({}, props,
    { bookmark: ecrireEtat(etat), initialStateBookmark: ecrireEtat(etat) });

  return [
    { code: "1", titre: "1 — empreinte A, intacte",
      explication: "témoin : doit afficher le graphique de A",
      lien: lienDe(a), proprietesComplement: pa },

    { code: "2", titre: "2 — A, décompressée puis RECOMPRESSÉE à l'identique",
      explication: "aucune modification, seulement un aller-retour. Si elle échoue, "
        + "aucune dérivation n'est possible et il faut 156 relevés.",
      lien: lienDe(a), proprietesComplement: avec(pa, etatA) },

    { code: "3", titre: "3 — A dérivée vers B, posée sur le lien de B",
      explication: "les " + conteneursDivergents(etatA, etatB).length + " segments qui "
        + "distinguent B ont été recopiés dans l'état de A. Si cette diapositive "
        + "ressemble à la 4, une empreinte engendre toutes ses variantes.",
      lien: lienDe(b), proprietesComplement: avec(pa, derive) },

    { code: "4", titre: "4 — empreinte B, intacte",
      explication: "le repère : voilà ce que la 3 doit montrer",
      lien: lienDe(b), proprietesComplement: pb }
  ];
}

async function construire(a, b) {
  const modele = new Uint8Array(fs.readFileSync(path.join(RACINE, "modele-deck.pptx")));
  return Pptx.construireDeck(modele, {
    titre: "Une empreinte peut-elle en engendrer d'autres ?",
    sousTitre: "Si oui, 156 relevés redeviennent 13",
    periode: "Comparez surtout la 3 et la 4",
    diapos: variantes(a, b).map(v => ({
      titre: v.titre, commentaire: v.explication, lien: v.lien, vivant: true,
      proprietesComplement: v.proprietesComplement
    }))
  });
}

module.exports = {
  lireEtat, ecrireEtat, section, conteneursDivergents, deriver,
  deuxDuMemeVisuel, lienDe, variantes, construire
};

async function principal() {
  const argv = process.argv.slice(2);
  const lire = n => { const i = argv.indexOf("--" + n); return i >= 0 ? argv[i + 1] : null; };
  const reference = lire("reference");
  if (!reference) {
    console.log('Utilisation : node outils/diagnostic-derivation.js --reference <support.pptx> [--sortie f.pptx]');
    process.exit(1);
  }

  const lot = await relever(new Uint8Array(fs.readFileSync(reference)), { horodatage: 1 });
  const paire = deuxDuMemeVisuel(lot);
  if (!paire) {
    console.error("✗ Il faut deux insertions du MÊME visuel avec des signets différents dans " + reference);
    process.exit(2);
  }

  const [a, b] = paire;
  const divergents = conteneursDivergents(lireEtat(a.proprietes.bookmark),
                                          lireEtat(b.proprietes.bookmark));
  console.log("A : signet " + a.signet.slice(0, 8) + "   B : signet " + b.signet.slice(0, 8));
  console.log(divergents.length + " conteneur(s) les distinguent, sur "
    + Object.keys(section(lireEtat(a.proprietes.bookmark)).visualContainers).length);

  const sortie = lire("sortie") || path.join(process.cwd(), "DIAGNOSTIC-derivation.pptx");
  fs.writeFileSync(sortie, Buffer.from(await construire(a, b)));
  console.log("\n✓ " + sortie);
  variantes(a, b).forEach(v => console.log("  " + v.code + " · " + v.explication));
}

if (require.main === module) {
  principal().catch(err => { console.error("✗ " + err.message); process.exit(1); });
}
