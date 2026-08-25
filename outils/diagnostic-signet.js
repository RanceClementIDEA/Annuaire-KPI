#!/usr/bin/env node
/* ============================================================
   DIAGNOSTIC : LE SIGNET DU LIEN OU L'ÉTAT MÉMORISÉ ?
   ------------------------------------------------------------
   Constat : plusieurs KPI de l'annuaire pointent vers LE MÊME
   visuel Power BI. Ce qui les distingue n'est pas `visual=`, mais
   `bookmarkGuid=` — le signet, c'est-à-dire les filtres et segments.

   Or l'empreinte impose un état sérialisé, capturé une fois. Cet
   état écrase le signet du lien : tous les KPI d'un même visuel
   affichent alors la même vue. C'est ce qu'on observe.

   Reste à savoir s'il existe une façon de garder l'état — sans lui
   le complément ne résout rien — tout en laissant le signet du lien
   s'appliquer. Deux propriétés portent l'état, et rien ne dit
   qu'elles jouent le même rôle :

     • `bookmark`             — l'état, tel que mémorisé
     • `initialStateBookmark` — l'état à appliquer au chargement

   Une diapositive par hypothèse, toutes sur LE MÊME lien.

   Utilisation :
     node outils/diagnostic-signet.js --lien "<url>" --reference <support.pptx>
   ============================================================ */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const Pptx = require("../js/pptx.js");
const Empreintes = require("../js/empreintes.js");
const { relever } = require("./relever-empreintes.js");

const RACINE = path.join(__dirname, "..");

/** Adresse privée du paramètre demandé. */
function sansParametre(url, nom) {
  return String(url)
    .replace(new RegExp("([?&])" + nom + "=[^&]*&?", "g"), "$1")
    .replace(/[?&]$/, "");
}

function variantes(lien, empreinte) {
  const props = (empreinte && Empreintes.proprietesPour(empreinte)) || {};
  const sans = noms => {
    const o = Object.assign({}, props);
    noms.forEach(n => { o[n] = null; });
    return o;
  };

  return [
    { code: "1", titre: "1 — empreinte complète (ce que fait l'annuaire aujourd'hui)",
      explication: "les deux états posés : connu pour afficher la MAUVAISE vue",
      proprietesComplement: props },

    { code: "2", titre: "2 — sans « initialStateBookmark »",
      explication: "l'état reste mémorisé, mais rien ne dit qu'il faut l'appliquer au chargement. "
        + "Si la bonne vue apparaît, c'est la solution.",
      proprietesComplement: sans(["initialStateBookmark"]) },

    { code: "3", titre: "3 — sans « bookmark »",
      explication: "l'inverse : seul l'état de chargement est posé",
      proprietesComplement: sans(["bookmark"]) },

    { code: "4", titre: "4 — carte d'identité seule, signet du lien conservé",
      explication: "aucun état : montre ce que le signet du lien sait faire à lui seul",
      proprietesComplement: sans(["bookmark", "initialStateBookmark"]) },

    { code: "5", titre: "5 — repère : le même lien SANS son signet",
      explication: "la vue par défaut du visuel. Comparez-la aux précédentes : "
        + "si 1 lui ressemble, le signet du lien n'est jamais appliqué.",
      lien: sansParametre(lien, "bookmarkGuid"),
      proprietesComplement: props }
  ];
}

async function construire(lien, empreinte) {
  const modele = new Uint8Array(fs.readFileSync(path.join(RACINE, "modele-deck.pptx")));
  return Pptx.construireDeck(modele, {
    titre: "Le signet du lien, ou l'état mémorisé ?",
    sousTitre: "Un seul KPI, cinq façons de poser son état",
    periode: "Notez laquelle montre la bonne vue",
    diapos: variantes(lien, empreinte).map(v => ({
      titre: v.titre, commentaire: v.explication, lien: v.lien || lien, vivant: true,
      proprietesComplement: v.proprietesComplement
    }))
  });
}

async function principal() {
  const argv = process.argv.slice(2);
  const lire = n => { const i = argv.indexOf("--" + n); return i >= 0 ? argv[i + 1] : null; };
  const lien = lire("lien"), reference = lire("reference");
  if (!lien || !reference) {
    console.log('Utilisation : node outils/diagnostic-signet.js --lien "<url>" --reference <support.pptx> [--sortie f.pptx]');
    process.exit(1);
  }
  const lot = await relever(new Uint8Array(fs.readFileSync(reference)), { horodatage: 1 });
  const empreinte = Empreintes.trouver(lot, lien) || Empreintes.trouverParPage(lot, lien);
  if (!empreinte) { console.error("✗ aucune empreinte utilisable dans " + reference); process.exit(2); }

  const sortie = lire("sortie") || path.join(process.cwd(), "DIAGNOSTIC-signet.pptx");
  fs.writeFileSync(sortie, Buffer.from(await construire(lien, empreinte)));
  console.log("Empreinte : " + (empreinte.libelle || empreinte.id));
  console.log("\n✓ " + sortie);
  variantes(lien, empreinte).forEach(v => console.log("  " + v.code + " · " + v.explication));
}

if (require.main === module) {
  principal().catch(err => { console.error("✗ " + err.message); process.exit(1); });
}

module.exports = { sansParametre, variantes, construire };
