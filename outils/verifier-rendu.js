#!/usr/bin/env node
/* ============================================================
   CE QUE LE COMPLÉMENT A RÉELLEMENT AFFICHÉ
   ------------------------------------------------------------
   À l'ouverture d'un support, le complément Power BI réécrit dans
   le fichier ce qu'il a résolu : `artifactName` (le nom du visuel
   qu'il montre), l'horodatage, l'identifiant de session. Il suffit
   donc de RENVOYER le fichier après l'avoir ouvert pour savoir,
   sans rien deviner, ce que chaque diapositive a montré.

   Cet outil compare, pour chaque diapositive :
     • le visuel DEMANDÉ — lu dans l'adresse `reportUrl` ;
     • le visuel RÉSOLU  — le nom que le complément a écrit ;
     • l'état appliqué   — sa page, et le visuel dont il provient.

   Il signale les trois façons dont un support peut mentir :
     ✗ le complément n'a pas ouvert le fichier (rien de réécrit) ;
     ✗ l'état appliqué vient d'une autre page ;
     ⚠ l'état a été emprunté à un voisin — les filtres affichés
       sont ceux du voisin, donc les CHIFFRES peuvent différer.

   Utilisation :
     node outils/verifier-rendu.js support-ouvert.pptx
     node outils/verifier-rendu.js support.pptx --attendu empreintes.json
   ============================================================ */
"use strict";

const fs = require("node:fs");
const zlib = require("node:zlib");
const Zip = require("../js/zip.js");

/** Propriétés d'un complément, valeurs laissées encodées. */
function proprietesDe(xml) {
  const out = {};
  const re = /<we:property name="([^"]+)" value="([\s\S]*?)"\/>/g;
  let m;
  while ((m = re.exec(xml))) out[m[1]] = m[2];
  return out;
}

/** Valeur d'attribut XML ramenée à son texte. */
function texte(v) {
  return String(v || "")
    .replace(/&quot;/g, "").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&apos;/g, "'");
}

/** L'état sérialisé, décompressé — ou null s'il n'y en a pas. */
function etatDe(valeur) {
  if (!valeur) return null;
  try { return JSON.parse(zlib.gunzipSync(Buffer.from(texte(valeur), "base64")).toString("utf8")); }
  catch (err) { return null; }
}

/**
 * Ce qu'un complément demandait et ce qu'il a obtenu.
 * @returns {{demande:Object, resolu:Object, etat:Object, alertes:string[]}}
 */
function examiner(props) {
  const url = texte(props.reportUrl);
  const rapport = (url.match(/reports\/([0-9a-zA-Z-]+)/) || [])[1] || "";
  const page = (url.match(/reports\/[0-9a-zA-Z-]+\/([0-9a-zA-Z-]+)/) || [])[1] || "";
  const visuel = (url.match(/[?&]visual=([0-9a-zA-Z-]+)/) || [])[1] || "";

  const etat = etatDe(props.bookmark);
  const section = etat && etat.explorationState ? etat.explorationState.activeSection : "";
  const conteneurs = etat && section && etat.explorationState.sections[section]
    ? Object.keys(etat.explorationState.sections[section].visualContainers || {}) : [];

  const alertes = [];
  const ouvert = Boolean(props.creatorSessionId || props.reportEmbeddedTime);
  if (!ouvert) {
    alertes.push("le complément n'a pas ouvert cette diapositive — renvoyez le fichier APRÈS l'avoir affiché");
  }
  if (etat && section && page && section !== page) {
    alertes.push("l'état appliqué est celui de la page " + section + ", pas " + page);
  }
  /* Un état emprunté à un voisin restitue LES FILTRES DU VOISIN. Le bon
     graphique peut alors s'afficher avec les mauvais chiffres — c'est la
     panne la plus sournoise, parce que rien n'a l'air cassé. */
  if (etat && visuel && conteneurs.length && conteneurs.indexOf(visuel) < 0) {
    alertes.push("l'état ne décrit pas ce visuel : filtres et segments sont ceux d'un voisin");
  }
  return {
    demande: { rapport, page, visuel },
    resolu: { nom: texte(props.artifactName), page: texte(props.pageName),
              pageAffichee: texte(props.pageDisplayName), ouvert },
    etat: { section, conteneurs: conteneurs.length, porteLeVisuel: conteneurs.indexOf(visuel) >= 0 },
    alertes
  };
}

/** Chaque complément du support, dans l'ordre des diapositives. */
async function analyser(octets) {
  const pieces = await Zip.lireZip(octets);
  const ordre = [];
  [...pieces.keys()]
    .filter(n => /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/.test(n))
    .sort((a, b) => Number(a.match(/slide(\d+)/)[1]) - Number(b.match(/slide(\d+)/)[1]))
    .forEach(rels => {
      const numero = Number(rels.match(/slide(\d+)/)[1]);
      const cible = Zip.versTexte(pieces.get(rels))
        .match(/Target="\.\.\/(webextensions\/webextension\d+\.xml)"/);
      if (!cible) return;
      const xml = pieces.get("ppt/" + cible[1]);
      if (!xml) return;
      const titre = pieces.has(`ppt/slides/slide${numero}.xml`)
        ? (Zip.versTexte(pieces.get(`ppt/slides/slide${numero}.xml`)).match(/<a:t>([^<]*)<\/a:t>/) || [])[1] || ""
        : "";
      ordre.push(Object.assign({ numero, titre }, examiner(proprietesDe(Zip.versTexte(xml)))));
    });
  return ordre;
}

async function principal() {
  const argv = process.argv.slice(2);
  const fichier = argv.find(a => !a.startsWith("--"));
  if (!fichier) {
    console.log("Utilisation : node outils/verifier-rendu.js <support-ouvert.pptx>");
    process.exit(1);
  }

  const lot = await analyser(new Uint8Array(fs.readFileSync(fichier)));
  if (!lot.length) {
    console.log("Aucun visuel vivant dans ce support.");
    process.exit(2);
  }

  console.log(fichier + " — " + lot.length + " diapositive(s) à visuel vivant\n");
  let soucis = 0;
  lot.forEach(d => {
    const etat = d.etat.section
      ? d.etat.section + " (" + d.etat.conteneurs + " objets, "
        + (d.etat.porteLeVisuel ? "décrit ce visuel" : "NE décrit PAS ce visuel") + ")"
      : "aucun";
    console.log("  " + d.numero + ". " + (d.titre || "(sans titre)"));
    console.log("     demandé : visuel " + d.demande.visuel + " · page " + d.demande.page);
    console.log("     résolu  : " + (d.resolu.nom || "—")
      + (d.resolu.pageAffichee ? " · page « " + d.resolu.pageAffichee + " »" : "")
      + (d.resolu.ouvert ? "" : "   [jamais ouvert]"));
    console.log("     état    : " + etat);
    d.alertes.forEach(a => { soucis++; console.log("     ⚠ " + a); });
    console.log("");
  });

  console.log(soucis ? soucis + " point(s) à corriger" : "Rien à signaler.");
}

if (require.main === module) {
  principal().catch(err => { console.error("✗ " + err.message); process.exit(1); });
}

module.exports = { proprietesDe, texte, etatDe, examiner, analyser };
