/* ============================================================
   ARCHIVE ZIP — lecture et écriture, sans dépendance
   ------------------------------------------------------------
   Un fichier .pptx est une archive ZIP. Pour fabriquer un
   PowerPoint depuis le navigateur il faut donc savoir :
     • OUVRIR le modèle livré avec l'application (modele-deck.pptx)
     • RÉÉCRIRE une archive complète avec les diapositives ajoutées

   Volontairement SANS effet de bord et sans DOM : le même fichier
   sert au navigateur, au harnais de test et aux outils Node.

   Choix d'implémentation : à l'écriture on stocke SANS compression
   (méthode 0 « stored »). C'est parfaitement valide, PowerPoint
   l'ouvre sans broncher, et cela évite d'embarquer un compresseur.
   À la lecture on gère les deux méthodes : 0 (stocké) et 8
   (dégonflé), cette dernière via DecompressionStream, présent aussi
   bien dans les navigateurs modernes que dans Node ≥ 18.
   ============================================================ */
(function (root) {
  "use strict";

  /* ─── CRC-32 (obligatoire dans les en-têtes ZIP) ─────────── */

  const TABLE_CRC = (function () {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c;
    }
    return t;
  })();

  /**
   * @param {Uint8Array} octets
   * @returns {number} CRC-32 non signé
   */
  function crc32(octets) {
    let c = -1;
    for (let i = 0; i < octets.length; i++) c = TABLE_CRC[(c ^ octets[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  }

  /* ─── Conversions texte ⇄ octets ─────────────────────────── */

  /* Créés à la demande : le module doit pouvoir se charger même là où
     TextEncoder n'existe pas encore (bacs à sable de vérification). */
  let _enc = null, _dec = null;
  const encodeur = () => (_enc || (_enc = new TextEncoder()));
  const decodeur = () => (_dec || (_dec = new TextDecoder("utf-8")));

  const versOctets = v => (typeof v === "string" ? encodeur().encode(v) : new Uint8Array(v));
  const versTexte  = o => decodeur().decode(o instanceof Uint8Array ? o : new Uint8Array(o));

  /* ─── Lecture ────────────────────────────────────────────── */

  const SIG_FIN_CENTRAL   = 0x06054b50;
  const SIG_ENTREE        = 0x02014b50;
  const SIG_ENTETE_LOCAL  = 0x04034b50;

  /** Position du bloc de fin de répertoire central, cherché depuis la fin. */
  function trouverFinCentral(vue, taille) {
    const minimum = Math.max(0, taille - 66000);   // commentaire ZIP : 64 Ko max
    for (let i = taille - 22; i >= minimum; i--) {
      if (vue.getUint32(i, true) === SIG_FIN_CENTRAL) return i;
    }
    return -1;
  }

  /** Décompresse un bloc « deflate » brut. */
  async function degonfler(octets) {
    if (typeof DecompressionStream === "undefined") {
      throw new Error("Décompression indisponible dans cet environnement");
    }
    const flux = new Blob([octets]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    const morceaux = [];
    const lecteur = flux.getReader();
    for (;;) {
      const { done, value } = await lecteur.read();
      if (done) break;
      morceaux.push(value);
    }
    let total = 0;
    morceaux.forEach(m => { total += m.length; });
    const sortie = new Uint8Array(total);
    let pos = 0;
    morceaux.forEach(m => { sortie.set(m, pos); pos += m.length; });
    return sortie;
  }

  /**
   * Ouvre une archive.
   * @param {Uint8Array|ArrayBuffer} source
   * @returns {Promise<Map<string,Uint8Array>>} nom de pièce → contenu
   */
  async function lireZip(source) {
    const octets = source instanceof Uint8Array ? source : new Uint8Array(source);
    const vue = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
    const fin = trouverFinCentral(vue, octets.length);
    if (fin < 0) throw new Error("Archive illisible : fin de répertoire introuvable");

    const nbEntrees   = vue.getUint16(fin + 10, true);
    const debutCentral = vue.getUint32(fin + 16, true);

    const pieces = new Map();
    let p = debutCentral;
    for (let i = 0; i < nbEntrees; i++) {
      if (vue.getUint32(p, true) !== SIG_ENTREE) throw new Error("Archive corrompue à l'entrée " + i);
      const methode     = vue.getUint16(p + 10, true);
      const tailleComp  = vue.getUint32(p + 20, true);
      const longNom     = vue.getUint16(p + 28, true);
      const longExtra   = vue.getUint16(p + 30, true);
      const longComm    = vue.getUint16(p + 32, true);
      const offsetLocal = vue.getUint32(p + 42, true);
      const nom = versTexte(octets.subarray(p + 46, p + 46 + longNom));

      if (vue.getUint32(offsetLocal, true) !== SIG_ENTETE_LOCAL) {
        throw new Error("En-tête local absent pour « " + nom + " »");
      }
      const longNomL   = vue.getUint16(offsetLocal + 26, true);
      const longExtraL = vue.getUint16(offsetLocal + 28, true);
      const debut = offsetLocal + 30 + longNomL + longExtraL;
      const brut  = octets.subarray(debut, debut + tailleComp);

      // Un dossier est une entrée vide se terminant par « / » : on l'ignore.
      if (!nom.endsWith("/")) {
        pieces.set(nom, methode === 0 ? new Uint8Array(brut) : await degonfler(brut));
      }
      p += 46 + longNom + longExtra + longComm;
    }
    return pieces;
  }

  /* ─── Écriture ───────────────────────────────────────────── */

  /**
   * Fabrique une archive (méthode « stored »).
   * @param {Array<{nom:string, donnees:(Uint8Array|string)}>|Map<string,(Uint8Array|string)>} pieces
   * @returns {Uint8Array}
   */
  function ecrireZip(pieces) {
    const liste = pieces instanceof Map
      ? [...pieces.entries()].map(([nom, donnees]) => ({ nom, donnees }))
      : pieces;

    const preparees = liste.map(p => {
      const donnees = versOctets(p.donnees);
      return { nomOctets: encodeur().encode(p.nom), donnees, crc: crc32(donnees) };
    });

    let tailleLocale = 0, tailleCentrale = 0;
    preparees.forEach(p => {
      tailleLocale   += 30 + p.nomOctets.length + p.donnees.length;
      tailleCentrale += 46 + p.nomOctets.length;
    });

    const sortie = new Uint8Array(tailleLocale + tailleCentrale + 22);
    const vue = new DataView(sortie.buffer);
    let pos = 0;

    preparees.forEach(p => {
      p.offset = pos;
      vue.setUint32(pos, SIG_ENTETE_LOCAL, true);
      vue.setUint16(pos + 4, 20, true);        // version minimale
      vue.setUint16(pos + 6, 0x0800, true);    // noms de pièces en UTF-8
      vue.setUint16(pos + 8, 0, true);         // méthode 0 : stocké
      vue.setUint16(pos + 10, 0, true);        // heure (fixe : archive reproductible)
      vue.setUint16(pos + 12, 0x2181, true);   // date : 2026-12-01
      vue.setUint32(pos + 14, p.crc, true);
      vue.setUint32(pos + 18, p.donnees.length, true);
      vue.setUint32(pos + 22, p.donnees.length, true);
      vue.setUint16(pos + 26, p.nomOctets.length, true);
      vue.setUint16(pos + 28, 0, true);
      pos += 30;
      sortie.set(p.nomOctets, pos); pos += p.nomOctets.length;
      sortie.set(p.donnees, pos);   pos += p.donnees.length;
    });

    const debutCentral = pos;
    preparees.forEach(p => {
      vue.setUint32(pos, SIG_ENTREE, true);
      vue.setUint16(pos + 4, 20, true);
      vue.setUint16(pos + 6, 20, true);
      vue.setUint16(pos + 8, 0x0800, true);
      vue.setUint16(pos + 10, 0, true);
      vue.setUint16(pos + 12, 0, true);
      vue.setUint16(pos + 14, 0x2181, true);
      vue.setUint32(pos + 16, p.crc, true);
      vue.setUint32(pos + 20, p.donnees.length, true);
      vue.setUint32(pos + 24, p.donnees.length, true);
      vue.setUint16(pos + 28, p.nomOctets.length, true);
      vue.setUint16(pos + 30, 0, true);        // extra
      vue.setUint16(pos + 32, 0, true);        // commentaire
      vue.setUint16(pos + 34, 0, true);        // disque
      vue.setUint16(pos + 36, 0, true);        // attributs internes
      vue.setUint32(pos + 38, 0, true);        // attributs externes
      vue.setUint32(pos + 42, p.offset, true);
      pos += 46;
      sortie.set(p.nomOctets, pos); pos += p.nomOctets.length;
    });

    vue.setUint32(pos, SIG_FIN_CENTRAL, true);
    vue.setUint16(pos + 4, 0, true);
    vue.setUint16(pos + 6, 0, true);
    vue.setUint16(pos + 8, preparees.length, true);
    vue.setUint16(pos + 10, preparees.length, true);
    vue.setUint32(pos + 12, pos - debutCentral, true);
    vue.setUint32(pos + 16, debutCentral, true);
    vue.setUint16(pos + 20, 0, true);

    return sortie;
  }

  const API = { crc32, lireZip, ecrireZip, versOctets, versTexte };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.ZipMini = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
