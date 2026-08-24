/* ============================================================
   SÉLECTIONS DE KPI — modèle et logique pure
   ------------------------------------------------------------
   Une « sélection » est la liste ordonnée des KPI qu'un rituel
   passe en revue : le COPIL hebdomadaire, le point quotidien
   exploitation… On l'enregistre pour la rejouer chaque semaine et
   la partager avec l'équipe via la synchronisation existante.

   Une sélection désigne des VARIANTES (intitulé + temporalité),
   pas des intitulés : sans cela on ne saurait pas quelle
   temporalité mettre dans la diapositive.

   Comme js/merge.js : aucun DOM, aucun stockage, aucune horloge
   implicite — tout ce qui varie est passé en paramètre.
   ============================================================ */
(function (root) {
  "use strict";

  const Merge = (typeof module !== "undefined" && module.exports)
    ? require("./merge.js")
    : root;

  /** Identifiant stable dérivé du nom, comme slugifyId côté application. */
  function slug(txt) {
    return String(txt || "").toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "sans_nom";
  }

  /**
   * Met une sélection en forme canonique : doublons retirés, ordre
   * conservé, champs manquants comblés. Une entrée sans kpiId est
   * ignorée plutôt que de produire une diapositive vide.
   */
  function normaliserPreset(brut, options) {
    const o = options || {};
    const src = brut && typeof brut === "object" ? brut : {};
    const vus = new Set();
    const items = (Array.isArray(src.items) ? src.items : [])
      .map(it => (typeof it === "string" ? { kpiId: it } : it))
      .filter(it => it && typeof it.kpiId === "string" && it.kpiId)
      .filter(it => { if (vus.has(it.kpiId)) return false; vus.add(it.kpiId); return true; })
      .map(it => ({
        kpiId: it.kpiId,
        site: typeof it.site === "string" ? it.site : "",
        commentaire: typeof it.commentaire === "string" ? it.commentaire : ""
      }));

    const nom = String(src.name || o.nom || "Sans nom").trim() || "Sans nom";
    return {
      id: String(src.id || "preset_" + slug(nom)),
      name: nom,
      defaultSite: typeof src.defaultSite === "string" ? src.defaultSite : "",
      items,
      _mtime: Number(src._mtime) || Number(o.horodatage) || 0,
      _by: String(src._by || o.auteur || "?")
    };
  }

  /** Crée une sélection à partir d'une liste d'identifiants de variantes. */
  function creerPreset(nom, kpiIds, options) {
    const o = options || {};
    return normaliserPreset({
      name: nom,
      defaultSite: o.defaultSite || "",
      items: (kpiIds || []).map(id => ({ kpiId: id, site: o.defaultSite || "", commentaire: "" })),
      _mtime: o.horodatage || 0,
      _by: o.auteur || "?"
    });
  }

  /**
   * Fusionne deux listes de sélections, sélection par sélection.
   * Même arbitrage que les fiches KPI : la date la plus récente gagne,
   * de sorte que deux personnes puissent créer chacune la leur sans
   * s'écraser mutuellement.
   */
  function fusionnerPresets(locales, distantes) {
    const propre = liste => (Array.isArray(liste) ? liste : [])
      .filter(p => p && p.id)
      .map(p => normaliserPreset(p));
    if (Merge && typeof Merge.mergeEntries === "function") {
      return Merge.mergeEntries(propre(locales), propre(distantes));
    }
    // Repli défensif : la fusion doit rester possible même isolée.
    const map = new Map();
    propre(distantes).forEach(p => map.set(p.id, p));
    propre(locales).forEach(p => {
      const autre = map.get(p.id);
      if (!autre || (p._mtime || 0) >= (autre._mtime || 0)) map.set(p.id, p);
    });
    return [...map.values()];
  }

  /**
   * Retire des sélections les KPI qui n'existent plus.
   * Une sélection devenue vide est conservée (l'utilisateur la
   * remplira à nouveau) : on ne supprime jamais son travail en silence.
   * @returns {{presets:Array, retires:number}}
   */
  function nettoyerPresets(presets, idsConnus, horodatage) {
    const connus = idsConnus instanceof Set ? idsConnus : new Set(idsConnus || []);
    let retires = 0;
    const sortie = (presets || []).map(p => {
      const n = normaliserPreset(p);
      const gardes = n.items.filter(it => connus.has(it.kpiId));
      if (gardes.length === n.items.length) return n;
      retires += n.items.length - gardes.length;
      return { ...n, items: gardes, _mtime: horodatage || n._mtime };
    });
    return { presets: sortie, retires };
  }

  /** Libellé court d'un périmètre, tel qu'affiché sur les cartes. */
  function badgeSite(sites, cle) {
    const s = (sites || []).find(x => x && x.key === cle);
    if (!s) return "";
    return String(s.badge || s.name || "").toUpperCase().slice(0, 8);
  }

  /**
   * Titre de la diapositive : intitulé du KPI, suffixé du périmètre
   * comme dans le support « Indicateurs Magasins Armement » (« … LGT »).
   */
  function titreDiapo(kpi, site, sites, options) {
    const o = options || {};
    const base = String((kpi && kpi.title) || "").trim() || "KPI sans intitulé";
    if (o.suffixeSite === false) return base;
    const badge = badgeSite(sites, site);
    return badge ? base + " " + badge : base;
  }

  /**
   * Transforme une sélection en liste de diapositives prêtes à produire.
   * Ne fabrique rien : c'est js/pptx.js qui construit le fichier.
   *
   * @param {Object} preset
   * @param {Array}  fiches  fiches visibles (annuaire + espace personnel)
   * @param {Array}  sites   configuration des périmètres
   * @param {Object} [options] { suffixeSite:boolean }
   * @returns {{diapos:Array, manquants:Array<string>, sansLien:Array<string>}}
   */
  function resoudrePreset(preset, fiches, sites, options) {
    const n = normaliserPreset(preset);
    const parId = new Map();
    (fiches || []).forEach(k => { if (k && k.id) parId.set(k.id, k); });

    const diapos = [], manquants = [], sansLien = [];
    n.items.forEach(it => {
      const kpi = parId.get(it.kpiId);
      if (!kpi) { manquants.push(it.kpiId); return; }

      // Périmètre : celui de la ligne, sinon celui de la sélection,
      // sinon le premier périmètre effectivement renseigné sur la fiche.
      const candidats = [it.site, n.defaultSite].filter(Boolean);
      let site = candidats.find(c => kpi[c]);
      if (!site) site = (sites || []).map(s => s && s.key).find(c => c && kpi[c]) || "";

      const lien = site ? String(kpi[site] || "") : "";
      if (!lien) sansLien.push(it.kpiId);

      diapos.push({
        kpiId: it.kpiId,
        site,
        lien,
        titre: titreDiapo(kpi, site, sites, options),
        commentaire: it.commentaire || "",
        kpi
      });
    });
    return { diapos, manquants, sansLien };
  }

  /** Nom de fichier proposé pour le PowerPoint produit. */
  function nomFichier(preset, date) {
    const d = date || "";
    return `deck-kpi-${slug((preset && preset.name) || "selection")}${d ? "-" + d : ""}.pptx`;
  }

  const API = {
    slug, creerPreset, normaliserPreset, fusionnerPresets,
    nettoyerPresets, resoudrePreset, titreDiapo, badgeSite, nomFichier
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.Selection = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
