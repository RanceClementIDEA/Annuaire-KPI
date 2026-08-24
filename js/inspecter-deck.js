/* ============================================================
   INSPECTION D'UN SUPPORT PRODUIT — logique pure
   ------------------------------------------------------------
   Ouvre un .pptx déjà fabriqué et dit, diapositive par
   diapositive, ce qu'il affichera : quel visuel, de quelle page,
   de quel rapport, dans quel format, et ce qui cloche.

   Sans DOM ni système de fichiers : le même code sert à la
   commande `outils/verifier-deck.js` et au testeur en page web.
   ============================================================ */
(function (root) {
  "use strict";

  const enModule = typeof module !== "undefined" && module.exports;
  const Zip  = enModule ? require("./zip.js")  : root.ZipMini;
  const Pptx = enModule ? require("./pptx.js") : root.PptxDeck;

  const EMU_PAR_POUCE = 914400;
  
  /** Valeur d'une propriété du complément, désencodée. */
  function propriete(xml, nom) {
    const m = xml.match(new RegExp('name="' + nom + '" value="([^"]*)"'));
    if (!m) return "";
    return m[1].replace(/&quot;/g, "").replace(/&amp;/g, "&")
               .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&apos;/g, "'");
  }
  
  /** Titre porté par l'espace réservé de la diapositive. */
  function titreDiapo(xml) {
    const bloc = xml.split("</p:sp>")[0];
    const m = bloc.match(/<a:t>([^<]*)<\/a:t>/);
    return m ? m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">") : "";
  }
  
  /** Analyse complète du fichier : testable sans affichage. */
  async function analyserDeck(octets) {
    const pieces = await Zip.lireZip(octets);
    const numeros = [...pieces.keys()]
      .map(n => (n.match(/^ppt\/slides\/slide(\d+)\.xml$/) || [])[1])
      .filter(Boolean).map(Number).sort((a, b) => a - b);
  
    const diapos = numeros.map(n => {
      const xml = Zip.versTexte(pieces.get(`ppt/slides/slide${n}.xml`));
      const rels = pieces.has(`ppt/slides/_rels/slide${n}.xml.rels`)
        ? Zip.versTexte(pieces.get(`ppt/slides/_rels/slide${n}.xml.rels`)) : "";
  
      const d = { numero: n, titre: titreDiapo(xml), contenu: "autre",
                  lien: "", visuel: "", rapport: "", page: "", signet: "",
                  format: "", cadre: "", alertes: [] };
  
      // Toute diapositive produite par le générateur porte sa ligne
      // « Commentaires : ». Les autres viennent du modèle : c'est la couverture.
      if (!/name="Commentaires"/.test(xml)) { d.contenu = "couverture"; return d; }
  
      const hyper = rels.match(/Type="[^"]*\/hyperlink" Target="([^"]*)"/);
      if (hyper) d.lien = hyper[1].replace(/&amp;/g, "&");
  
      if (/webextensionref/.test(xml)) {
        d.contenu = "visuel vivant";
        const cible = rels.match(/webextension" Target="\.\.\/webextensions\/([^"]+)"/);
        const we = cible && pieces.has("ppt/webextensions/" + cible[1])
          ? Zip.versTexte(pieces.get("ppt/webextensions/" + cible[1])) : "";
        if (!we) { d.alertes.push("pièce de complément introuvable"); return d; }
  
        const url = propriete(we, "reportUrl");
        d.lien = url || d.lien;
        const info = Pptx.analyserLien(url);
        d.visuel = info.visualName;
        d.rapport = info.reportId;
        d.page = info.pageName;
        d.signet = info.bookmark;
        // L'adresse doit rester celle du lien de partage, sans ajout :
        // le complément échoue dès qu'on y glisse des paramètres d'export.
        if (/[?&](bookmarkUsage|fromEntryPoint)=/.test(url)) {
          d.alertes.push("adresse enrichie de paramètres d'export — le complément retombera sur la première page");
        }
        if (info.largeur) d.format = Math.round(info.largeur) + "×" + Math.round(info.hauteur) + " px";
  
        if (info.type !== "visuel") d.alertes.push("désigne une PAGE, pas un visuel");
        if (info.aplati) d.alertes.push("visuel au format très allongé : à confirmer en l’ouvrant");
        if (propriete(we, "reportState") !== "CONNECTED") d.alertes.push("visuel non connecté");
        if (!propriete(we, "embedUrl")) d.alertes.push("adresse d'incorporation absente");
        if (!/<mc:Fallback>/.test(xml)) d.alertes.push("aucun repli si le complément est bloqué");
      } else if (/<p:pic>/.test(xml)) {
        d.contenu = "image";
        const img = rels.match(/Type="[^"]*\/image" Target="\.\.\/media\/([^"]+)"/);
        if (img) {
          const octetsImage = pieces.get("ppt/media/" + img[1]);
          const dim = Pptx.dimensionsImage(octetsImage);
          d.format = dim.l + "×" + dim.h + " px";
        }
      } else {
        d.contenu = "cadre d'attente";
        d.alertes.push("aucun visuel : le cadre renvoie seulement vers Power BI");
      }
  
      const cadre = xml.match(/<p:xfrm><a:off[^>]*\/><a:ext cx="(\d+)" cy="(\d+)"\/><\/p:xfrm>/)
                 || xml.match(/<a:off x="\d+" y="\d+"\/><a:ext cx="(\d+)" cy="(\d+)"\/>[\s\S]{0,80}prstGeom/);
      if (cadre) {
        d.cadre = (Number(cadre[1]) / EMU_PAR_POUCE).toFixed(1) + " × "
                + (Number(cadre[2]) / EMU_PAR_POUCE).toFixed(1) + " pouces";
      }
      return d;
    });
  
    // Deux diapositives visant le même visuel DANS LE MÊME ÉTAT afficheront
    // rigoureusement la même chose : presque toujours un lien recopié.
    const vus = new Map();
    diapos.forEach(d => {
      if (!d.visuel) return;
      const cle = d.visuel + "|" + (d.signet || "");
      if (vus.has(cle)) d.alertes.push("identique à la diapositive " + vus.get(cle) + " (même visuel, même signet)");
      else vus.set(cle, d.numero);
    });

    return { diapos, alertes: diapos.reduce((n, d) => n + d.alertes.length, 0) };
  }

  const API = { analyserDeck, propriete, titreDiapo, EMU_PAR_POUCE };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.InspecteurDeck = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
