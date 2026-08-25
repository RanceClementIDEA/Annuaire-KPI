#!/usr/bin/env node
/* ============================================================
   EXPORT OFFICIEL POWER BI → IMAGES → POWERPOINT
   ------------------------------------------------------------
   La voie documentée par Microsoft, et la seule qui soit vraiment
   automatique : l'API `exportToFile` rend une page ou un visuel en
   PNG, PDF ou PPTX, et accepte NATIVEMENT `pageName` et un signet.
   C'est très exactement le modèle de l'annuaire — un KPI est une
   page plus un `bookmarkGuid`.

   Aucun relevé, aucune insertion, aucune capture d'écran : on
   demande l'image à Power BI, il la rend.

   LA CONDITION, unique et incontournable : le rapport doit vivre
   dans un espace de travail adossé à une CAPACITÉ (Premium,
   Embedded ou Fabric). Une licence Pro seule ne suffit pas, et
   Premium par utilisateur (PPU) est explicitement exclu pour les
   rapports interactifs. Un essai Fabric — 60 jours, gratuit —
   permet de tout éprouver avant de décider.

   Utilisation :
     PBI_TOKEN=eyJ0… node outils/exporter-powerbi.js selection.json
     … --format PNG --captures ./captures --deck

   Le jeton s'obtient avec `node outils/jeton-powerbi.js`.
   ============================================================ */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { lireSelection, options } = require("./generer-deck.js");

const RACINE = path.join(__dirname, "..");
const API = "https://api.powerbi.com/v1.0/myorg";

/* Les formats que l'API rend pour un rapport interactif. PNG est le
   nôtre : une image par KPI, qu'on assemble ensuite au modèle IDEA. */
const FORMATS = ["PNG", "PDF", "PPTX"];

/** Ce qu'on lit dans un lien de l'annuaire. */
function analyser(lien) {
  const txt = String(lien || "");
  const rapport = (txt.match(/reports\/([0-9a-zA-Z-]+)/) || [])[1] || "";
  const page = (txt.match(/reports\/[0-9a-zA-Z-]+\/([0-9a-zA-Z-]+)/) || [])[1] || "";
  const visuel = (txt.match(/[?&]visual=([0-9a-zA-Z-]+)/) || [])[1] || "";
  const signet = (txt.match(/[?&]bookmarkGuid=([0-9a-zA-Z-]+)/) || [])[1] || "";
  const groupe = (txt.match(/groups\/([0-9a-zA-Z-]+)\/reports/) || [])[1] || "";
  return { rapport, page, visuel, signet, groupe };
}

/**
 * Le corps de la demande d'export, pour UN KPI.
 *
 * `bookmark.name` prend le `bookmarkGuid` du lien : Microsoft le
 * documente ainsi, en indiquant de le lire dans l'URL après
 * `bookmarkGuid=`. Rien à traduire, rien à deviner.
 *
 * `visualName` restreint au seul visuel. Omis, c'est la page entière
 * qui est rendue — sélecteurs de dates et filtres compris.
 */
function construireDemande(lien, o) {
  const info = analyser(lien);
  if (!info.rapport) throw new Error("lien sans identifiant de rapport : " + lien);

  const page = { pageName: info.page };
  if (info.signet) page.bookmark = { name: info.signet };
  if (!o || !o.pageEntiere) {
    if (info.visuel) page.visualName = info.visuel;
  }

  return {
    format: (o && o.format) || "PNG",
    powerBIReportConfiguration: {
      pages: [page],
      settings: { locale: (o && o.langue) || "fr-FR" }
    }
  };
}

/** L'adresse de l'API pour ce rapport, espace personnel compris. */
function urlExport(info) {
  return info.groupe && info.groupe !== "me"
    ? API + "/groups/" + info.groupe + "/reports/" + info.rapport + "/ExportTo"
    : API + "/reports/" + info.rapport + "/ExportTo";
}

/** Idem, pour suivre puis récupérer un export en cours. */
function urlSuivi(info, idExport, fichier) {
  const base = info.groupe && info.groupe !== "me"
    ? API + "/groups/" + info.groupe + "/reports/" + info.rapport
    : API + "/reports/" + info.rapport;
  return base + "/exports/" + idExport + (fichier ? "/file" : "");
}

/* Attente entre deux interrogations : courte au début, puis de plus
   en plus longue. Un export tient souvent en quelques secondes, mais
   peut demander plusieurs minutes sur une petite capacité. */
function attente(tour) {
  return Math.min(15000, 1000 * Math.pow(1.6, tour));
}

/**
 * Lance un export et attend son résultat.
 *
 * @param {Function} appeler  (url, options) => Promise<réponse>
 * @param {Function} dormir   (ms) => Promise — injecté pour les tests
 * @returns {Promise<{octets:Uint8Array, tours:number}>}
 */
async function exporterUn(appeler, dormir, lien, o) {
  const info = analyser(lien);
  const corps = construireDemande(lien, o);

  const lancement = await appeler(urlExport(info), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corps)
  });
  if (!lancement.ok) {
    throw new Error(messageErreur(lancement.status, await texteDe(lancement)));
  }
  const { id } = await lancement.json();
  if (!id) throw new Error("Power BI n'a pas rendu d'identifiant d'export");

  const maxTours = (o && o.maxTours) || 40;
  for (let tour = 0; tour < maxTours; tour++) {
    await dormir(attente(tour));
    const suivi = await appeler(urlSuivi(info, id, false), { method: "GET" });
    if (!suivi.ok) throw new Error(messageErreur(suivi.status, await texteDe(suivi)));
    const etat = await suivi.json();

    if (etat.status === "Succeeded") {
      const fichier = await appeler(urlSuivi(info, id, true), { method: "GET" });
      if (!fichier.ok) throw new Error(messageErreur(fichier.status, await texteDe(fichier)));
      return { octets: new Uint8Array(await fichier.arrayBuffer()), tours: tour + 1 };
    }
    if (etat.status === "Failed") {
      const d = etat.error || {};
      throw new Error("Power BI a refusé l'export : " + (d.message || d.code || "raison non précisée"));
    }
  }
  throw new Error("l'export n'a pas abouti après " + maxTours + " interrogations");
}

