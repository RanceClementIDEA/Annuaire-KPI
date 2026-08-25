#!/usr/bin/env node
/* ============================================================
   DIAGNOSTIC : L'ÉTAT SÉRIALISÉ DOIT-IL ÊTRE LE VRAI ?
   ------------------------------------------------------------
   Acquis : sans état sérialisé, le complément Power BI affiche
   « l'objet visuel n'existe plus ». Avec l'état relevé sur une
   insertion manuelle, il affiche le graphique.

   Reste LA question qui décide de tout : le complément vérifie-t-il
   le CONTENU de cet état, ou lui suffit-il d'en trouver un ?

     • s'il lui suffit d'en trouver un → on peut le FABRIQUER, et le
       relevé manuel disparaît complètement : tout ce qu'il faut
       (rapport, page, visuel) se lit déjà dans le lien, et le reste
       (nom du rapport, jeu de données, nom de la page) s'obtient par
       l'API REST de Power BI, sans licence particulière ;
     • s'il le vérifie → le relevé manuel reste indispensable.

   Une diapositive par hypothèse, à ouvrir une fois dans PowerPoint.

   Utilisation :
     node outils/diagnostic-etat.js --lien "<url du visuel>" \\
          --reference <support-fait-a-la-main.pptx>
   ============================================================ */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const Pptx = require("../js/pptx.js");
const Empreintes = require("../js/empreintes.js");
const { relever } = require("./relever-empreintes.js");

const RACINE = path.join(__dirname, "..");

/* ─── L'état sérialisé, dans les deux sens ─────────────────── */

/** Décompresse un état tel qu'il est stocké dans le fichier. */
function lireEtat(valeur) {
  const b64 = String(valeur || "").replace(/&quot;/g, "").replace(/^"|"$/g, "");
  return JSON.parse(zlib.gunzipSync(Buffer.from(b64, "base64")).toString("utf8"));
}

/**
 * Recompresse un état, prêt à être écrit comme valeur d'attribut XML.
 * Le niveau de compression n'a pas d'importance : c'est du gzip standard,
 * et c'est ainsi que Power BI l'écrit lui-même.
 */
function ecrireEtat(objet) {
  const b64 = zlib.gzipSync(Buffer.from(JSON.stringify(objet), "utf8")).toString("base64");
  return "&quot;" + b64 + "&quot;";
}

/**
 * Un état FABRIQUÉ de toutes pièces, sans rien connaître du rapport.
 * Tout ce qu'il contient se déduit du lien : la page active, et c'est
 * tout. C'est le strict minimum qui reste un état valide.
 */
function etatMinimal(page) {
  return {
    displayName: "Signet",
    name: "BOOKMARK_NAME",
    options: { targetVisualNames: [], preserveNewVisualVisibility: true,
               allPages: false, personalizeVisuals: true },
    explorationState: {
      version: "1.40",
      activeSection: page,
      sections: { [page]: { visualContainers: {} } },
      objects: {}
    }
  };
}

/** L'état minimal, plus le seul conteneur du visuel visé. */
function etatUnVisuel(page, visuel, reel) {
  const base = etatMinimal(page);
  const section = reel && reel.explorationState
    && reel.explorationState.sections
    && reel.explorationState.sections[page];
  const conteneur = section && section.visualContainers && section.visualContainers[visuel];
  if (conteneur) base.explorationState.sections[page].visualContainers[visuel] = conteneur;
  return base;
}

/* ─── Les variantes ────────────────────────────────────────── */

function variantes(lien, empreinte) {
  const props = (empreinte && Empreintes.proprietesPour(empreinte)) || {};
  const info = Pptx.analyserLien(lien);
  const page = info.pageName || "";
  const visuel = info.visualName || "";
  const reel = props.bookmark ? lireEtat(props.bookmark) : null;

  /* La carte d'identité sans l'état : ce que l'API REST sait donner. */
  const identite = {};
  ["artifactName", "reportName", "pageName", "pageDisplayName", "datasetId", "embedUrl"]
    .forEach(n => { if (props[n]) identite[n] = props[n]; });

  const avecEtat = etat => Object.assign({}, identite, {
    bookmark: ecrireEtat(etat), initialStateBookmark: ecrireEtat(etat)
  });

  return [
    { code: "U", titre: "U — état FABRIQUÉ, vide",
      explication: "carte d'identité + un état construit de toutes pièces, sans aucun visuel dedans. "
        + "S'il s'affiche, le relevé manuel devient inutile.",
      proprietesComplement: avecEtat(etatMinimal(page)) },

    { code: "V", titre: "V — état fabriqué, avec le seul visuel visé",
      explication: "même chose, plus la description du visuel recopiée depuis l'état réel",
      proprietesComplement: avecEtat(etatUnVisuel(page, visuel, reel)) },

    { code: "W", titre: "W — l'état réel, mais sans le nom du visuel",
      explication: "l'état relevé, privé d'artifactName : montre si ce nom compte vraiment",
      proprietesComplement: Object.assign({}, props, { artifactName: null }) },

    { code: "X", titre: "X — témoin : l'empreinte complète",
      explication: "ce que produit l'annuaire aujourd'hui ; doit afficher le graphique",
      proprietesComplement: props },

    { code: "Y", titre: "Y — témoin : aucune empreinte",
      explication: "connu pour échouer — sert de repère" }
  ];
}

