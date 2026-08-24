#!/usr/bin/env node
/* ============================================================
   DIAGNOSTIC : POURQUOI LE VISUEL AFFICHÉ N'EST PAS CELUI ATTENDU
   ------------------------------------------------------------
   Fabrique UN support dont chaque diapositive teste une hypothèse
   différente sur la façon dont le complément Power BI interprète
   l'adresse qu'on lui donne. Il suffit de l'ouvrir une fois dans
   PowerPoint et de noter ce que chaque diapositive affiche.

   Les variantes, dans l'ordre :

     A  état actuel du générateur — visuel + signet appliqué
     B  sans `visual=` : la page entière, mais le même signet
     C  A, plus l'état sérialisé copié d'un fichier de référence
     D  copie EXACTE du complément du fichier de référence
        (témoin : doit afficher ce que votre export affichait)
     E  visuel sans aucun signet (témoin : l'état par défaut)

   Lecture du résultat :
     • A identique à E  → le signet n'est pas appliqué : c'est le
       `bookmarkGuid` que le complément ignore.
     • A identique à B  → le paramètre `visual=` est ignoré : le
       complément affiche la page, pas le visuel.
     • C correct        → il faut embarquer l'état sérialisé.
     • D incorrect      → le fichier de référence ne correspond pas
       au KPI choisi ; refaites-le sur le bon visuel.

   Utilisation :
     node outils/diagnostic-complement.js --lien "<url du KPI>" \\
          --reference MicrosoftPowerBIStorytelling.pptx
   ============================================================ */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const Zip = require("../js/zip.js");
const Pptx = require("../js/pptx.js");

const RACINE = path.join(__dirname, "..");