/** Un message qui dit quoi faire, pas seulement ce qui a échoué. */
function messageErreur(code, texte) {
  if (code === 401) {
    return "jeton refusé (401) — il a expiré ou n'a pas la portée Report.Read.All. "
         + "Refaites `node outils/jeton-powerbi.js`.";
  }
  if (code === 403) {
    return "accès refusé (403) — le plus souvent parce que le rapport n'est PAS dans un "
         + "espace adossé à une capacité. L'API d'export l'exige : Premium, Embedded ou "
         + "Fabric. Un essai Fabric de 60 jours suffit pour l'éprouver. "
         + "Premium par utilisateur (PPU) ne convient pas pour un rapport interactif.";
  }
  if (code === 404) return "rapport introuvable (404) — vérifiez le lien du KPI.";
  if (code === 429) return "trop de demandes (429) — la capacité est saturée, réessayez plus tard.";
  return "Power BI a répondu " + code + (texte ? " : " + String(texte).slice(0, 200) : "");
}

async function texteDe(reponse) {
  try { return await reponse.text(); } catch (err) { return ""; }
}

/** Nom de fichier stable pour la capture d'un KPI. */
function nomFichier(diapo, index, format) {
  const ext = String(format || "PNG").toLowerCase();
  return (diapo.fichier ? diapo.fichier.replace(/\.[a-z]+$/i, "") : "kpi" + (index + 1)) + "." + ext;
}

module.exports = {
  API, FORMATS, analyser, construireDemande, urlExport, urlSuivi,
  attente, exporterUn, messageErreur, nomFichier, lireSelection, options
};

/* ─── Ligne de commande ────────────────────────────────────── */

async function principal() {
  const o = options(process.argv.slice(2));
  const chemin = o._[0];
  if (!chemin) {
    console.log("Utilisation :");
    console.log("  PBI_TOKEN=… node outils/exporter-powerbi.js <selection.json> [options]\n");
    console.log("Options :");
    console.log("  --format PNG|PDF|PPTX   défaut : PNG");
    console.log("  --page                  la PAGE entière plutôt que le seul visuel");
    console.log("  --captures <dossier>    où déposer les images (défaut : ./captures)");
    console.log("  --deck                  enchaîner sur la génération du PowerPoint");
    console.log("  --sortie <fichier>      nom du PowerPoint produit\n");
    console.log("Le jeton s'obtient avec : node outils/jeton-powerbi.js");
    process.exit(1);
  }

  const jeton = process.env.PBI_TOKEN || o.jeton;
  if (!jeton) {
    console.error("✗ Aucun jeton. Faites d'abord : node outils/jeton-powerbi.js");
    process.exit(1);
  }

  const format = String(o.format || "PNG").toUpperCase();
  if (FORMATS.indexOf(format) < 0) {
    console.error("✗ Format inconnu : " + format + " (attendus : " + FORMATS.join(", ") + ")");
    process.exit(1);
  }

  const selection = lireSelection(chemin);
  const dossier = path.resolve(o.captures || path.join(process.cwd(), "captures"));
  fs.mkdirSync(dossier, { recursive: true });

  const appeler = (url, init) => fetch(url, Object.assign({}, init, {
    headers: Object.assign({ Authorization: "Bearer " + jeton }, (init && init.headers) || {})
  }));
  const dormir = ms => new Promise(ok => setTimeout(ok, ms));

  console.log(selection.diapos.length + " KPI à exporter, format " + format
    + (o.page ? ", page entière" : ", visuel seul") + "\n");

  let faites = 0;
  const echecs = [];
  for (let i = 0; i < selection.diapos.length; i++) {
    const d = selection.diapos[i];
    const etiquette = "[" + (i + 1) + "/" + selection.diapos.length + "] " + d.titre;
    if (!d.lien) { console.log("  – " + etiquette + " — aucun lien"); echecs.push(d.titre); continue; }
    try {
      const { octets, tours } = await exporterUn(appeler, dormir, d.lien,
        { format, pageEntiere: o.page === true });
      const nom = nomFichier(d, i, format);
      fs.writeFileSync(path.join(dossier, nom), Buffer.from(octets));
      faites++;
      console.log("  ✓ " + etiquette + " → " + nom + " (" + tours + " interrogation(s))");
    } catch (err) {
      echecs.push(d.titre);
      console.log("  ✗ " + etiquette + " — " + err.message);
    }
  }

  console.log("\n" + faites + " export(s) dans " + dossier);
  if (echecs.length) console.log("Non exportés : " + echecs.join(", "));

  if (o.deck && faites) {
    const { construire } = require("./generer-deck.js");
    const sortie = o.sortie || path.join(process.cwd(), "deck-kpi.pptx");
    const octets = await construire(selection, dossier, path.join(RACINE, "modele-deck.pptx"), false);
    fs.writeFileSync(sortie, Buffer.from(octets));
    console.log("\n✓ " + sortie);
  }
}

if (require.main === module) {
  principal().catch(err => { console.error("✗ " + err.message); process.exit(1); });
}