/**
 * Deuxième question, une fois l'état reconnu indispensable : cet état
 * est un état de PAGE, pas de visuel. Peut-on donc l'emprunter d'un
 * visuel à l'autre, du moment qu'ils vivent sur la même page ?
 *
 * L'enjeu est concret : sur cet annuaire, 22 liens tiennent sur 2 pages
 * d'un même rapport. Si l'emprunt marche, il faut 2 insertions à la
 * main, pas 22.
 *
 * @param {string[]} liens  d'autres visuels, à tester avec l'état emprunté
 */
function variantesPage(lien, empreinte, liens) {
  const props = (empreinte && Empreintes.proprietesPour(empreinte)) || {};
  const pageRef = Pptx.analyserLien(lien).pageName;

  /* L'état et le contexte de page, SANS le nom du visuel : la variante W
     a montré qu'artifactName ne joue aucun rôle dans l'affichage. */
  const empruntable = {};
  ["reportName", "pageName", "pageDisplayName", "datasetId",
   "bookmark", "initialStateBookmark", "embedUrl", "backgroundColor"]
    .forEach(n => { if (props[n]) empruntable[n] = props[n]; });

  const autres = (liens || []).map((l, i) => {
    const info = Pptx.analyserLien(l);
    const memePage = info.pageName === pageRef;
    return {
      code: String.fromCharCode(65 + i),
      titre: (memePage ? "Même page" : "AUTRE page") + " — visuel " + (info.visualName || "?").slice(0, 8),
      explication: memePage
        ? "un AUTRE visuel de la même page, avec l'état emprunté au visuel de référence"
        : "un visuel d'une autre page, avec le même état : doit échouer, et borne le périmètre",
      lien: l,
      proprietesComplement: empruntable
    };
  });

  return autres.concat([
    { code: "-", titre: "Témoin — le même visuel, sans aucun état",
      explication: "connu pour échouer",
      lien: (liens && liens[0]) || lien },
    { code: "+", titre: "Témoin — le visuel de référence, avec son propre état",
      explication: "doit afficher le graphique",
      lien, proprietesComplement: props }
  ]);
}

async function construirePage(lien, empreinte, liens) {
  const modele = new Uint8Array(fs.readFileSync(path.join(RACINE, "modele-deck.pptx")));
  return Pptx.construireDeck(modele, {
    titre: "L'état se partage-t-il entre visuels d'une même page ?",
    sousTitre: "Si oui : une insertion par PAGE, et non par KPI",
    periode: "Notez ce que montre chaque diapositive",
    diapos: variantesPage(lien, empreinte, liens).map(v => ({
      titre: v.titre, commentaire: v.explication, lien: v.lien, vivant: true,
      proprietesComplement: v.proprietesComplement
    }))
  });
}

async function construire(lien, empreinte) {
  const modele = new Uint8Array(fs.readFileSync(path.join(RACINE, "modele-deck.pptx")));
  return Pptx.construireDeck(modele, {
    titre: "L'état sérialisé doit-il être le vrai ?",
    sousTitre: "Si U ou V s'affiche, les empreintes deviennent automatiques",
    periode: "Notez ce que montre chaque diapositive",
    diapos: variantes(lien, empreinte).map(v => ({
      titre: v.titre, commentaire: v.explication, lien, vivant: true,
      proprietesComplement: v.proprietesComplement
    }))
  });
}

async function principal() {
  const argv = process.argv.slice(2);
  const lire = n => { const i = argv.indexOf("--" + n); return i >= 0 ? argv[i + 1] : null; };
  const lien = lire("lien");
  const reference = lire("reference");
  if (!lien || !reference) {
    console.log('Utilisation : node outils/diagnostic-etat.js --lien "<url>" --reference <support.pptx> [--sortie f.pptx]');
    process.exit(1);
  }

  const lot = await relever(new Uint8Array(fs.readFileSync(reference)), { horodatage: 1 });
  const empreinte = Empreintes.trouver(lot, lien) || lot[0];
  if (!empreinte) {
    console.error("✗ Aucune insertion manuelle trouvée dans " + reference);
    process.exit(2);
  }

  const sortie = lire("sortie") || path.join(process.cwd(), "DIAGNOSTIC-etat.pptx");

  /* Deux séries : « l'état peut-il être fabriqué ? » et, une fois la
     réponse connue, « peut-il au moins être partagé entre visuels ? » */
  const autres = argv.filter((a, i) => argv[i - 1] === "--autre");
  if (autres.length) {
    fs.writeFileSync(sortie, Buffer.from(await construirePage(lien, empreinte, autres)));
    console.log("Empreinte empruntée : " + (empreinte.libelle || empreinte.id));
    console.log("\n✓ " + sortie);
    variantesPage(lien, empreinte, autres).forEach(v => console.log("  " + v.code + " · " + v.titre));
    console.log("\nSi les visuels de la MÊME page s'affichent → une insertion par page suffit.");
    console.log("Sinon → l'état est propre à chaque visuel : une insertion par KPI.");
    return;
  }

  fs.writeFileSync(sortie, Buffer.from(await construire(lien, empreinte)));

  console.log("Empreinte de référence : " + (empreinte.libelle || empreinte.id));
  console.log("\n✓ " + sortie);
  variantes(lien, empreinte).forEach(v => console.log("  " + v.code + " · " + v.explication));
  console.log("\nSi U s'affiche  → l'état peut être fabriqué : plus aucun relevé manuel.");
  console.log("Si V seul       → il faut la description du visuel, disponible par l'API REST.");
  console.log("Si ni U ni V    → l'état réel est vérifié : le relevé manuel reste nécessaire.");
}

if (require.main === module) {
  principal().catch(err => { console.error("✗ " + err.message); process.exit(1); });
}

module.exports = { lireEtat, ecrireEtat, etatMinimal, etatUnVisuel,
                   variantes, variantesPage, construire, construirePage };
