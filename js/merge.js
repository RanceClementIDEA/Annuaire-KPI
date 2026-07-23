/* ============================================================
   MOTEUR DE FUSION — logique pure, sans DOM ni stockage
   ------------------------------------------------------------
   Chaque fiche porte sa propre date de modification (_mtime).
   Deux personnes peuvent modifier deux KPIs différents en même
   temps sans que l'une efface le travail de l'autre.

   Ce fichier est volontairement SANS effet de bord : il se teste
   directement en Node (`node --test`) et se charge tel quel dans
   le navigateur via une balise <script> classique.
   ============================================================ */
(function (root) {
  "use strict";

  /**
   * Départage deux versions d'un même élément.
   * La date la plus récente gagne. En cas d'ÉGALITÉ PARFAITE de date
   * (deux appareils modifiant dans la même milliseconde), on tranche de
   * façon déterministe : sans cela chaque appareil garderait sa propre
   * version et ils resteraient divergents pour toujours.
   * @param {Object} candidat
   * @param {Object} enPlace
   * @param {string} champDate  "_mtime" ou "at"
   * @returns {boolean} true si le candidat doit remplacer celui en place
   */
  function emporte(candidat, enPlace, champDate) {
    const tc = candidat[champDate] || 0, te = enPlace[champDate] || 0;
    if (tc !== te) return tc > te;
    // Égalité : arbitrage identique sur tous les appareils
    const ac = String(candidat._by || ""), ae = String(enPlace._by || "");
    if (ac !== ae) return ac > ae;
    return JSON.stringify(candidat) > JSON.stringify(enPlace);
  }

  /**
   * Fusionne deux listes de fiches par identifiant.
   * En cas de conflit sur une même fiche, la version portant la
   * date de modification la plus récente est retenue.
   * À égalité, la version locale gagne (évite les allers-retours).
   *
   * @param {Array<{id:string,_mtime?:number}>} localArr
   * @param {Array<{id:string,_mtime?:number}>} remoteArr
   * @returns {Array} liste fusionnée
   */
  function mergeEntries(localArr, remoteArr) {
    const map = new Map();
    (remoteArr || []).forEach(e => { if (e && e.id) map.set(e.id, e); });
    (localArr || []).forEach(e => {
      if (!e || !e.id) return;
      const other = map.get(e.id);
      if (!other || emporte(e, other, "_mtime")) map.set(e.id, e);
    });
    return [...map.values()];
  }

  /**
   * Fusionne deux dictionnaires de surcharges (clé = id de fiche Excel).
   * Même arbitrage que mergeEntries, appliqué clé par clé.
   *
   * @param {Object<string,{_mtime?:number}>} localObj
   * @param {Object<string,{_mtime?:number}>} remoteObj
   * @returns {Object} dictionnaire fusionné
   */
  function mergeOverrides(localObj, remoteObj) {
    const out = { ...(remoteObj || {}) };
    Object.entries(localObj || {}).forEach(([id, v]) => {
      const other = out[id];
      if (!other || emporte(v, other, "_mtime")) out[id] = v;
    });
    return out;
  }

  /**
   * Fusionne les marqueurs de suppression / restauration.
   * Le dernier geste daté l'emporte.
   *
   * Les marqueurs « restored » sont CONSERVÉS volontairement :
   * ils annulent une suppression plus ancienne venue d'un autre
   * poste. Sans eux, une fiche restaurée redisparaîtrait à la
   * synchronisation suivante.
   *
   * @param {Array<{id:string,at?:number,state?:string}>} localArr
   * @param {Array<{id:string,at?:number,state?:string}>} remoteArr
   * @returns {Array} marqueurs fusionnés
   */
  function mergeDeleted(localArr, remoteArr) {
    const map = new Map();
    [...(remoteArr || []), ...(localArr || [])].forEach(d => {
      if (!d || !d.id) return;
      const prev = map.get(d.id);
      if (!prev || emporte(d, prev, "at")) map.set(d.id, d);
    });
    return [...map.values()];
  }

  /**
   * Fusionne les favoris utilisateur par utilisateur, jamais en bloc.
   * Sans cela, un envoi depuis un poste effacerait les favoris des
   * collègues ajoutés entre-temps.
   *
   * @param {Object<string,string[]>} localMap   favoris locaux par utilisateur
   * @param {Object<string,number>}   localMeta  horodatage local par utilisateur
   * @param {Object<string,string[]>} remoteMap
   * @param {Object<string,number>}   remoteMeta
   * @returns {{map:Object,meta:Object}}
   */
  function mergeFavorites(localMap, localMeta, remoteMap, remoteMeta) {
    const map = { ...(remoteMap || {}) };
    const meta = { ...(remoteMeta || {}) };
    Object.keys(localMap || {}).forEach(u => {
      const lt = (localMeta || {})[u] || 0;
      const rt = (remoteMeta || {})[u] || 0;
      if (lt >= rt) { map[u] = localMap[u]; meta[u] = lt; }
    });
    return { map, meta };
  }

  /**
   * Fusionne deux journaux d'activité sans doublon, plus récent d'abord.
   *
   * @param {Array} localLog
   * @param {Array} remoteLog
   * @param {number} max nombre maximum d'entrées conservées
   * @returns {Array}
   */
  function mergeActivity(localLog, remoteLog, max) {
    const seen = new Set();
    return [...(remoteLog || []), ...(localLog || [])]
      .filter(e => {
        if (!e) return false;
        const k = e.at + "|" + e.by + "|" + e.action + "|" + e.title + "|" + (e.detail || "");
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((a, b) => b.at - a.at)
      .slice(0, max || 400);
  }

  /**
   * Normalise les marqueurs de suppression.
   * Compatibilité ascendante : l'ancien format était un simple
   * tableau de chaînes (identifiants), sans date ni état.
   *
   * @param {Array<string|Object>} arr
   * @returns {Array<Object>}
   */
  function normalizeDeleted(arr) {
    if (!Array.isArray(arr)) return [];
    return arr
      .map(d => typeof d === "string"
        ? { id: d, title: "", freq: "", at: null, by: "", state: "deleted" }
        : { state: "deleted", ...d })
      .filter(d => d && d.id);
  }

  /**
   * Une fiche est-elle masquée par un marqueur de suppression actif ?
   * @param {Array} deletedList
   * @param {string} id
   * @returns {boolean}
   */
  function isDeletedIn(deletedList, id) {
    return (deletedList || []).some(d => d.id === id && d.state !== "restored");
  }

  const API = {
    mergeEntries, mergeOverrides, mergeDeleted, mergeFavorites,
    mergeActivity, normalizeDeleted, isDeletedIn, emporte
  };

  // Node (tests) : export CommonJS — Navigateur : fonctions globales
  if (typeof module !== "undefined" && module.exports) {
    module.exports = API;
  } else {
    Object.assign(root, API);
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
