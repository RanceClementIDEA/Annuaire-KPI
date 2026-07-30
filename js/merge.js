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
    // Égalité : arbitrage identique sur tous les appareils.
    // Les fiches portent l'auteur dans `_by`, les marqueurs de corbeille dans
    // `by` : on accepte les deux, sinon l'arbitrage par auteur ne servait jamais
    // pour les marqueurs et retombait directement sur la comparaison JSON.
    const ac = auteur(candidat), ae = auteur(enPlace);
    if (ac !== ae) return ac > ae;
    return JSON.stringify(candidat) > JSON.stringify(enPlace);
  }

  /** Auteur d'un élément, quel que soit le nom du champ utilisé. */
  function auteur(x) {
    if (!x) return "";
    return String(x._by != null ? x._by : (x.by != null ? x.by : ""));
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
      if (lt > rt) { map[u] = localMap[u]; meta[u] = lt; return; }
      if (lt < rt) return;
      // ÉGALITÉ PARFAITE d'horodatage : il faut un arbitrage déterministe,
      // sinon chaque appareil garde sa propre liste et se la renvoie
      // indéfiniment (un favori retiré ici réapparaît depuis là-bas).
      // Règle : la liste la PLUS COURTE gagne — un retrait n'est jamais annulé
      // par un appareil qui n'a pas encore reçu l'information.
      const l = Array.isArray(localMap[u]) ? localMap[u] : [];
      const r = Array.isArray(map[u]) ? map[u] : [];
      if (l.length < r.length || (l.length === r.length && JSON.stringify(l) < JSON.stringify(r))) {
        map[u] = l; meta[u] = lt;
      }
    });
    return { map, meta };
  }

  /**
   * Fusionne deux dictionnaires « un bloc par utilisateur »
   * (espaces personnels, corbeilles personnelles) SANS jamais perdre le bloc
   * d'un collègue. Seul le bloc de l'utilisateur courant est remplacé par
   * la version locale ; les autres sont conservés tels qu'ils arrivent, et
   * ceux que le distant ne connaît pas encore sont préservés.
   *
   * Sans cela, un appareil au document périmé effaçait du cloud le bloc
   * personnel des autres utilisateurs.
   *
   * @param {Object<string,Array>} local
   * @param {Object<string,Array>} distant
   * @param {string} moi  utilisateur dont le bloc local fait autorité
   * @returns {Object<string,Array>}
   */
  function mergeParUtilisateur(local, distant, moi) {
    const out = { ...(local && typeof local === "object" ? local : {}) };
    const d = (distant && typeof distant === "object") ? distant : {};
    Object.keys(d).forEach(u => { if (u !== moi) out[u] = d[u]; });
    if (moi && d[moi] !== undefined && out[moi] === undefined) out[moi] = d[moi];
    return out;
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
        // `at: 1` et non `null` : une date absente valait 0 dans l'arbitrage,
        // si bien qu'un marqueur « restauré » daté 1 (venu d'une autre
        // normalisation) annulait la suppression. Un plancher commun met les
        // deux à égalité, et l'arbitrage déterministe tranche.
        ? { id: d, title: "", freq: "", at: 1, by: "", state: "deleted" }
        : { state: "deleted", ...d, at: (d && d.at) || 1 })
      .filter(d => d && d.id);
  }

  /**
   * Retire les marqueurs de corbeille devenus inutiles parce que la fiche a
   * été supprimée DÉFINITIVEMENT. Sans ce nettoyage, la corbeille affiche une
   * ligne « données absentes » que rien ne peut faire disparaître : la purger
   * retire le marqueur ici, mais le premier appareil qui n'a pas encore rejoué
   * l'opération le renvoie aussitôt.
   *
   * @param {Array} deletedList
   * @param {Array<string>} purgedList
   * @returns {Array} marqueurs restants
   */
  function sansMarqueursPurges(deletedList, purgedList) {
    if (!Array.isArray(deletedList) || !deletedList.length) return deletedList || [];
    const morts = new Set(purgedList || []);
    if (!morts.size) return deletedList;
    return deletedList.filter(d => d && !morts.has(d.id));
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
    mergeActivity, normalizeDeleted, isDeletedIn, emporte,
    mergeParUtilisateur, sansMarqueursPurges
  };

  // Node (tests) : export CommonJS — Navigateur : fonctions globales
  if (typeof module !== "undefined" && module.exports) {
    module.exports = API;
  } else {
    Object.assign(root, API);
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
