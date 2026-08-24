#!/usr/bin/env node
/* ============================================================
   CAPTURE AUTOMATIQUE DES VISUELS POWER BI
   ------------------------------------------------------------
   Ouvre chaque lien de la sélection dans un navigateur qui garde
   VOTRE session Power BI, attend le rendu, et enregistre l'image du
   visuel. Le support obtenu contient donc de vraies images, pas des
   liens.

   Pourquoi un outil séparé : le navigateur de l'annuaire ne peut pas
   aller chercher ces images lui-même — Power BI exige une
   authentification et refuse les requêtes venues d'un autre site.
   Ici, c'est VOTRE navigateur, avec VOTRE session : rien à demander à
   la DSI, aucune licence particulière.

   Première utilisation :
     npm i -D playwright && npx playwright install chromium
     node outils/capturer-visuels.js selection.json --connexion
       → une fenêtre s'ouvre, vous vous connectez à Power BI une fois.
         La session est conservée dans le profil ; les fois suivantes,
         l'outil tourne tout seul.

   Ensuite, chaque semaine :
     node outils/capturer-visuels.js selection.json --deck
   ============================================================ */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const readline = require("node:readline");

let chromium;
try { ({ chromium } = require("playwright")); }
catch {
  console.error("Playwright n'est pas installé.\n  npm i -D playwright && npx playwright install chromium");
  process.exit(1);
}

const { lireSelection, options, construire } = require("./generer-deck.js");

/* Le visuel occupe le cadre principal du rapport. On essaie les
   conteneurs de Power BI du plus précis au plus large : l'interface
   évolue, et une seule sélection rendrait l'outil fragile. */
const SELECTEURS = [
  ".visualContainerHost",
  "visual-container-repeat",
  ".displayArea.disableAnimations",
  ".visualContainer",
  "#pvExplorationHost",
  ".exploreCanvas"
];

/** Attend qu'un des conteneurs connus soit visible et stable. */
async function attendreVisuel(page, attenteMs) {
  for (const sel of SELECTEURS) {
    try {
      const cible = page.locator(sel).first();
      await cible.waitFor({ state: "visible", timeout: 12000 });
      // Le rendu d'un visuel est progressif : on laisse les animations finir.
      await page.waitForTimeout(attenteMs);
      return cible;
    } catch { /* conteneur absent : on essaie le suivant */ }
  }
  return null;
}

/** Sommes-nous devant un écran de connexion Microsoft ? */
async function demandeConnexion(page) {
  const url = page.url();
  return /login\.microsoftonline\.com|\/signin|login\.live\.com/i.test(url);
}

async function demanderEntree(message) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise(ok => rl.question(message, () => { rl.close(); ok(); }));
}

async function principal() {
  const o = options(process.argv.slice(2));
  const cheminSelection = o._[0];
  if (!cheminSelection) {
    console.log(
      "Utilisation :\n" +
      "  node outils/capturer-visuels.js <selection.json> [options]\n\n" +
      "Options :\n" +
      "  --connexion        ouvre une fenêtre pour se connecter à Power BI (première fois)\n" +
      "  --captures <dir>   dossier des images (défaut : ./captures)\n" +
      "  --profil <dir>     profil de navigateur conservé (défaut : ~/.annuaire-kpi-profil)\n" +
      "  --attente <ms>     délai de rendu après affichage (défaut : 4000)\n" +
      "  --selecteur <css>  forcer le conteneur à capturer\n" +
      "  --visible          montrer le navigateur pendant la capture\n" +
      "  --deck             enchaîner sur la génération du PowerPoint\n");
    process.exit(1);
  }

  const selection = lireSelection(cheminSelection);
  const base = path.dirname(path.resolve(cheminSelection));
  const dossier = path.resolve(o.captures || path.join(base, "captures"));
  const profil = path.resolve(o.profil || path.join(os.homedir(), ".annuaire-kpi-profil"));
  const attente = Number(o.attente || 4000);
  const connexion = "connexion" in o;

  fs.mkdirSync(dossier, { recursive: true });

  const ctx = await chromium.launchPersistentContext(profil, {
    headless: !(connexion || "visible" in o),
    viewport: { width: 1600, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"]
  });
  const page = ctx.pages()[0] || await ctx.newPage();

  if (connexion) {
    await page.goto("https://app.powerbi.com/", { waitUntil: "domcontentloaded" });
    console.log("\nConnectez-vous à Power BI dans la fenêtre qui vient de s'ouvrir.");
    await demanderEntree("Appuyez sur Entrée une fois connecté… ");
  }

  const echecs = [];
  let faites = 0;

  for (let i = 0; i < selection.diapos.length; i++) {
    const d = selection.diapos[i];
    const etiquette = `[${i + 1}/${selection.diapos.length}] ${d.titre}`;

    if (!d.lien) { console.log(`  – ${etiquette} — aucun lien`); echecs.push(d.titre); continue; }

    try {
      await page.goto(d.lien, { waitUntil: "domcontentloaded", timeout: 60000 });

      if (await demandeConnexion(page)) {
        throw new Error("Power BI demande une connexion — relancez avec --connexion");
      }

      const cible = o.selecteur
        ? page.locator(o.selecteur).first()
        : await attendreVisuel(page, attente);

      const chemin = path.join(dossier, d.fichier);
      if (cible) await cible.screenshot({ path: chemin });
      else       await page.screenshot({ path: chemin });   // repli : la page entière

      faites++;
      console.log(`  ✓ ${etiquette} → ${d.fichier}`);
    } catch (err) {
      echecs.push(d.titre);
      console.log(`  ✗ ${etiquette} — ${err.message.split("\n")[0]}`);
    }
  }

  await ctx.close();
  console.log(`\n${faites} capture(s) dans ${dossier}`);
  if (echecs.length) console.log(`${echecs.length} en échec : ${echecs.join(", ")}`);

  if ("deck" in o) {
    const { octets, avecImage, sansImage } = await construire(selection, dossier, o.modele);
    const sortie = o.sortie || path.join(base,
      "deck-" + String(selection.nom || "selection").toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".pptx");
    fs.writeFileSync(sortie, Buffer.from(octets));
    console.log(`\n✓ ${sortie} — ${avecImage} visuel(s) intégré(s)` +
      (sansImage.length ? `, ${sansImage.length} cadre(s) d'attente` : ""));
  }
}

if (require.main === module) {
  principal().catch(err => { console.error("✗ " + err.message); process.exit(1); });
}

module.exports = { SELECTEURS, attendreVisuel };
