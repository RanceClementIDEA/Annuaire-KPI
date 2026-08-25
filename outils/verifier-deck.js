#!/usr/bin/env node
/* ============================================================
   VÉRIFICATION D'UN SUPPORT PRODUIT — ligne de commande
   ------------------------------------------------------------
   Coquille d'affichage autour de js/inspecter-deck.js.

   Utilisation :
     node outils/verifier-deck.js deck.pptx
   ============================================================ */
"use strict";

const fs = require("node:fs");
const Inspecteur = require("../js/inspecter-deck.js");

async function principal() {
  const chemin = process.argv[2];
  if (!chemin) {
    console.log("Utilisation : node outils/verifier-deck.js <deck.pptx>");
    process.exit(1);
  }
  const r = await Inspecteur.analyserDeck(new Uint8Array(fs.readFileSync(chemin)));

  console.log(chemin + " — " + r.diapos.length + " diapositive(s)\n");
  r.diapos.forEach(d => {
    if (d.contenu === "couverture") { console.log(`  ${d.numero}. couverture`); return; }
    console.log(`  ${d.numero}. ${d.titre || "(sans titre)"}`);
    console.log(`     ${d.contenu}` + (d.format ? ` · ${d.format}` : "") + (d.cadre ? ` · cadre ${d.cadre}` : ""));
    if (d.visuel) console.log(`     visuel ${d.visuel} · page ${d.page} · rapport ${d.rapport}`);
    if (d.signet) console.log(`     signet ${d.signet}`);
    d.alertes.forEach(a => console.log(`     ⚠ ${a}`));
  });

  console.log("\n" + (r.alertes
    ? `${r.alertes} point(s) à confirmer`
    : "Aucune anomalie : chaque diapositive pointe sur un visuel."));
  process.exit(r.alertes ? 1 : 0);
}

if (require.main === module) {
  principal().catch(err => { console.error("✗ " + err.message); process.exit(1); });
}

module.exports = Inspecteur;
