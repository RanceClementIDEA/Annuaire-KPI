/* ============================================================
   COUCHE DE STOCKAGE
   ------------------------------------------------------------
   Centralise toutes les clés localStorage (elles étaient
   auparavant écrites en dur à 27 endroits) et gère proprement
   les deux cas d'échec : contenu illisible et quota dépassé.

   Chargé en <script> classique : expose l'objet global Store.
   ============================================================ */
(function (root) {
  "use strict";

  /** Registre unique des clés. Une faute de frappe devient détectable. */
  const KEYS = Object.freeze({
    USER:        "kpiUser",
    FAVORITES:   "kpiFav_",           // suffixé par l'identifiant utilisateur
    MANUAL:      "kpiManualEntries",
    PERSONAL:    "kpiPersonal_",      // suffixé par l'identifiant utilisateur
    OVERRIDES:   "kpiOverrides",
    DELETED:     "kpiDeletedIds",
    PURGED:      "kpiPurgedIds",   // doit rester identique à app.js (savePurged/loadPurged)
    SITES:       "kpiSites",
    ACTIVITY:    "kpiActivity",
    DATA_CACHE:  "kpiDataCache",
    FILE_B64:    "kpiFileB64",
    FILE_LEGACY: "kpiFile",           // ancien format (tableau de nombres)
    META:        "kpiMeta",
    SNAPSHOTS:   "kpiSnapshots",
    SYNC_CONFIG: "kpiSyncConfig",
    SYNC_OPTOUT: "kpiSyncOptOut",
    SYNC_FAV:    "kpiSyncFavorites",
    FAV_META:    "kpiFavMeta",
    LOCAL_AT:    "kpiLocalUpdatedAt",
    CLOCK_OFF:   "kpiClockOffset"
  });

  /** Dernier avertissement de quota, pour ne pas spammer l'utilisateur. */
  let lastQuotaWarning = 0;

  function isQuotaError(err) {
    return err && (err.name === "QuotaExceededError" ||
                   err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
                   err.code === 22 || err.code === 1014);
  }

  /**
   * Lit et désérialise une valeur.
   * En cas de contenu corrompu, journalise et renvoie la valeur de repli
   * (plutôt que d'avaler l'erreur en silence).
   */
  function readJSON(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (err) {
      console.warn(`[Store] Contenu illisible pour « ${key} », valeur de repli utilisée.`, err);
      return fallback;
    }
  }

  /**
   * Sérialise et écrit une valeur.
   * @returns {boolean} true si l'écriture a réussi
   */
  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      if (isQuotaError(err)) {
        console.error(`[Store] Quota de stockage dépassé en écrivant « ${key} ».`, err);
        notifyQuota();
      } else {
        console.error(`[Store] Échec d'écriture pour « ${key} ».`, err);
      }
      return false;
    }
  }

  function readRaw(key, fallback = null) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : v; }
    catch (err) { console.warn(`[Store] Lecture impossible pour « ${key} ».`, err); return fallback; }
  }

  function writeRaw(key, value) {
    try { localStorage.setItem(key, value); return true; }
    catch (err) {
      if (isQuotaError(err)) { console.error(`[Store] Quota dépassé pour « ${key} ».`, err); notifyQuota(); }
      else console.error(`[Store] Échec d'écriture pour « ${key} ».`, err);
      return false;
    }
  }

  function remove(key) {
    try { localStorage.removeItem(key); } catch (err) { console.warn(`[Store] Suppression impossible : ${key}`, err); }
  }

  /** Prévient l'utilisateur au plus une fois par minute. */
  function notifyQuota() {
    if (Date.now() - lastQuotaWarning < 60000) return;
    lastQuotaWarning = Date.now();
    if (typeof root.showToast === "function") {
      root.showToast("⚠️ Stockage du navigateur saturé — allégez les instantanés ou ré-importez l'Excel", 5000);
    }
  }

  /**
   * Estime l'occupation du stockage, en octets.
   * Utile pour le panneau de diagnostic.
   */
  function usage() {
    let total = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        total += (k.length + (localStorage.getItem(k) || "").length) * 2; // UTF-16
      }
    } catch { /* volontairement ignoré : simple indicateur */ }
    return total;
  }

  const API = { KEYS, readJSON, writeJSON, readRaw, writeRaw, remove, usage, isQuotaError };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.Store = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
