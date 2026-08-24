/* ============================================================
   FABRIQUE DE POWERPOINT — assemble un deck à partir du modèle
   ------------------------------------------------------------
   Le modèle « modele-deck.pptx » contient la charte IDEA : masque,
   dispositions, thème, polices, et la diapositive de couverture
   avec trois jetons ({{TITRE}}, {{SOUS_TITRE}}, {{PERIODE}}).

   Ce module y ajoute une diapositive par KPI, calquée sur les
   diapositives 3 à 10 du support « Indicateurs Magasins Armement » :
     • le titre, dans l'espace réservé du modèle (mêmes police et
       couleur que les diapositives existantes)
     • le visuel, centré et mis à l'échelle sans déformation, avec
       un lien cliquable vers le rapport Power BI d'origine
     • la ligne « Commentaires : … » en bas de page
     • le numéro de diapositive

   Aucun DOM, aucun stockage : testable en Node, utilisable tel quel
   dans le navigateur et dans les outils en ligne de commande.
   ============================================================ */
(function (root) {
  "use strict";

  const Zip = (typeof module !== "undefined" && module.exports)
    ? require("./zip.js")
    : root.ZipMini;

  const POUCE = 914400;                     // 1 pouce en EMU
  const LARGEUR_DIAPO = 9144000;            // 10 pouces (format 4:3 du modèle)
  const HAUTEUR_DIAPO = 6858000;            // 7,5 pouces

  /* Zone réservée au visuel : sous le titre, au-dessus des commentaires.
     Reprend les marges des diapositives existantes du support IDEA. */
  const ZONE = { x: 297891, y: 949325, l: 8548218, h: 4750000 };
  const TITRE   = { x: 379413, y: 342900, l: 8369300, h: 501650 };
  const COMMENT = { x: 297891, y: 5803044, l: 7593381, h: 430887 };

  /* ─── Utilitaires ────────────────────────────────────────── */

  /** Échappe le texte destiné à un attribut ou un nœud XML. */
  function esc(v) {
    return String(v === undefined || v === null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }

  /** Identifiant de champ stable : deux générations donnent le même fichier. */
  function guid(n) {
    const h = (n >>> 0).toString(16).padStart(8, "0").toUpperCase();
    return `{${h}-0000-4000-8000-00000000${h.slice(0, 4)}}`;
  }

  /**
   * Dimensions en pixels d'une image PNG ou JPEG.
   * Sert uniquement à préserver les proportions : en cas d'échec on
   * retombe sur un cadrage 16:9, jamais sur une image déformée.
   * @returns {{l:number,h:number}}
   */
  function dimensionsImage(octets) {
    const par_defaut = { l: 16, h: 9 };
    if (!octets || octets.length < 24) return par_defaut;
    // PNG : signature puis bloc IHDR
    if (octets[0] === 0x89 && octets[1] === 0x50 && octets[2] === 0x4E && octets[3] === 0x47) {
      const vue = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
      return { l: vue.getUint32(16), h: vue.getUint32(20) };
    }
    // JPEG : on parcourt les segments jusqu'au marqueur SOFn
    if (octets[0] === 0xFF && octets[1] === 0xD8) {
      let i = 2;
      while (i + 9 < octets.length) {
        if (octets[i] !== 0xFF) { i++; continue; }
        const marqueur = octets[i + 1];
        const taille = (octets[i + 2] << 8) | octets[i + 3];
        const estSOF = marqueur >= 0xC0 && marqueur <= 0xCF &&
                       marqueur !== 0xC4 && marqueur !== 0xC8 && marqueur !== 0xCC;
        if (estSOF) return { h: (octets[i + 5] << 8) | octets[i + 6], l: (octets[i + 7] << 8) | octets[i + 8] };
        i += 2 + taille;
      }
    }
    return par_defaut;
  }

  /** Cadre centré dans `zone`, aux proportions de l'image. */
  function cadrer(zone, dims) {
    const ratioZone  = zone.l / zone.h;
    const ratioImage = (dims.l || 16) / (dims.h || 9);
    let l = zone.l, h = zone.h;
    if (ratioImage > ratioZone) h = Math.round(zone.l / ratioImage);
    else                        l = Math.round(zone.h * ratioImage);
    return {
      x: zone.x + Math.round((zone.l - l) / 2),
      y: zone.y + Math.round((zone.h - h) / 2),
      l, h
    };
  }

  /** Extension d'image reconnue par le modèle (png / jpeg). */
  function extensionImage(octets) {
    if (octets && octets[0] === 0xFF && octets[1] === 0xD8) return "jpeg";
    return "png";
  }

  /* ─── Fragments XML ──────────────────────────────────────── */

  function xmlTitre(id, texte) {
    return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Titre"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>`
      + `<p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>`
      + `<p:spPr><a:xfrm><a:off x="${TITRE.x}" y="${TITRE.y}"/><a:ext cx="${TITRE.l}" cy="${TITRE.h}"/></a:xfrm></p:spPr>`
      + `<p:txBody><a:bodyPr><a:normAutofit fontScale="90000"/></a:bodyPr><a:lstStyle/>`
      + `<a:p><a:r><a:rPr lang="fr-FR"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill></a:rPr>`
      + `<a:t>${esc(texte)}</a:t></a:r></a:p></p:txBody></p:sp>`;
  }

  function xmlNumero(id, index) {
    return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Numéro de diapositive"/>`
      + `<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>`
      + `<p:nvPr><p:ph type="sldNum" sz="quarter" idx="12"/></p:nvPr></p:nvSpPr>`
      + `<p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p>`
      + `<a:fld id="${guid(index + 1)}" type="slidenum"><a:rPr lang="fr-FR"/><a:t>${index + 2}</a:t></a:fld>`
      + `<a:endParaRPr lang="fr-FR"/></a:p></p:txBody></p:sp>`;
  }

  function xmlCommentaire(id, texte) {
    const style = `sz="1100" b="1" cap="all"`;
    const remplissage = `<a:solidFill><a:schemeClr val="accent1"><a:lumMod val="75000"/></a:schemeClr></a:solidFill>`
      + `<a:latin typeface="Arial Black"/><a:cs typeface="Arial"/>`;
    return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Commentaires"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>`
      + `<p:spPr><a:xfrm><a:off x="${COMMENT.x}" y="${COMMENT.y}"/><a:ext cx="${COMMENT.l}" cy="${COMMENT.h}"/></a:xfrm>`
      + `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>`
      + `<p:txBody><a:bodyPr wrap="square" anchor="t"><a:spAutoFit/></a:bodyPr><a:lstStyle/>`
      + `<a:p><a:r><a:rPr lang="fr-FR" ${style}>${remplissage}</a:rPr>`
      + `<a:t>${esc("Commentaires : " + (texte || ""))}</a:t></a:r></a:p></p:txBody></p:sp>`;
  }

  function xmlVisuel(id, cadre, relImage, relLien) {
    const lien = relLien ? `<a:hlinkClick xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${relLien}"/>` : "";
    return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Visuel Power BI">${lien}</p:cNvPr>`
      + `<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>`
      + `<p:blipFill><a:blip r:embed="${relImage}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>`
      + `<p:spPr><a:xfrm><a:off x="${cadre.x}" y="${cadre.y}"/><a:ext cx="${cadre.l}" cy="${cadre.h}"/></a:xfrm>`
      + `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
  }

  /** Cadre d'attente lorsqu'aucune capture n'est fournie : cliquable. */
  function xmlAttente(id, texte, relLien) {
    const lien = relLien ? `<a:hlinkClick xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${relLien}"/>` : "";
    return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Visuel à capturer">${lien}</p:cNvPr>`
      + `<p:cNvSpPr/><p:nvPr/></p:nvSpPr>`
      + `<p:spPr><a:xfrm><a:off x="${ZONE.x}" y="${ZONE.y}"/><a:ext cx="${ZONE.l}" cy="${ZONE.h}"/></a:xfrm>`
      + `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 2000"/></a:avLst></a:prstGeom>`
      + `<a:solidFill><a:srgbClr val="F2F6F8"/></a:solidFill>`
      + `<a:ln w="12700" cmpd="sng"><a:solidFill><a:srgbClr val="9FB4C0"/></a:solidFill><a:prstDash val="dash"/></a:ln></p:spPr>`
      + `<p:txBody><a:bodyPr anchor="ctr"/><a:lstStyle/>`
      + `<a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="fr-FR" sz="1400" b="1">`
      + `<a:solidFill><a:srgbClr val="0D2747"/></a:solidFill></a:rPr><a:t>${esc(texte)}</a:t></a:r></a:p>`
      + `<a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="fr-FR" sz="1050"><a:solidFill><a:srgbClr val="5F7C8C"/></a:solidFill></a:rPr>`
      + `<a:t>Cliquer pour ouvrir le visuel dans Power BI</a:t></a:r></a:p></p:txBody></p:sp>`;
  }

  /* ─── Visuel vivant : complément Power BI pour PowerPoint ──
     Relevé sur un fichier produit par Power BI lui-même
     (« Exporter → PowerPoint → Incorporer des données actives ») :
     le complément lit l'adresse du rapport dans la propriété
     `reportUrl`, exprimée en chemin relatif à app.powerbi.com. */

  const COMPLEMENT = { id: "WA200003233", version: "2.0.0.3", store: "fr-FR", storeType: "OMEX" };

  /* Le complément dessine sa propre barre — nom du rapport, « Données
     actives », date de rafraîchissement — AU-DESSUS du visuel. Un cadre
     ajusté au seul format du visuel se retrouve donc entièrement occupé
     par cette barre : on ne voit qu'elle, et rien du graphique.
     Un lien annonçant un visuel 1141 × 51 px donnait un cadre de 0,4
     pouce de haut : la barre faisait 0,45. */
  const BARRE_COMPLEMENT = 411480;      // 0,45 pouce
  const HAUTEUR_MINI_COMPLEMENT = 2194560;  // 2,4 pouces : la barre, et de quoi voir le graphique

  /* Adresse d'incorporation, telle que Power BI la fabrique lui-même.
     `config` encode la région du locataire ; la valeur ci-dessous provient
     d'un export « Incorporer des données actives » réalisé sur le locataire
     IDEA. Elle vaut pour tous les rapports du même locataire ; un autre
     locataire remplacera cette constante par la sienne (elle se lit dans
     n'importe quel fichier produit par Power BI, propriété `embedUrl`). */
  const CONFIG_INCORPORATION =
    "eyJjbHVzdGVyVXJsIjoiaHR0cHM6Ly9XQUJJLUZSQU5DRS1DRU5UUkFMLUEtUFJJTUFSWS1yZWRpcmVjdC5hbmFseXNpcy53aW5kb3dzLm5ldCIsImVtYmVkRmVhdHVyZXMiOnsidXNhZ2VNZXRyaWNzVk5leHQiOnRydWV9fQ%3D%3D";

  /* Les propriétés que le générateur pose de lui-même. Les nommer permet
     de les retirer une à une (valeur null) quand on veut reprendre
     intégralement un complément fabriqué par Power BI. */
  const PROPRIETES_PAR_DEFAUT = [
    "reportUrl", "embedUrl", "reportState", "artifactViewState",
    "isVisualContainerHeaderHidden", "isFiltersActionButtonVisible", "backgroundColor"
  ];

  /** Adresse d'incorporation d'un rapport, quand son identifiant est connu. */
  function adresseIncorporation(reportId) {
    if (!reportId) return "";
    return "/reportEmbed?reportId=" + reportId + "&config=" + CONFIG_INCORPORATION
         + "&disableSensitivityBanner=true&storytellingChangeViewModeShortcutKeys=true";
  }

  /**
   * Analyse une adresse Power BI : désigne-t-elle UN visuel, ou toute une
   * page ? Et quel est le format de ce visuel ?
   *
   * Un lien « Partager → Lien vers cet élément visuel » porte `visual=`,
   * plus la largeur et la hauteur du visuel dans le rapport. Un lien court
   * `app.powerbi.com/links/…` ou l'adresse copiée depuis la barre du
   * navigateur désigne la PAGE entière : le support afficherait alors tout
   * le rapport au lieu du seul graphique.
   *
   * @returns {{type:string, reportId:string, pageName:string, visualName:string,
   *            largeur:number, hauteur:number, ratio:number, aplati:boolean}}
   */
  function analyserLien(lien) {
    const s = String(lien || "");
    const vide = { type: "aucun", reportId: "", pageName: "", visualName: "",
                   largeur: 0, hauteur: 0, ratio: 0, aplati: false };
    if (!s) return vide;

    const requete = s.slice(s.indexOf("?") + 1);
    const parametre = nom => {
      const m = requete.match(new RegExp("(?:^|&)" + nom + "=([^&]*)"));
      return m ? decodeURIComponent(m[1]) : "";
    };
    const chemin = cheminRapport(s).split("?")[0];
    const rapport = (chemin.match(/\/reports\/([^/]+)/) || [])[1] || "";
    const visuel = parametre("visual");
    const largeur = parseFloat(parametre("width")) || 0;
    const hauteur = parseFloat(parametre("height")) || 0;
    const ratio = hauteur ? largeur / hauteur : 0;

    const type = visuel ? "visuel"
               : /^\/links\//.test(chemin) ? "lien-court"
               : rapport ? "page"
               : "inconnu";

    return {
      type, reportId: rapport, pageName: nomPage(s), visualName: visuel,
      bookmark: parametre("bookmarkGuid"),
      largeur, hauteur, ratio,
      // Un visuel dix fois plus large que haut n'est pas un graphique :
      // c'est un bandeau, un titre ou une ligne de cartes. Presque toujours
      // le signe qu'on a copié le lien du mauvais élément.
      aplati: type === "visuel" && ratio > 6
    };
  }

  /**
   * Adresse telle que le complément l'attend : le lien de partage
   * VERBATIM, seulement privé de son hôte.
   *
   * Relevé sur une insertion faite à la main dans PowerPoint — la seule
   * qui affiche réellement le visuel — le complément conserve l'adresse
   * exactement comme elle est collée :
   *
   *   /groups/me/reports/{rapport}/{page}?ctid=…&pbi_source=shareVisual
   *   &visual=…&height=…&width=…&bookmarkGuid=…
   *
   * Y ajouter quoi que ce soit le fait échouer : avec `bookmarkUsage=1`
   * et `fromEntryPoint=export`, il n'arrivait plus à résoudre ni le
   * visuel ni même la page, et retombait sur la première page du
   * rapport. Ces deux paramètres appartiennent au format d'export d'une
   * PAGE ; ils n'ont rien à faire dans un lien de visuel.
   */
  function urlPourComplement(lien) {
    return cheminRapport(lien);
  }

  /** Chemin relatif attendu par le complément (l'hôte est implicite). */
  function cheminRapport(lien) {
    const s = String(lien || "");
    const m = s.match(/^https?:\/\/[^/]+(\/.*)$/);
    return m ? m[1] : s;
  }

  /** Nom de page Power BI, quand l'adresse le porte. */
  function nomPage(lien) {
    const m = String(lien || "").match(/\/reports\/[^/]+\/([^/?#]+)/);
    return m ? m[1] : "";
  }

  /** Valeur de propriété : le complément les stocke encodées en JSON. */
  function propriete(nom, valeur, brut) {
    const v = brut ? String(valeur) : "&quot;" + esc(valeur) + "&quot;";
    return `<we:property name="${esc(nom)}" value="${v}"/>`;
  }

  function xmlWebextension(index, diapo) {
    const url = diapo.urlComplement || urlPourComplement(diapo.lien);
    const info = analyserLien(diapo.lien);
    const incorporation = adresseIncorporation(info.reportId);

    /* Propriétés supplémentaires, telles quelles. Sert au diagnostic et
       à la reprise d'un complément fabriqué par Power BI lui-même :
       { nom: "valeur déjà encodée" }. Une valeur nulle retire la propriété. */
    const sup = diapo.proprietesComplement && typeof diapo.proprietesComplement === "object"
      ? diapo.proprietesComplement : {};
    /* Une propriété fournie ici REMPLACE celle que le générateur poserait :
       sans cela les deux cohabiteraient, et le complément n'en lirait
       qu'une, au hasard. La valeur null retire la propriété. */
    const remplacee = nom => Object.prototype.hasOwnProperty.call(sup, nom);

    const props = [
      propriete("reportUrl", url),
      incorporation ? propriete("embedUrl", incorporation) : "",
      propriete("reportState", "CONNECTED"),
      propriete("artifactViewState", "live"),
      // Ni pageName ni reportName : le complément les résout depuis
      // l'adresse, et les lui imposer l'a déjà fait dérailler.
      propriete("isVisualContainerHeaderHidden", "false", true),
      propriete("isFiltersActionButtonVisible", "false", true),
      propriete("backgroundColor", "#FFFFFF")
    ].filter(bloc => {
      const m = bloc && bloc.match(/name="([^"]+)"/);
      return bloc && !(m && remplacee(m[1]));
    }).concat(
      Object.keys(sup).filter(n => sup[n] !== null)
        .map(n => `<we:property name="${esc(n)}" value="${sup[n]}"/>`)
    ).join("");

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`
      + `<we:webextension xmlns:we="http://schemas.microsoft.com/office/webextensions/webextension/2010/11"`
      + ` id="${guid(index + 100)}">`
      + `<we:reference id="${COMPLEMENT.id}" version="${COMPLEMENT.version}"`
      + ` store="${COMPLEMENT.store}" storeType="${COMPLEMENT.storeType}"/>`
      + `<we:alternateReferences/>`
      + `<we:properties>${props}</we:properties>`
      + `<we:bindings/>`
      + `<we:snapshot xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>`
      + `</we:webextension>`;
  }

  /**
   * Réserve la place de la barre du complément, et impose une hauteur
   * minimale lisible. Sans cela, un visuel très allongé produit un cadre
   * où seule la barre tient — c'est exactement ce qu'on voyait.
   */
  function cadreComplement(cadre) {
    const voulue = cadre.h + BARRE_COMPLEMENT;
    const h = Math.min(ZONE.h, Math.max(HAUTEUR_MINI_COMPLEMENT, voulue));
    return { x: cadre.x, y: ZONE.y + Math.round((ZONE.h - h) / 2), l: cadre.l, h };
  }

  /**
   * Cadre du complément dans la diapositive.
   * `mc:AlternateContent` : les versions de PowerPoint qui savent
   * afficher un complément prennent la branche `Choice`, les autres
   * la branche `Fallback` — qui explique quoi faire plutôt que de
   * laisser un trou blanc.
   */
  function xmlAddin(id, refId, titre, lien) {
    // Le cadre épouse le format réel du visuel : un graphique large et bas
    // reste large et bas, il n'est ni étiré ni noyé dans une zone vide.
    const info = analyserLien(lien);
    const c = info.largeur && info.hauteur
      ? cadreComplement(cadrer(ZONE, { l: info.largeur, h: info.hauteur }))
      : { x: ZONE.x, y: ZONE.y, l: ZONE.l, h: ZONE.h };
    const cadre = `<p:xfrm><a:off x="${c.x}" y="${c.y}"/><a:ext cx="${c.l}" cy="${c.h}"/></p:xfrm>`;
    return `<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">`
      + `<mc:Choice xmlns:we="http://schemas.microsoft.com/office/webextensions/webextension/2010/11"`
      + ` xmlns:pca="http://schemas.microsoft.com/office/powerpoint/2013/contentapp" Requires="we pca">`
      + `<p:graphicFrame><p:nvGraphicFramePr>`
      + `<p:cNvPr id="${id}" name="Visuel Power BI" descr="Contenu de complément pour Microsoft Power BI."/>`
      + `<p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/>`
      + `</p:nvGraphicFramePr>${cadre}`
      + `<a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/webextensions/webextension/2010/11">`
      + `<we:webextensionref xmlns:we="http://schemas.microsoft.com/office/webextensions/webextension/2010/11"`
      + ` xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${refId}"/>`
      + `</a:graphicData></a:graphic></p:graphicFrame>`
      + `</mc:Choice>`
      + `<mc:Fallback>`
      + `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Visuel Power BI"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>`
      + `<p:spPr><a:xfrm><a:off x="${c.x}" y="${c.y}"/><a:ext cx="${c.l}" cy="${c.h}"/></a:xfrm>`
      + `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 2000"/></a:avLst></a:prstGeom>`
      + `<a:solidFill><a:srgbClr val="F2F6F8"/></a:solidFill>`
      + `<a:ln w="12700"><a:solidFill><a:srgbClr val="9FB4C0"/></a:solidFill><a:prstDash val="dash"/></a:ln></p:spPr>`
      + `<p:txBody><a:bodyPr anchor="ctr"/><a:lstStyle/>`
      + `<a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="fr-FR" sz="1400" b="1">`
      + `<a:solidFill><a:srgbClr val="0D2747"/></a:solidFill></a:rPr><a:t>${esc(titre)}</a:t></a:r></a:p>`
      + `<a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="fr-FR" sz="1050">`
      + `<a:solidFill><a:srgbClr val="5F7C8C"/></a:solidFill></a:rPr>`
      + `<a:t>Activez le complément Power BI pour afficher ce visuel</a:t></a:r></a:p>`
      + `</p:txBody></p:sp>`
      + `</mc:Fallback></mc:AlternateContent>`;
  }

  /* Trois façons de remplir le cadre du visuel, par ordre de préférence :
     le complément Power BI (visuel vivant), une capture, un cadre
     d'attente cliquable. */
  function corpsVisuel(diapo, refs) {
    if (refs.complement) return xmlAddin(4, refs.complement, diapo.titre, diapo.lien);
    if (diapo.image)     return xmlVisuel(4, cadrer(ZONE, dimensionsImage(diapo.image)), refs.image, refs.lien);
    return xmlAttente(4, diapo.titre, refs.lien);
  }

  function xmlDiapo(index, diapo, refs) {
    const corps = [
      xmlTitre(2, diapo.titre),
      xmlNumero(3, index),
      corpsVisuel(diapo, refs),
      xmlCommentaire(5, diapo.commentaire)
    ].join("");

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`
      + `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"`
      + ` xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"`
      + ` xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">`
      + `<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>`
      + `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>`
      + `<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>`
      + corps
      + `</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  }

  function xmlRelsDiapo(refs, diapo) {
    const lignes = [
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout2.xml"/>`
    ];
    if (diapo.image) {
      lignes.push(`<Relationship Id="${refs.image}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${refs.fichierImage}"/>`);
    }
    if (refs.lien) {
      lignes.push(`<Relationship Id="${refs.lien}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${esc(diapo.lien)}" TargetMode="External"/>`);
    }
    if (refs.complement) {
      lignes.push(`<Relationship Id="${refs.complement}" Type="http://schemas.microsoft.com/office/2011/relationships/webextension" Target="../webextensions/${refs.fichierComplement}"/>`);
    }
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`
      + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${lignes.join("")}</Relationships>`;
  }

  /* ─── Assemblage ─────────────────────────────────────────── */

  /**
   * @param {Uint8Array} modele  contenu de modele-deck.pptx
   * @param {Object} options
   * @param {string} [options.titre]      titre de couverture
   * @param {string} [options.sousTitre]  sous-titre de couverture
   * @param {string} [options.periode]    période affichée en couverture
   * @param {Array<{titre:string, commentaire?:string, lien?:string,
   *                 image?:Uint8Array, vivant?:boolean}>} options.diapos
   *        `vivant` : insérer le complément Power BI plutôt qu'une image —
   *        le visuel reste connecté et se rafraîchit chez le lecteur.
   * @returns {Promise<Uint8Array>} contenu du .pptx
   */
  async function construireDeck(modele, options) {
    const opts = options || {};
    const diapos = Array.isArray(opts.diapos) ? opts.diapos : [];
    if (!diapos.length) throw new Error("Aucune diapositive à produire");

    const pieces = await Zip.lireZip(modele);
    const exigees = ["[Content_Types].xml", "ppt/presentation.xml", "ppt/_rels/presentation.xml.rels"];
    exigees.forEach(p => { if (!pieces.has(p)) throw new Error("Modèle incomplet : " + p + " manquant"); });

    /* Couverture : substitution des jetons */
    if (pieces.has("ppt/slides/slide1.xml")) {
      const couverture = Zip.versTexte(pieces.get("ppt/slides/slide1.xml"))
        .replace(/\{\{TITRE\}\}/g, esc(opts.titre || "Indicateurs"))
        .replace(/\{\{SOUS_TITRE\}\}/g, esc(opts.sousTitre || ""))
        .replace(/\{\{PERIODE\}\}/g, esc(opts.periode || ""));
      pieces.set("ppt/slides/slide1.xml", Zip.versOctets(couverture));
    }

    /* Numérotation : la couverture occupe déjà slide1.xml */
    let numeroDiapo = 1;
    while (pieces.has(`ppt/slides/slide${numeroDiapo}.xml`)) numeroDiapo++;
    const premiere = numeroDiapo;

    let overrides = "", relations = "", sldIds = "", overridesComplement = "";
    let idImage = 1;

    diapos.forEach((diapo, i) => {
      const n = premiere + i;
      const refs = { image: "rId2", lien: diapo.lien ? "rId3" : null, fichierImage: null,
                     complement: null, fichierComplement: null };

      // Visuel vivant : seulement si on a une adresse à donner au complément.
      if (diapo.vivant && diapo.lien) {
        refs.complement = "rId4";
        refs.fichierComplement = `webextension${i + 1}.xml`;
        pieces.set("ppt/webextensions/" + refs.fichierComplement, Zip.versOctets(xmlWebextension(i, diapo)));
        overridesComplement += `<Override PartName="/ppt/webextensions/${refs.fichierComplement}"`
          + ` ContentType="application/vnd.ms-office.webextension+xml"/>`;
      }

      if (diapo.image && !refs.complement) {
        refs.fichierImage = `kpi${idImage}.${extensionImage(diapo.image)}`;
        pieces.set("ppt/media/" + refs.fichierImage, diapo.image);
        idImage++;
      }

      pieces.set(`ppt/slides/slide${n}.xml`, Zip.versOctets(xmlDiapo(i, diapo, refs)));
      pieces.set(`ppt/slides/_rels/slide${n}.xml.rels`, Zip.versOctets(xmlRelsDiapo(refs, diapo)));

      overrides += `<Override PartName="/ppt/slides/slide${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;
      relations += `<Relationship Id="rIdKpi${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${n}.xml"/>`;
      sldIds    += `<p:sldId id="${400 + i}" r:id="rIdKpi${i + 1}"/>`;
    });

    /* Table des matières du paquet */
    const ct = Zip.versTexte(pieces.get("[Content_Types].xml"))
      .replace("</Types>", overrides + overridesComplement + "</Types>");
    pieces.set("[Content_Types].xml", Zip.versOctets(ct));

    /* Relations de la présentation */
    const rels = Zip.versTexte(pieces.get("ppt/_rels/presentation.xml.rels"))
      .replace("</Relationships>", relations + "</Relationships>");
    pieces.set("ppt/_rels/presentation.xml.rels", Zip.versOctets(rels));

    /* Ordre des diapositives */
    const pres = Zip.versTexte(pieces.get("ppt/presentation.xml"))
      .replace("</p:sldIdLst>", sldIds + "</p:sldIdLst>");
    pieces.set("ppt/presentation.xml", Zip.versOctets(pres));

    /* [Content_Types].xml doit rester la première entrée de l'archive */
    const ordonnees = [{ nom: "[Content_Types].xml", donnees: pieces.get("[Content_Types].xml") }];
    pieces.forEach((donnees, nom) => { if (nom !== "[Content_Types].xml") ordonnees.push({ nom, donnees }); });
    return Zip.ecrireZip(ordonnees);
  }

  const API = {
    construireDeck, dimensionsImage, cadrer, esc, extensionImage,
    cheminRapport, nomPage, analyserLien, urlPourComplement, adresseIncorporation,
    COMPLEMENT, PROPRIETES_PAR_DEFAUT, cadreComplement,
    BARRE_COMPLEMENT, HAUTEUR_MINI_COMPLEMENT,
    ZONE, TITRE, COMMENT, LARGEUR_DIAPO, HAUTEUR_DIAPO, POUCE
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.PptxDeck = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
