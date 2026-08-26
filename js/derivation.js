/* ============================================================
   DÉRIVER UNE EMPREINTE D'UNE AUTRE
   ------------------------------------------------------------
   Un annuaire de 13 KPI × 3 temporalités × 4 zones, c'est 156 liens.
   Autant d'insertions manuelles : intenable.

   Or l'état sérialisé d'un signet contient les SEGMENTS de la page —
   le KPI retenu, la priorité, la dimension d'affichage, le code aire.
   Deux états du même visuel ne diffèrent que par une poignée de
   conteneurs sur cinquante-quatre, et ce sont exactement ceux-là.

   Vérifié en conditions réelles, dans PowerPoint :
     • un état décompressé puis recompressé à l'identique s'affiche ;
     • un état dont on a recopié les conteneurs divergents d'un autre
       affiche EXACTEMENT ce que le second affichait.

   D'où le principe : on relève à la main un exemple par valeur d'axe
   — une zone, une temporalité — et l'annuaire en déduit toutes les
   combinaisons. 156 redevient une poignée.

   On ne FABRIQUE jamais rien : on recopie, conteneur par conteneur,
   ce que Power BI a lui-même écrit. Un état inventé est rejeté ; un
   état recomposé de morceaux réels ne l'est pas.

   Aucun DOM, aucun stockage. La compression vit ici parce qu'elle
   diffère entre Node et navigateur, et nulle part ailleurs.
   ============================================================ */
