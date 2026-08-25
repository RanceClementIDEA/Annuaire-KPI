#!/usr/bin/env node
/* ============================================================
   FABRIQUE DE LA COPIE D'ESSAI DE L'ANNUAIRE
   ------------------------------------------------------------
   Produit `annuaire-test.html` : la MÊME application que
   `index.html` — mêmes scripts, mêmes styles, même modèle — mais
   étanche à la production sur trois points :

     1. le stockage du navigateur est préfixé. Déposées au même
        endroit, les deux pages partagent la même origine, donc le
        même localStorage : sans préfixe, la copie d'essai lirait
        et écrirait les VRAIES fiches.
     2. la synchronisation vise un code dédié : le document
        partagé de l'équipe n'est jamais touché.
     3. le service worker n'est pas enregistré : pas de cache qui
        se mélange entre les deux pages.

   Comme le fichier est dérivé d'index.html à chaque exécution,
   il ne dérive jamais de l'application réelle.

   Utilisation :
     node outils/construire-annuaire-test.js
     node outils/construire-annuaire-test.js --code mon-code-essai
   ============================================================ */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const RACINE = path.join(__dirname, "..");
const PREFIXE_DEFAUT = "essai:";
const CODE_DEFAUT = "idea-kpi-essai";

/** Le script d'isolation, inséré avant tout le reste. */
function amorce(options) {
  const o = options || {};
  const prefixe = o.prefixe || PREFIXE_DEFAUT;
  const code = o.code || CODE_DEFAUT;

  return `<script>
/* ══════════════════════════════════════════════════════════════
   COPIE D'ESSAI — isolation de la production
   Généré par outils/construire-annuaire-test.js. Ne pas modifier
   à la main : relancer la commande après une évolution d'index.html.
   ══════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var PREFIXE = ${JSON.stringify(prefixe)};
  var CODE_ESSAI = ${JSON.stringify(code)};

  /* ── 1. Stockage préfixé ──────────────────────────────────
     Les deux pages vivent sur la même origine et partagent donc
     le même localStorage. Sans ce préfixe, l'essai écraserait
     les vraies fiches. */
  var vrai;
  try { vrai = window.localStorage; } catch (e) { vrai = null; }

  if (vrai) {
    var clesEssai = function () {
      var out = [];
      for (var i = 0; i < vrai.length; i++) {
        var k = vrai.key(i);
        if (k && k.indexOf(PREFIXE) === 0) out.push(k);
      }
      return out;
    };
    var cloison = {
      getItem: function (k) { return vrai.getItem(PREFIXE + k); },
      setItem: function (k, v) { vrai.setItem(PREFIXE + k, v); },
      removeItem: function (k) { vrai.removeItem(PREFIXE + k); },
      clear: function () { clesEssai().forEach(function (k) { vrai.removeItem(k); }); },
      key: function (i) { var k = clesEssai()[i]; return k === undefined ? null : k.slice(PREFIXE.length); },
      get length() { return clesEssai().length; }
    };
    try {
      Object.defineProperty(window, "localStorage", { configurable: true, get: function () { return cloison; } });
    } catch (e) {
      // Navigateur qui refuse la redéfinition : mieux vaut ne rien lancer
      // que d'écrire dans les vraies données.
      document.addEventListener("DOMContentLoaded", function () {
        document.body.innerHTML = "<p style='font:16px system-ui;padding:40px;color:#0D2747'>" +
          "Ce navigateur ne permet pas d'isoler la copie d'essai du stockage réel. " +
          "Ouvrez plutôt l'annuaire de test dans une fenêtre de navigation privée.</p>";
      });
      return;
    }
  }

  /* ── 2. Synchronisation sur un code dédié ─────────────────
     kpiOptoutClearedV2 empêche l'application de réaligner cette
     copie sur le code de production au démarrage. */
  try {
    if (!window.localStorage.getItem("kpiSyncConfig")) {
      window.localStorage.setItem("kpiSyncConfig", JSON.stringify({
        config: {
          apiKey: "AIzaSyBEWADm3g2ab-vUP-sMlQfjpy_QuxhafXM",
          authDomain: "annuaire-kpi.firebaseapp.com",
          projectId: "annuaire-kpi",
          storageBucket: "annuaire-kpi.firebasestorage.app",
          messagingSenderId: "701786102556",
          appId: "1:701786102556:web:9d831bd4efaf25e41778d9"
        },
        code: CODE_ESSAI,
        enabled: true
      }));
    }
    window.localStorage.setItem("kpiOptoutClearedV2", "1");
    window.localStorage.removeItem("kpiSyncOptOut");
  } catch (e) { /* stockage indisponible : la page reste utilisable */ }

  /* ── 3. Pas d'enregistrement de service worker ────────────
     Il partagerait sa portée, donc son cache, avec l'annuaire réel.
     On neutralise l'enregistrement plutôt que l'objet lui-même :
     l'application teste « serviceWorker in navigator » avant de
     s'en servir, et retirer la propriété la ferait échouer plus loin. */
  try {
    if (navigator.serviceWorker && typeof navigator.serviceWorker.register === "function") {
      navigator.serviceWorker.register = function () { return Promise.resolve(); };
    }
  } catch (e) { /* sans effet si le navigateur refuse : le cache reste commun */ }

  /* ── Repartir de zéro, sans toucher à la production ─────── */
  window.reinitialiserEssai = function () {
    if (!confirm("Effacer les données de la copie d'essai sur CET appareil ?\\n\\n" +
                 "L'annuaire réel et le document partagé ne sont pas touchés.")) return;
    try { window.localStorage.clear(); } catch (e) { /* ignoré */ }
    location.reload();
  };

  window.__CODE_ESSAI = CODE_ESSAI;
})();
</script>`;
}

