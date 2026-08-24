#!/usr/bin/env node
/* ============================================================
   GÉNÉRATION DU SUPPORT DEPUIS UNE SÉLECTION EXPORTÉE
   ------------------------------------------------------------
   Reprend le fichier .json produit par l'annuaire (« ⬇ Exporter la
   sélection ») et un dossier de captures, et fabrique le PowerPoint
   avec les VISUELS, pas seulement les liens.

   Utilise exactement la même fabrique que l'application (js/pptx.js) :
   un seul code, une seule mise en page, un seul jeu de tests.

   Utilisation :
     node outils/generer-deck.js selection.json
     node outils/generer-deck.js selection.json --captures captures --sortie deck.pptx
   ============================================================ */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const Pptx = require("../js/pptx.js");

const RACINE = path.join(__dirname, "..");

/**
 * Lit les arguments `--nom valeur` et les drapeaux `--nom` seuls.
 * Un drapeau suivi d'un autre drapeau (ou en fin de ligne) vaut `true` :
 * sans cela, `--vivant --sortie deck.pptx` avalait « --sortie » comme
 * valeur de « vivant » et le fichier atterrissait ailleurs.
 */
function options(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) { o._.push(argv[i]); continue; }
    const nom = argv[i].slice(2);
    const suivant = argv[i + 1];
    if (suivant === undefined || suivant.startsWith("--")) o[nom] = true;
    else { o[nom] = suivant; i++; }
  }
  return o;
}

/** Vérifie qu'un fichier est bien une sélection exportée par l'annuaire. */
function lireSelection(chemin) {
  const sel = JSON.parse(fs.readFileSync(chemin, "utf8"));
  if (!sel || sel._format !== "annuaire-kpi-selection") {
    throw new Error("Ce fichier n'est pas une sélection exportée par l'annuaire");
  }
  if (!Array.isArray(sel.diapos) || !sel.diapos.length) {
    throw new Error("La sélection ne contient aucune diapositive");
  }
  return sel;
}

/**
 * Associe à chaque diapositive sa capture, si elle existe.
 * @returns {{diapos:Array, avecImage:number, sansImage:Array<string>}}
 */
function assembler(selection, dossierCaptures, vivant) {
  const sansImage = [];
  let avecImage = 0;

  const diapos = selection.diapos.map(d => {
    // Visuel vivant : le complément Power BI affiche le visuel connecté,
    // il n'y a donc aucune capture à chercher.
    if (vivant && d.lien) {
      return { titre: d.titre, lien: d.lien, commentaire: d.commentaire, image: null, vivant: true };
    }
    let image = null;
    const chemin = dossierCaptures && d.fichier ? path.join(dossierCaptures, d.fichier) : null;
    if (chemin && fs.existsSync(chemin)) {
      image = new Uint8Array(fs.readFileSync(chemin));
      avecImage++;
    } else {
      sansImage.push(d.titre);
    }
    return { titre: d.titre, lien: d.lien, commentaire: d.commentaire, image };
  });

  return { diapos, avecImage, sansImage };
}

/** @returns {Promise<Uint8Array>} contenu du .pptx */
async function construire(selection, dossierCaptures, cheminModele, vivant) {
  const modele = new Uint8Array(fs.readFileSync(cheminModele || path.join(RACINE, "modele-deck.pptx")));
  const { diapos, avecImage, sansImage } = assembler(selection, dossierCaptures, vivant);
  const couverture = selection.couverture || {};
  const octets = await Pptx.construireDeck(modele, {
    titre: couverture.titre, sousTitre: couverture.sousTitre, periode: couverture.periode, diapos
  });
  return { octets, avecImage, sansImage };
}

async function principal() {
  const o = options(process.argv.slice(2));
  const cheminSelection = o._[0];
  if (!cheminSelection) {
    console.log("Utilisation : node outils/generer-deck.js <selection.json> [--vivant] [--captures <dossier>] [--sortie <fichier.pptx>]");
    process.exit(1);
  }

  const selection = lireSelection(cheminSelection);
  const captures = o.captures || path.join(path.dirname(cheminSelection), "captures");
  const sortie = o.sortie || path.join(path.dirname(cheminSelection),
    "deck-" + String(selection.nom || "selection").toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".pptx");

  const vivant = "vivant" in o;
  const { octets, avecImage, sansImage } = await construire(selection, captures, o.modele, vivant);
  fs.writeFileSync(sortie, Buffer.from(octets));

  console.log(`✓ ${sortie}`);
  if (vivant) {
    console.log(`  ${selection.diapos.length} diapositive(s) · visuels vivants (complément Power BI)`);
  } else {
    console.log(`  ${selection.diapos.length} diapositive(s) · ${avecImage} visuel(s) intégré(s)`);
    if (sansImage.length) console.log(`  ⚠ sans capture (cadre d'attente cliquable) : ${sansImage.join(", ")}`);
  }
}

if (require.main === module) {
  principal().catch(err => { console.error("✗ " + err.message); process.exit(1); });
}

module.exports = { options, lireSelection, assembler, construire };