/** Propriétés d'un complément existant, valeurs laissées encodées. */
function proprietesDe(xml) {
  const out = {};
  const re = /<we:property name="([^"]+)" value="([^"]*)"\/>/g;
  let m;
  while ((m = re.exec(xml))) out[m[1]] = m[2];
  return out;
}

/** Extrait le premier complément d'un .pptx fabriqué par Power BI. */
async function complementDeReference(chemin) {
  const pieces = await Zip.lireZip(new Uint8Array(fs.readFileSync(chemin)));
  const nom = [...pieces.keys()].find(n => /^ppt\/webextensions\/webextension\d+\.xml$/.test(n));
  if (!nom) throw new Error("Ce fichier ne contient aucun complément Power BI");
  return proprietesDe(Zip.versTexte(pieces.get(nom)));
}

/** Adresse sans le paramètre demandé. */
function sansParametre(url, nom) {
  return String(url)
    .replace(new RegExp("([?&])" + nom + "=[^&]*&?", "g"), "$1")
    .replace(/[?&]$/, "");
}

/**
 * Deuxième série — pourquoi le complément affiche la PAGE et non le visuel.
 *
 * Constat de la première série : la barre d'onglets du rapport apparaît, et
 * l'état par défaut s'affiche. Le complément ignore donc `visual=` ET
 * `bookmarkGuid`. Ces variantes cherchent la forme d'adresse qu'il accepte.
 */
function variantes2(lien) {
  const relatif = Pptx.cheminRapport(lien);
  const info = Pptx.analyserLien(lien);

  return [
    { code: "F", titre: "F — adresse telle quelle, rien d'ajouté",
      explication: "le lien de partage sans bookmarkUsage ni fromEntryPoint : peut-être que l'un des deux fait basculer en mode page",
      lien, urlComplement: relatif },

    { code: "G", titre: "G — adresse absolue, avec app.powerbi.com",
      explication: "le complément attend peut-être l'adresse complète, pas un chemin relatif",
      lien, urlComplement: String(lien) },

    { code: "H", titre: "H — adresse telle quelle + signet appliqué",
      explication: "sans fromEntryPoint, qui pourrait déclencher le comportement d'export de page",
      lien, urlComplement: relatif + (/[?&]bookmarkGuid=/.test(relatif) ? "&bookmarkUsage=1" : "") },

    { code: "I", titre: "I — le visuel désigné par une propriété",
      explication: "visualName à part, plutôt que dans l'adresse",
      lien, proprietesComplement: info.visualName
        ? { visualName: "&quot;" + info.visualName + "&quot;" } : {} },

    { code: "J", titre: "J — sans la propriété pageName",
      explication: "pageName désigne une page : sa présence force peut-être l'affichage de la page entière",
      lien, proprietesComplement: { pageName: null } }
  ];
}

/**
 * Troisième série — le complément retombe sur la PREMIÈRE page du rapport
 * (« Liste des filtres ») au lieu de celle du lien. Ces variantes cherchent
 * la forme d'adresse qui lui fait ouvrir la bonne page.
 */
function variantes3(lien) {
  const info = Pptx.analyserLien(lien);
  const base = "/groups/me/reports/" + info.reportId + "/" + info.pageName;
  const ctid = (String(lien).match(/[?&]ctid=([^&]*)/) || [])[1] || "";
  const signet = info.bookmark;

  // Exactement la forme que Power BI écrit dans ses propres exports :
  // page + signet + locataire + point d'entrée, et RIEN d'autre.
  const commeExport = base + "?"
    + (signet ? "bookmarkGuid=" + signet + "&bookmarkUsage=1&" : "")
    + (ctid ? "ctid=" + ctid + "&" : "") + "fromEntryPoint=export";

  return [
    { code: "K", titre: "K — la forme exacte de l'export natif",
      explication: "page + signet + locataire, sans pbi_source, sans visual, sans height/width",
      lien, urlComplement: commeExport },

    { code: "L", titre: "L — la page seule, sans signet",
      explication: "si K échoue aussi, on saura si le signet gêne la résolution de la page",
      lien, urlComplement: base + (ctid ? "?ctid=" + ctid : "") },

    { code: "M", titre: "M — la page, plus son nom affiché",
      explication: "pageDisplayName renseigné : le complément s'appuie peut-être dessus",
      lien, urlComplement: commeExport,
      proprietesComplement: { pageDisplayName: "&quot;" + info.pageName + "&quot;" } },

    { code: "N", titre: "N — l'adresse la plus dépouillée possible",
      explication: "rapport et page, rien de plus",
      lien, urlComplement: base },

    { code: "O", titre: "O — le rapport sans page",
      explication: "témoin : ce que donne le rapport livré à lui-même. Si K à N ressemblent à O, la page n'est jamais lue",
      lien, urlComplement: "/groups/me/reports/" + info.reportId,
      proprietesComplement: { pageName: null } }
  ];
}

/**
 * Les cinq variantes, à partir d'un lien de KPI et, si on en a un,
 * des propriétés d'un complément fabriqué par Power BI.
 */
function variantes(lien, reference) {
  const ref = reference || {};
  const etat = {};
  ["bookmark", "initialStateBookmark", "datasetId", "pageDisplayName"].forEach(n => {
    if (ref[n]) etat[n] = ref[n];
  });

  return [
    { code: "A", titre: "A — état actuel du générateur",
      explication: "visuel désigné, signet transmis et marqué comme à appliquer",
      lien },

    { code: "B", titre: "B — sans le paramètre visual",
      explication: "la page entière, avec le même signet : montre si « visual » est pris en compte",
      lien, urlComplement: Pptx.urlPourComplement(sansParametre(lien, "visual")) },

    { code: "C", titre: "C — avec l'état sérialisé du fichier de référence",
      explication: Object.keys(etat).length
        ? "mêmes paramètres qu'en A, plus l'état complet copié du fichier de référence"
        : "AUCUN fichier de référence fourni : identique à A",
      lien, proprietesComplement: etat },

    // D : on efface d'abord TOUTES les propriétés que le générateur pose
    // lui-même, sinon elles cohabiteraient en double avec celles de la
    // référence — et le complément n'en lirait qu'une, au hasard.
    { code: "D", titre: "D — témoin : le complément de référence, intact",
      explication: Object.keys(ref).length
        ? "exactement ce que Power BI avait produit ; doit afficher ce que montrait votre export"
        : "AUCUN fichier de référence fourni : cette diapositive est vide de sens",
      lien,
      proprietesComplement: Object.assign(
        Pptx.PROPRIETES_PAR_DEFAUT.reduce((o, n) => { o[n] = null; return o; }, {}), ref) },

    { code: "E", titre: "E — témoin : le visuel sans aucun signet",
      explication: "l'état par défaut du visuel. Si A ressemble à E, le signet n'est pas appliqué",
      lien, urlComplement: sansParametre(sansParametre(lien, "bookmarkGuid"), "bookmarkUsage") }
  ];
}

async function construire(lien, reference, serie) {
  const modele = new Uint8Array(fs.readFileSync(path.join(RACINE, "modele-deck.pptx")));
  const liste = serie === 3 ? variantes3(lien)
              : serie === 2 ? variantes2(lien)
              : variantes(lien, reference);
  const diapos = liste.map(v => ({
    titre: v.titre,
    commentaire: v.explication,
    lien: v.lien,
    vivant: true,
    urlComplement: v.urlComplement,
    proprietesComplement: v.proprietesComplement
  }));
  return Pptx.construireDeck(modele, {
    titre: "Diagnostic du complément Power BI",
    sousTitre: serie === 3 ? "Série 3 — quelle adresse ouvre la bonne PAGE ?"
             : serie === 2 ? "Série 2 — quelle forme d'adresse désigne le visuel ?"
             : "Cinq hypothèses, une diapositive chacune",
    periode: "Notez ce que chaque diapositive affiche",
    diapos
  });
}

async function principal() {
  const argv = process.argv.slice(2);
  const lire = n => { const i = argv.indexOf("--" + n); return i >= 0 ? argv[i + 1] : null; };
  const lien = lire("lien");
  if (!lien) {
    console.log('Utilisation : node outils/diagnostic-complement.js --lien "<url du KPI>" [--reference <export.pptx>] [--sortie <fichier.pptx>]');
    process.exit(1);
  }

  const serie = [2, 3].indexOf(Number(lire("serie"))) >= 0 ? Number(lire("serie")) : 1;
  const cheminRef = lire("reference");
  const reference = cheminRef ? await complementDeReference(cheminRef) : null;
  if (serie === 1) {
    if (reference) console.log("Référence lue : " + Object.keys(reference).length + " propriété(s)");
    else console.log("Aucune référence fournie — les variantes C et D seront sans objet.");
  }

  const sortie = lire("sortie") || path.join(process.cwd(), "DIAGNOSTIC-complement.pptx");
  fs.writeFileSync(sortie, Buffer.from(await construire(lien, reference, serie)));

  console.log("\n✓ " + sortie);
  (serie === 3 ? variantes3(lien) : serie === 2 ? variantes2(lien) : variantes(lien, reference))
    .forEach(v => console.log("  " + v.code + " · " + v.explication));
  console.log("\nOuvrez le fichier, laissez les visuels se charger, et dites ce que montre chaque diapositive.");
}

if (require.main === module) {
  principal().catch(err => { console.error("✗ " + err.message); process.exit(1); });
}

module.exports = { proprietesDe, complementDeReference, sansParametre, variantes, variantes2, variantes3, construire };
