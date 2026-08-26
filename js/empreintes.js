/* ============================================================
   EMPREINTES DE VISUELS POWER BI
   ------------------------------------------------------------
   Le complément Power BI ne relit pas l'adresse quand on rouvre un
   fichier : il restaure ce qu'il avait mémorisé au moment de
   l'insertion. Un fichier fabriqué de toutes pièces, même avec une
   adresse rigoureusement identique à une insertion manuelle qui
   fonctionne, affiche donc « l'objet visuel n'existe plus ».

   Une EMPREINTE est cette mémoire, relevée une fois sur un fichier
   où l'insertion a été faite à la main, puis rejouée à volonté :

     • nom de l'objet visuel, du rapport, de la page ;
     • identifiant du jeu de données ;
     • état sérialisé de la page (filtres, segments).

   Ce qui appartient à la session d'insertion — identifiants de
   session, horodatage, annotations — est écarté : la diapositive
   greffée sans ces champs s'affiche aussi bien, et les recopier
   ferait porter à un fichier neuf les traces d'un autre.

   Comme js/selection.js : aucun DOM, aucun stockage, aucune horloge
   implicite. La lecture d'un .pptx vit dans outils/, pas ici.
   ============================================================ */
(function (root) {
  "use strict";

  const Merge = (typeof module !== "undefined" && module.exports)
    ? require("./merge.js")
    : root;

  /* Ce qu'on relève. L'ordre est celui que Power BI emploie lui-même ;
     le complément n'en dépend pas, mais un fichier généré reste ainsi
     comparable à un fichier fabriqué à la main. */
  const CHAMPS = [
    "artifactName", "reportName", "pageName", "pageDisplayName",
    "datasetId", "bookmark", "initialStateBookmark",
    /* Relevés eux aussi : l'adresse d'incorporation porte l'indicatif du
       locataire et les options du complément, que le générateur ne peut
       que deviner ; la couleur de fond évite un écart visible. */
    "embedUrl", "backgroundColor"
  ];

  /* Ce qu'on ne relève JAMAIS : propre à la session d'insertion.
     Vérifié : une greffe sans ces champs s'affiche correctement. */
  const CHAMPS_DE_SESSION = [
    "creatorSessionId", "creatorUserId", "creatorTenantId",
    "reportEmbeddedTime", "numberOfAnnotations", "annotationNoteShown"
  ];

  /* Les deux plus gros champs : ~5 Ko chacun, et toujours identiques.
     Les stocker en double doublerait le poids du document partagé. */
  const CHAMPS_ETAT = ["bookmark", "initialStateBookmark"];

  /**
   * Clé stable d'un visuel, indépendante des paramètres d'affichage
   * (taille, signet) qui varient d'un partage à l'autre.
   * @returns {string} "" si le lien ne désigne pas un visuel
   */
  function cleVisuel(lien) {
    const txt = String(lien || "");
    /* L'identifiant de rapport est un GUID en pratique, mais on ne l'impose
       pas : la clé n'a besoin que d'être stable et propre à ce visuel, et
       une forme d'adresse inattendue ne doit pas rendre le KPI inéligible. */
    const m = txt.match(/reports\/([0-9a-zA-Z-]+)(?:\/([0-9a-zA-Z-]+))?/);
    if (!m) return "";
    const visuel = txt.match(/[?&]visual=([0-9a-zA-Z-]+)/);
    if (!visuel) return "";
    /* Le SIGNET fait partie de l'identité, et c'est contre-intuitif.
       Plusieurs KPI partagent souvent le même visuel : ce qui les
       distingue, ce sont leurs filtres, portés par `bookmarkGuid`.
       Vérifié sur huit insertions du même visuel : huit signets, huit
       états sérialisés tous différents. Une empreinte ne vaut donc que
       pour SON signet. */
    const signet = signetDe(txt);
    return m[1].toLowerCase() + "/" + (m[2] || "") + "/" + visuel[1]
         + (signet ? "/" + signet : "");
  }

  /**
   * Met une empreinte en forme canonique.
   * Les valeurs restent ENCODÉES pour XML, telles que relevées : les
   * réécrire ferait courir le risque d'un double échappement au moment
   * de fabriquer le fichier.
   */
  function normaliserEmpreinte(brut, options) {
    const o = options || {};
    const src = brut && typeof brut === "object" ? brut : {};
    const props = src.proprietes && typeof src.proprietes === "object" ? src.proprietes : {};

    const retenues = {};
    CHAMPS.forEach(n => {
      const v = props[n];
      if (typeof v === "string" && v !== "") retenues[n] = v;
    });
    /* Les deux états sont toujours identiques et pèsent ~5 Ko chacun :
       on n'en garde qu'un, `proprietesPour` reconstitue l'autre. */
    if (retenues.initialStateBookmark === retenues.bookmark) delete retenues.initialStateBookmark;

    return {
      id: String(src.id || o.id || ""),
      libelle: String(src.libelle || o.libelle || "").trim(),
      /* Le signet dont l'état provient : sans lui on ne peut pas savoir
         si l'état qu'on s'apprête à poser correspond bien au KPI. */
      signet: String(src.signet || o.signet || ""),
      proprietes: retenues,
      _mtime: Number(src._mtime) || Number(o.horodatage) || 0,
      _by: String(src._by || o.auteur || "?")
    };
  }

  /**
   * Pourquoi un complément n'a rien donné — pour le dire, plutôt que de
   * laisser une insertion disparaître sans un mot.
   *
   * @returns {string} "" si l'empreinte est bonne, sinon un motif :
   *   "lien"      le complément ne désigne pas un visuel
   *   "fabrique"  diapositive fabriquée, pas d'insertion manuelle
   *   "autrepage" l'insertion a renvoyé une AUTRE page que celle du lien —
   *               en pratique, le signet du lien n'existe plus dans Power
   *               BI et le complément est retombé sur la page d'accueil
   *   "vide"      aucune propriété exploitable
   */
  function raisonRefus(proprietes) {
    const props = proprietes && typeof proprietes === "object" ? proprietes : {};
    const id = cleVisuel(dechapper(props.reportUrl || ""));
    if (!id) return "lien";
    if (!props.artifactName) return "fabrique";
    const pageLien = pageDeCle(id).split("/")[1] || "";
    const pageMemorisee = dechapper(props.pageName || "").replace(/^"|"$/g, "");
    if (pageLien && pageMemorisee && pageLien !== pageMemorisee) return "autrepage";
    return Object.keys(normaliserEmpreinte({ id, proprietes: props }).proprietes).length ? "" : "vide";
  }

  /**
   * Empreinte tirée d'un jeu de propriétés relevé sur un complément.
   * @returns {Object|null} null si rien d'exploitable n'a été trouvé
   */
  function creerEmpreinte(proprietes, options) {
    const o = options || {};
    const props = proprietes && typeof proprietes === "object" ? proprietes : {};
    const id = o.id || cleVisuel(dechapper(props.reportUrl || ""));
    if (!id) return null;

    /* `artifactName` est la marque d'une insertion faite à la main : c'est
       le complément lui-même qui l'écrit après avoir résolu le visuel.
       Sans lui, on a affaire à une diapositive FABRIQUÉE, dont il n'y a
       rien à apprendre — la relever produirait une empreinte creuse qui
       masquerait la vraie. */
    if (!props.artifactName) return null;

    /* Garde-fou : la page mémorisée doit être celle du lien.
       Un support de diagnostic — ou n'importe quel fichier où l'on a posé
       l'état d'une page sur le visuel d'une autre — porte un complément
       qui a l'air d'une insertion manuelle mais dont l'état appartient à
       une AUTRE page. Le relever produirait une empreinte piégée : elle
       prétendrait couvrir une page dont elle n'a pas l'état, et
       empêcherait de relever la vraie. */
    const pageLien = pageDeCle(id).split("/")[1] || "";
    const pageMemorisee = dechapper(props.pageName || "").replace(/^"|"$/g, "");
    if (pageLien && pageMemorisee && pageLien !== pageMemorisee) return null;

    const emp = normaliserEmpreinte({ id, proprietes: props }, o);
    emp.signet = signetDe(dechapper(props.reportUrl || ""));
    if (!emp.libelle) emp.libelle = dechapper(props.artifactName).replace(/^"|"$/g, "");
    return Object.keys(emp.proprietes).length ? emp : null;
  }

  /** Valeur d'attribut XML ramenée à son texte, pour l'analyser. */
  function dechapper(txt) {
    return String(txt || "")
      .replace(/&quot;/g, "").replace(/&apos;/g, "'")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
  }

  /**
   * Propriétés à passer au générateur pour une empreinte donnée.
   * `initialStateBookmark` est reconstitué depuis `bookmark` : les deux
   * sont toujours identiques, on n'en stocke qu'un.
   */
  function proprietesPour(empreinte) {
    const emp = empreinte && empreinte.proprietes ? empreinte.proprietes : null;
    if (!emp) return null;
    const out = {};
    CHAMPS.forEach(n => { if (emp[n]) out[n] = emp[n]; });
    if (out.bookmark && !out.initialStateBookmark) out.initialStateBookmark = out.bookmark;
    return Object.keys(out).length ? out : null;
  }

  /**
   * Clé de la PAGE d'un lien : rapport + page, sans le visuel.
   * L'état sérialisé est un état de page — filtres et segments de toute
   * la page, où le visuel visé n'est qu'un objet parmi les autres. Il
   * vaut donc pour tous les visuels de cette page.
   * @returns {string} "" si le lien ne désigne pas une page de rapport
   */
  function clePage(lien) {
    return pageDeCle(cleVisuel(lien));
  }

  /**
   * Le signet d'un lien de partage (`bookmarkGuid`).
   *
   * C'est LUI qui distingue deux KPI portés par le même visuel : les
   * filtres et segments vivent dans le signet, pas dans `visual=`. Sur
   * cet annuaire, trois « Volumétrie » partagent un visuel et quatre
   * « Taux de service » un autre — seul le signet les sépare.
   * @returns {string} "" si le lien n'en porte pas
   */
  function signetDe(lien) {
    return (String(lien || "").match(/[?&]bookmarkGuid=([0-9a-zA-Z-]+)/) || [])[1] || "";
  }

  /** La partie « rapport/page » d'une clé déjà construite. */
  function pageDeCle(cle) {
    const bouts = String(cle || "").split("/");
    return bouts.length >= 2 && bouts[1] ? bouts[0] + "/" + bouts[1] : "";
  }

  /** Le signet porté par une clé, s'il y en a un. */
  function signetDeCle(cle) {
    const bouts = String(cle || "").split("/");
    return bouts.length >= 4 ? bouts[3] : "";
  }

  /** Les empreintes sous forme de liste, qu'on en donne une liste ou un dictionnaire. */
  function liste(empreintes) {
    return Array.isArray(empreintes)
      ? empreintes
      : Object.keys(empreintes || {}).map(k => empreintes[k]);
  }

  /**
   * Empreinte correspondant à un lien, dans une liste ou un dictionnaire.
   * @returns {Object|null}
   */
  function trouver(empreintes, lien) {
    const cle = cleVisuel(lien);
    if (!cle) return null;
    return liste(empreintes).find(e => e && e.id === cle) || null;
  }

  /**
   * Empreinte d'un AUTRE visuel de la même page.
   *
   * Vérifié en conditions réelles : l'état relevé sur un visuel restitue
   * correctement un autre visuel de la même page. C'est ce qui fait toute
   * la différence de charge de travail — une insertion manuelle par PAGE
   * au lieu d'une par KPI.
   *
   * @returns {Object|null}
   */
  function trouverParPage(empreintes, lien) {
    const page = clePage(lien);
    if (!page) return null;
    return liste(empreintes)
      .filter(e => e && e.proprietes && e.proprietes.bookmark && pageDeCle(e.id) === page)
      .sort((a, b) => (b._mtime || 0) - (a._mtime || 0))[0] || null;
  }

  /**
   * Ce qu'il faut poser sur une diapositive pour ce lien, empreinte de
   * page comprise.
   *
   * @returns {{proprietes:Object, empreinte:Object, emprunt:boolean}|null}
   */
  function resoudre(empreintes, lien) {
    /* Correspondance EXACTE, signet compris. L'emprunt à un voisin a été
       essayé puis abandonné : l'état sérialisé porte les filtres du KPI
       sur lequel il a été relevé, si bien qu'un état emprunté affiche le
       bon graphique avec les chiffres d'un autre. Mieux vaut annoncer
       « à relever » qu'une diapositive fausse. */
    const exacte = trouver(empreintes, lien);
    if (!exacte) return null;
    const props = proprietesPour(exacte);
    if (!props) return null;
    return { proprietes: props, empreinte: exacte, emprunt: false, memeSignet: true };
  }

  /**
   * Une empreinte existe-t-elle pour ce visuel, mais sur un AUTRE signet ?
   *
   * C'est le signe qu'on a repartagé le lien depuis Power BI : chaque
   * partage crée un nouveau `bookmarkGuid`, et l'empreinte relevée sur
   * l'ancien ne vaut plus. Le dire évite de chercher longtemps pourquoi
   * un KPI qui marchait hier réclame soudain un relevé.
   *
   * @returns {Object|null} l'empreinte devenue orpheline, s'il y en a une
   */
  function empreinteDepassee(empreintes, lien) {
    const cle = cleVisuel(lien);
    if (!cle || trouver(empreintes, cle ? lien : "")) return null;
    const bouts = cle.split("/");
    if (bouts.length < 4) return null;              // pas de signet : rien à dépasser
    const sansSignet = bouts.slice(0, 3).join("/");
    return liste(empreintes).find(e =>
      e && e.id && e.id !== cle && e.id.indexOf(sansSignet + "/") === 0) || null;
  }

  /** Même arbitrage que les sélections : le plus récent l'emporte. */
  function fusionnerEmpreintes(locales, distantes) {
    const propre = liste => (Array.isArray(liste) ? liste : [])
      .filter(e => e && e.id)
      .map(e => normaliserEmpreinte(e));
    if (Merge && typeof Merge.mergeEntries === "function") {
      return Merge.mergeEntries(propre(locales), propre(distantes));
    }
    // Repli défensif : la fusion doit rester possible même isolée.
    const map = new Map();
    propre(distantes).forEach(e => map.set(e.id, e));
    propre(locales).forEach(e => {
      const autre = map.get(e.id);
      if (!autre || (e._mtime || 0) >= (autre._mtime || 0)) map.set(e.id, e);
    });
    return [...map.values()];
  }

  /**
   * Poids approximatif du lot, en octets. Le document de synchronisation
   * est plafonné à 1 Mo côté Firestore : l'état sérialisé pèse ~5 Ko par
   * visuel, il faut donc pouvoir prévenir avant de buter dessus.
   */
  /**
   * Signature courte d'un état, pour désigner UNE empreinte précise.
   *
   * Sert aux rétractations : dire « cette empreinte-là est fausse » sans
   * condamner le lien. Un relevé refait proprement porte le même
   * identifiant mais un autre état — il doit revenir sans obstacle.
   */
  function signatureEtat(empreinte) {
    const b = empreinte && empreinte.proprietes && empreinte.proprietes.bookmark;
    if (!b) return "";
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    const t = String(b);
    for (let i = 0; i < t.length; i++) {
      h1 = Math.imul(h1 ^ t.charCodeAt(i), 0x01000193) >>> 0;
      h2 = Math.imul(h2 + t.charCodeAt(i), 0x85ebca6b) >>> 0;
    }
    return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
  }

  /**
   * Ôte les empreintes dont l'état a été rétracté.
   *
   * Six empreintes livrées se sont révélées mal étiquetées : elles
   * montraient toutes la même vue sous des noms de KPI différents. Les
   * retirer du fichier livré ne suffisait pas — le fichier ne fait que
   * COMBLER les manques, si bien qu'elles survivaient dans le stockage de
   * chaque poste et dans le document partagé, et continuaient de produire
   * des diapositives fausses.
   *
   * @param {Array} liste
   * @param {Array<{id:string, etat:string}>} rétractations
   */
  function sansRetirees(liste, retractations) {
    const r = Array.isArray(retractations) ? retractations : [];
    if (!r.length) return Array.isArray(liste) ? liste : [];
    const morts = new Map();
    r.forEach(x => {
      if (!x || !x.id) return;
      if (!morts.has(x.id)) morts.set(x.id, new Set());
      if (x.etat) morts.get(x.id).add(x.etat);
    });
    return (Array.isArray(liste) ? liste : []).filter(e => {
      if (!e || !morts.has(e.id)) return true;
      const etats = morts.get(e.id);
      // Sans état précisé, on retire l'identifiant en entier.
      if (!etats.size) return false;
      // Sinon, seulement CET état : un relevé refait doit pouvoir revenir.
      return !etats.has(signatureEtat(e));
    });
  }

  function poids(empreintes) {
    const liste = Array.isArray(empreintes) ? empreintes : [];
    return liste.reduce((n, e) => n + JSON.stringify(e || {}).length, 0);
  }

  /**
   * L'empreinte porte-t-elle de quoi retrouver le visuel ?
   *
   * Vérifié en conditions réelles : la carte d'identité seule — nom du
   * visuel, de la page, du jeu de données — ne suffit PAS. Le complément
   * affiche encore « l'objet visuel n'existe plus ». Il faut l'état
   * sérialisé. On ne peut donc pas alléger une empreinte pour gagner de
   * la place : elle deviendrait muette.
   */
  function empreinteComplete(empreinte) {
    const props = empreinte && empreinte.proprietes ? empreinte.proprietes : {};
    /* Seul l'état compte. Vérifié : une diapositive privée d'artifactName,
       mais portant l'état réel, affiche le graphique — ce nom n'est qu'une
       étiquette. Il sert au relevé (c'est la marque d'une insertion faite à
       la main), pas à l'affichage. */
    return Boolean(props.bookmark);
  }

  const API = {
    CHAMPS, CHAMPS_DE_SESSION, CHAMPS_ETAT,
    cleVisuel, clePage, pageDeCle, signetDe, signetDeCle, normaliserEmpreinte, creerEmpreinte, raisonRefus, proprietesPour,
    trouver, trouverParPage, resoudre, empreinteDepassee, fusionnerEmpreintes, poids,
    signatureEtat, sansRetirees,
    empreinteComplete, dechapper
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.Empreintes = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