(function (root) {
  "use strict";

  const estNode = typeof module !== "undefined" && module.exports;

  /* ─── L'état, dans les deux sens ─────────────────────────── */

  /** Ôte l'échappement XML d'une valeur de propriété. */
  function nu(valeur) {
    return String(valeur || "").replace(/&quot;/g, "").replace(/^"|"$/g, "");
  }

  function versOctets(b64) {
    if (estNode) return Buffer.from(b64, "base64");
    const binaire = atob(b64);
    const o = new Uint8Array(binaire.length);
    for (let i = 0; i < binaire.length; i++) o[i] = binaire.charCodeAt(i);
    return o;
  }

  function versBase64(octets) {
    if (estNode) return Buffer.from(octets).toString("base64");
    let s = "";
    for (let i = 0; i < octets.length; i++) s += String.fromCharCode(octets[i]);
    return btoa(s);
  }

  /**
   * Décompresse un état. Le navigateur n'a pas de gzip synchrone :
   * la fonction est donc asynchrone des deux côtés.
   * @returns {Promise<Object>}
   */
  async function lireEtat(valeur) {
    const octets = versOctets(nu(valeur));
    if (estNode) {
      return JSON.parse(require("node:zlib").gunzipSync(octets).toString("utf8"));
    }
    /* `Response` plutôt que `Blob` : les deux savent donner un flux, mais
       Response existe partout où l'on tourne, y compris dans le bac à
       sable du banc de test. */
    const flux = new Response(octets).body.pipeThrough(new DecompressionStream("gzip"));
    return JSON.parse(await new Response(flux).text());
  }

  /** Recompresse un état, prêt à être écrit comme valeur d'attribut XML. */
  async function ecrireEtat(objet) {
    const texte = JSON.stringify(objet);
    if (estNode) {
      const b = require("node:zlib").gzipSync(Buffer.from(texte, "utf8"));
      return "&quot;" + b.toString("base64") + "&quot;";
    }
    const flux = new Response(texte).body.pipeThrough(new CompressionStream("gzip"));
    const octets = new Uint8Array(await new Response(flux).arrayBuffer());
    return "&quot;" + versBase64(octets) + "&quot;";
  }

  /** La section active d'un état — celle qui porte les conteneurs. */
  function section(etat) {
    const e = (etat && etat.explorationState) || {};
    const s = (e.sections || {})[e.activeSection];
    return s || { visualContainers: {} };
  }

  /* ─── Transformations ────────────────────────────────────── */

  /**
   * Les conteneurs par lesquels deux états diffèrent.
   * Ce sont les segments : c'est là que vivent la zone, la
   * temporalité et le KPI retenu.
   * @returns {string[]}
   */
  function conteneursDivergents(a, b) {
    const va = section(a).visualContainers || {};
    const vb = section(b).visualContainers || {};
    const cles = new Set(Object.keys(va).concat(Object.keys(vb)));
    return [...cles].filter(k => JSON.stringify(va[k]) !== JSON.stringify(vb[k]));
  }

  /**
   * Ce qu'il faut recopier pour passer de l'état `source` à `cible`.
   * On garde les VALEURS, pas une recette : elles viennent de Power BI
   * et ne s'inventent pas.
   * @returns {{conteneurs:Object, retires:string[]}}
   */
  function transformation(source, cible, visuel) {
    const vs = section(source).visualContainers || {};
    const vc = section(cible).visualContainers || {};
    const conteneurs = {};
    const retires = [];
    let subs = [];
    let transposable = true;
    conteneursDivergents(source, cible).forEach(k => {
      if (vc[k] === undefined) { retires.push(k); return; }
      /* Le conteneur du visuel lui-même n'est pas recopié : il est
         propre à CE visuel. On en tire une substitution de colonne,
         qui vaut pour n'importe quel autre. */
      if (visuel && k === visuel) {
        subs = substitutions(vs[k], vc[k]);
        /* Faute de substitution lisible — zéro colonne changée, ou deux et
           l'on ne saurait laquelle répond à laquelle — on recopie le
           conteneur de l'exemple. Mais cette recopie porte la clé de SON
           visuel : posée sur un autre, elle ne touche pas le graphique
           affiché. Les segments de page bougent, le graphique reste sur
           l'ancienne configuration — une vue mi-figue mi-raisin qu'aucun
           contrôle n'attrapait. On note donc que la leçon ne se transpose
           pas, et `appliquer` refusera de la poser ailleurs. */
        if (!subs.length) { conteneurs[k] = JSON.parse(JSON.stringify(vc[k])); transposable = false; }
        return;
      }
      conteneurs[k] = JSON.parse(JSON.stringify(vc[k]));
    });
    return { conteneurs, retires, substitutions: subs, visuel: visuel || "", transposable };
  }

  /**
   * Une leçon vaut-elle pour CE visuel ?
   *
   * Apprise sur un visuel, une leçon se transpose à un autre par
   * substitution de colonne. Faute de substitution lisible, elle ne
   * s'applique qu'à son visuel d'origine.
   */
  function transposableVers(transfo, visuelCible) {
    if (!transfo) return false;
    if (transfo.transposable !== false) return true;
    return !transfo.visuel || !visuelCible || transfo.visuel === visuelCible;
  }

  /**
   * Applique une transformation à un état, sans toucher au reste.
   *
   * @param {string} visuelCible  le visuel du lien visé : c'est SON
   *        conteneur qui reçoit les substitutions, celui dont la clé
   *        porte l'identifiant du visuel.
   */
  function appliquer(etat, transfo, visuelCible) {
    const sortie = JSON.parse(JSON.stringify(etat));
    const v = section(sortie).visualContainers;
    if (!v || !transfo) return sortie;
    Object.keys(transfo.conteneurs || {}).forEach(k => {
      v[k] = JSON.parse(JSON.stringify(transfo.conteneurs[k]));
    });
    (transfo.retires || []).forEach(k => { delete v[k]; });
    if (visuelCible && v[visuelCible] && (transfo.substitutions || []).length) {
      v[visuelCible] = appliquerSubstitutions(v[visuelCible], transfo.substitutions);
    }
    return sortie;
  }

  /** Enchaîne plusieurs transformations, dans l'ordre donné. */
  function appliquerToutes(etat, transfos, visuelCible) {
    return (transfos || []).filter(Boolean)
      .reduce((e, t) => appliquer(e, t, visuelCible), etat);
  }

  /**
   * Les valeurs de `Property` qui changent d'un conteneur à l'autre.
   *
   * C'est ainsi qu'une temporalité se lit : le conteneur d'un visuel
   * passe de la colonne « ReducMonth-year » à « YearWeek » ou « Date ».
   * Et cette colonne ne dépend PAS du visuel — deux visuels d'une même
   * page emploient la même. La leçon apprise sur l'un vaut donc pour
   * l'autre, ce qu'une simple recopie de conteneur ne permettrait pas.
   *
   * @returns {Array<{de:string, a:string}>}
   */
  function substitutions(conteneurSource, conteneurCible) {
    const valeurs = c => {
      const out = [];
      (function marche(v, chemin) {
        if (Array.isArray(v)) v.forEach((x, i) => marche(x, chemin + "/" + i));
        else if (v && typeof v === "object") Object.keys(v).forEach(k => marche(v[k], chemin + "/" + k));
        else if (/\/Property$/.test(chemin) && typeof v === "string") out.push(v);
      })(c, "");
      return out;
    };
    const avant = new Set(valeurs(conteneurSource));
    const apres = new Set(valeurs(conteneurCible));
    const partis = [...avant].filter(v => !apres.has(v));
    const venus = [...apres].filter(v => !avant.has(v));
    /* Une seule colonne remplacée : au-delà, on ne saurait pas laquelle
       correspond à laquelle, et deviner produirait une vue fausse. */
    return partis.length === 1 && venus.length === 1
      ? [{ de: partis[0], a: venus[0] }] : [];
  }

  /**
   * Rejoue des substitutions dans un conteneur, sur les seules valeurs
   * de `Property` : ailleurs, le même mot pourrait vouloir dire tout
   * autre chose.
   */
  function appliquerSubstitutions(conteneur, subs) {
    if (!conteneur || !subs || !subs.length) return conteneur;
    const table = new Map(subs.map(s => [s.de, s.a]));
    const copie = JSON.parse(JSON.stringify(conteneur));
    (function marche(v, parent, cle) {
      if (Array.isArray(v)) v.forEach((x, i) => marche(x, v, i));
      else if (v && typeof v === "object") Object.keys(v).forEach(k => marche(v[k], v, k));
      else if (cle === "Property" && table.has(v)) parent[cle] = table.get(v);
    })(copie, null, null);
    return copie;
  }

  /**
   * Une transformation qui ne change rien.
   *
   * Elle survient quand deux empreintes portent le MÊME état sous deux
   * étiquettes différentes — un visuel inséré plusieurs fois sans que les
   * segments aient été touchés entre-temps. L'axe qu'on croirait apprendre
   * là est creux : l'appliquer rendrait la vue de départ sous un autre nom,
   * ce qui est précisément l'erreur qu'on cherche à éviter.
   */
  function estVide(transfo) {
    if (!transfo) return true;
    return !Object.keys(transfo.conteneurs || {}).length
        && !(transfo.retires || []).length
        && !(transfo.substitutions || []).length;
  }

  /**
   * La signature d'une vue : ses conteneurs, et rien d'autre.
   * Deux empreintes de même signature montrent la même chose, quels que
   * soient leur signet et leur libellé.
   */
  function signature(etat) {
    return JSON.stringify(section(etat).visualContainers || {});
  }

  /**
   * Une transformation touche-t-elle les mêmes conteneurs qu'une autre ?
   * Deux axes qui se recouvrent ne peuvent pas être combinés : la
   * seconde effacerait la première.
   */
  function seChevauchent(a, b) {
    const cles = k => Object.keys((k && k.conteneurs) || {}).concat((k && k.retires) || []);
    const ensemble = new Set(cles(a));
    if (cles(b).some(k => ensemble.has(k))) return true;

    /* Les conteneurs peuvent être disjoints et les SUBSTITUTIONS se
       contredire quand même : elles s'appliquent toutes au conteneur du
       visuel visé. Deux leçons qui touchent la même colonne s'enchaînent
       alors, et la colonne finale n'est celle d'aucune des deux — mesuré
       sur les données réelles : « → YearWeek » suivi de « YearWeek → Date »
       donnait Date pour un changement de zone. Mieux vaut refuser la
       combinaison et réclamer un relevé. */
    const sa = (a && a.substitutions) || [], sb = (b && b.substitutions) || [];
    if (!sa.length || !sb.length) return false;
    const touchees = new Set();
    sa.forEach(s => { touchees.add(s.de); touchees.add(s.a); });
    return sb.some(s => touchees.has(s.de) || touchees.has(s.a));
  }

  const API = {
    nu, lireEtat, ecrireEtat, section, signature, transposableVers,
    conteneursDivergents, transformation, substitutions, appliquerSubstitutions,
    appliquer, appliquerToutes, seChevauchent, estVide
  };

  if (estNode) module.exports = API;
  else root.Derivation = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