/** La bannière qui rappelle en permanence qu'on n'est pas en production. */
function banniere(code) {
  return `
  <div class="essai-banniere">
    <b>Copie d'essai</b>
    <span>Stockage et synchronisation séparés — code <code>${code}</code>.
    L'annuaire réel et le document de l'équipe ne sont jamais touchés.</span>
    <a href="index.html">Aller à l'annuaire réel</a>
    <button type="button" onclick="reinitialiserEssai()">Repartir de zéro</button>
  </div>`;
}

const STYLE = `
<style>
/* Bannière de la copie d'essai */
.essai-banniere {
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
  padding: 9px 18px; background: var(--gold-dim); color: var(--text-1);
  border-bottom: 1px solid rgba(255,176,32,.35); font-size: 13px;
}
.essai-banniere b { color: var(--gold); letter-spacing: .02em; }
.essai-banniere span { color: var(--text-2); }
.essai-banniere code {
  background: rgba(255,255,255,.08); border-radius: 4px; padding: 1px 6px;
  font-family: ui-monospace, monospace; font-size: 12px; color: var(--text-1);
}
.essai-banniere a, .essai-banniere button {
  background: rgba(255,255,255,.08); color: var(--text-1);
  border: 1px solid var(--border); border-radius: 7px; padding: 5px 11px;
  font-size: 12.5px; font-family: inherit; cursor: pointer; text-decoration: none;
}
.essai-banniere a { margin-left: auto; }
.essai-banniere a:hover, .essai-banniere button:hover { background: rgba(255,255,255,.18); }
</style>`;

/** Transforme le contenu d'index.html en copie d'essai. */
function construire(indexHtml, options) {
  const o = options || {};
  const code = o.code || CODE_DEFAUT;
  let html = indexHtml;

  const ancreTitre = "<title>Annuaire KPI — IDEA</title>";
  if (html.indexOf(ancreTitre) < 0) throw new Error("Titre introuvable dans index.html");
  html = html.replace(ancreTitre, "<title>Annuaire KPI — copie d'essai</title>" + STYLE);

  // Le manifeste installerait la copie d'essai comme application : on l'enlève.
  html = html.replace(/<link rel="manifest"[^>]*>/, "");

  const ancreShell = '<div class="main-wrap">';
  if (html.indexOf(ancreShell) < 0) throw new Error("Colonne principale introuvable dans index.html");
  html = html.replace(ancreShell, ancreShell + banniere(code));

  // L'amorce doit précéder TOUT script de l'application.
  const premierScript = html.indexOf("<script");
  if (premierScript < 0) throw new Error("Aucun script trouvé dans index.html");
  html = html.slice(0, premierScript) + amorce(o) + "\n" + html.slice(premierScript);

  return html;
}

function principal() {
  const argv = process.argv.slice(2);
  const lire = nom => {
    const i = argv.indexOf("--" + nom);
    return i >= 0 ? argv[i + 1] : null;
  };
  const options = { code: lire("code") || CODE_DEFAUT, prefixe: lire("prefixe") || PREFIXE_DEFAUT };
  const sortie = lire("sortie") || path.join(RACINE, "annuaire-test.html");

  const html = construire(fs.readFileSync(path.join(RACINE, "index.html"), "utf8"), options);
  fs.writeFileSync(sortie, html);

  console.log("✓ " + sortie);
  console.log("  code de synchronisation : " + options.code);
  console.log("  préfixe de stockage     : " + options.prefixe);
  console.log("  " + (html.length / 1024).toFixed(1) + " Ko — à déposer à côté d'index.html");
}

if (require.main === module) principal();

module.exports = { construire, amorce, banniere, PREFIXE_DEFAUT, CODE_DEFAUT };
