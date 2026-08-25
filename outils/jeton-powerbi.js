#!/usr/bin/env node
/* ============================================================
   JETON POWER BI — connexion par code d'appareil
   ------------------------------------------------------------
   L'API d'export exige un jeton Microsoft Entra. Le flux « code
   d'appareil » évite tout secret sur le poste : on affiche un code,
   vous l'entrez dans un navigateur, et le jeton arrive.

   Il faut une inscription d'application dans Entra ID — c'est
   l'affaire de votre administrateur, une fois :
     • type « client public » (pas de secret) ;
     • autorisations déléguées Power BI Service :
       Report.Read.All et Dataset.Read.All ;
     • flux client public autorisé.

   Utilisation :
     node outils/jeton-powerbi.js --client <id> --locataire <id>
     export PBI_TOKEN="…"      (la commande vous la donne)
   ============================================================ */
"use strict";

const { options } = require("./generer-deck.js");

const PORTEE = "https://analysis.windows.net/powerbi/api/.default offline_access";

/** Les deux adresses du flux, pour un locataire donné. */
function adresses(locataire) {
  const base = "https://login.microsoftonline.com/" + (locataire || "organizations") + "/oauth2/v2.0";
  return { code: base + "/devicecode", jeton: base + "/token" };
}

/** Corps de formulaire : l'API Entra n'accepte pas de JSON ici. */
function formulaire(champs) {
  return Object.keys(champs)
    .map(k => encodeURIComponent(k) + "=" + encodeURIComponent(champs[k]))
    .join("&");
}

/** Demande un code d'appareil. */
async function demanderCode(appeler, locataire, client) {
  const r = await appeler(adresses(locataire).code, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formulaire({ client_id: client, scope: PORTEE })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error_description || d.error || "demande de code refusée");
  return d;
}

/**
 * Attend que l'utilisateur ait validé dans son navigateur.
 * `authorization_pending` n'est pas une erreur : c'est l'état normal
 * tant que personne n'a encore entré le code.
 */
async function attendreJeton(appeler, dormir, locataire, client, code) {
  const intervalle = (Number(code.interval) || 5) * 1000;
  const fin = Number(code.expires_in || 900);
  for (let passe = 0; passe * (intervalle / 1000) < fin; passe++) {
    await dormir(intervalle);
    const r = await appeler(adresses(locataire).jeton, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formulaire({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        client_id: client, device_code: code.device_code
      })
    });
    const d = await r.json();
    if (r.ok && d.access_token) return d;
    if (d.error === "authorization_pending" || d.error === "slow_down") continue;
    throw new Error(d.error_description || d.error || "connexion refusée");
  }
  throw new Error("délai dépassé — le code a expiré, relancez la commande");
}

module.exports = { PORTEE, adresses, formulaire, demanderCode, attendreJeton };

async function principal() {
  const o = options(process.argv.slice(2));
  const client = o.client || process.env.PBI_CLIENT_ID;
  const locataire = o.locataire || process.env.PBI_TENANT_ID || "organizations";
  if (!client) {
    console.log("Utilisation : node outils/jeton-powerbi.js --client <id d'application> [--locataire <id>]\n");
    console.log("L'identifiant d'application vient d'une inscription Entra ID :");
    console.log("  • client public, sans secret ;");
    console.log("  • autorisations déléguées Power BI Service : Report.Read.All, Dataset.Read.All.");
    process.exit(1);
  }

  const appeler = (url, init) => fetch(url, init);
  const dormir = ms => new Promise(ok => setTimeout(ok, ms));

  const code = await demanderCode(appeler, locataire, client);
  console.log("\n  Ouvrez " + code.verification_uri);
  console.log("  et entrez le code : " + code.user_code + "\n");
  console.log("  (j'attends…)");

  const jeton = await attendreJeton(appeler, dormir, locataire, client, code);
  console.log("\n✓ Connecté. Le jeton vaut " + Math.round((jeton.expires_in || 3600) / 60) + " minutes.\n");
  console.log("Windows :  set PBI_TOKEN=" + jeton.access_token);
  console.log("macOS/Linux :  export PBI_TOKEN=\"" + jeton.access_token + "\"");
}

if (require.main === module) {
  principal().catch(err => { console.error("✗ " + err.message); process.exit(1); });
}
