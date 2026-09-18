/* ============================================================
   COMPTES ET ACCÈS — logique pure
   ------------------------------------------------------------
   Chaque personne se connecte avec SON compte (adresse pro +
   mot de passe). Un administrateur valide le compte et le
   RATTACHE au nom que cette personne utilisait déjà dans
   l'annuaire : favoris, espace personnel et historique sont
   rangés sous ce nom, ils sont donc retrouvés tels quels.

   Ce fichier ne touche ni à la page ni au réseau : il décide,
   app.js agit. Chargé en <script> classique : expose l'objet
   global Acces (et module.exports sous Node).
   ============================================================ */
(function (root) {
  "use strict";

  /** Les rôles. La même liste figure dans firestore.rules. */
  const ROLES = Object.freeze({
    admin:  Object.freeze({ libelle: "Administrateur",
                            detail: "valide les comptes, gère les accès et modifie l'annuaire" }),
    membre: Object.freeze({ libelle: "Membre",
                            detail: "consulte et modifie l'annuaire" })
  });

  /** Collection Firestore des fiches d'accès (une par compte). */
  const COLLECTION = "acces";

  /* Domaines autorisés à DÉPOSER une demande. Même liste que la
     fonction domaineMaison() de firestore.rules : modifier les deux.
     Ce n'est qu'un filtre — Firebase ne vérifie pas qu'une adresse
     existe : le vrai verrou reste la validation par un administrateur. */
  const DOMAINES = Object.freeze(["groupe-idea.com"]);

  const LONGUEUR_MDP = 8;
  /* Noms qui ne désignent personne : « ? » pour un auteur inconnu, et les
     valeurs qu'une synchronisation interrompue a pu laisser derrière elle. */
  const NOMS_TECHNIQUES = new Set(["", "?", "null", "undefined"]);

  const estRole = r => typeof r === "string" && Object.prototype.hasOwnProperty.call(ROLES, r);
  const libelleRole = r => (estRole(r) ? ROLES[r].libelle : "En attente");

  /** Nom tel que la connexion historique l'enregistrait : espaces retirés. */
  function nettoyerNom(n) {
    return String(n == null ? "" : n).trim().slice(0, 80);
  }

  /** Comparaison tolérante : casse et accents ignorés. */
  function forme(s) {
    return String(s == null ? "" : s).trim().toLocaleLowerCase("fr")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  /**
   * Les noms déjà présents dans l'annuaire, avec ce qui leur appartient.
   * La clé est conservée À L'IDENTIQUE (casse comprise) : c'est elle qui
   * range les données. Aucun nom n'est inventé, aucun n'est fusionné.
   *
   * @param {object} etat  { favoritesByUser, favoritesMeta, personalByUser,
   *                         personalTrashByUser, activityLog, manualEntries,
   *                         utilisateurCourant, favorisCourants }
   * @returns {Array<{nom, favoris, fiches, corbeille, actions, derniere}>}
   */
  function nomsExistants(etat) {
    const e = etat || {};
    const table = new Map();
    const ligne = nom => {
      if (typeof nom !== "string" || NOMS_TECHNIQUES.has(nom.trim())) return null;
      if (!table.has(nom)) {
        table.set(nom, { nom, favoris: 0, fiches: 0, corbeille: 0, actions: 0, derniere: 0 });
      }
      return table.get(nom);
    };
    const date = v => (Number.isFinite(+v) ? +v : 0);

    const carte = (m, champ) => {
      if (!m || typeof m !== "object") return;
      Object.keys(m).forEach(nom => {
        const l = ligne(nom);
        if (l && Array.isArray(m[nom])) l[champ] = Math.max(l[champ], m[nom].length);
      });
    };
    carte(e.favoritesByUser, "favoris");
    carte(e.personalByUser, "fiches");
    carte(e.personalTrashByUser, "corbeille");

    // La liste de l'utilisateur de cet appareil est plus fraîche que la carte
    if (typeof e.utilisateurCourant === "string" && Array.isArray(e.favorisCourants)) {
      const l = ligne(e.utilisateurCourant);
      if (l) l.favoris = e.favorisCourants.length;
    }

    if (e.favoritesMeta && typeof e.favoritesMeta === "object") {
      Object.keys(e.favoritesMeta).forEach(nom => {
        const l = ligne(nom);
        if (l) l.derniere = Math.max(l.derniere, date(e.favoritesMeta[nom]));
      });
    }
    (Array.isArray(e.activityLog) ? e.activityLog : []).forEach(a => {
      const l = a ? ligne(a.by) : null;
      if (l) { l.actions++; l.derniere = Math.max(l.derniere, date(a.at)); }
    });
    (Array.isArray(e.manualEntries) ? e.manualEntries : []).forEach(k => {
      const l = k ? ligne(k._by) : null;
      if (l) l.derniere = Math.max(l.derniere, date(k._mtime));
    });

    return [...table.values()].sort((a, b) =>
      (b.derniere - a.derniere) || a.nom.localeCompare(b.nom, "fr"));
  }

  /**
   * Le nom existant le plus probable pour une demande d'accès. Ne propose
   * qu'en cas de correspondance UNIQUE : sinon l'administrateur choisit.
   */
  function proposerNom(demande, existants, mail) {
    const noms = (Array.isArray(existants) ? existants : [])
      .map(x => (typeof x === "string" ? x : x && x.nom))
      .filter(n => typeof n === "string" && n);
    const d = nettoyerNom(demande);
    const unique = liste => (liste.length === 1 ? liste[0] : "");

    if (d && noms.includes(d)) return d;
    if (d) {
      const r = unique(noms.filter(n => forme(n) === forme(d)));
      if (r) return r;
    }
    const m = String(mail == null ? "" : mail).trim().toLowerCase();
    if (m) {
      // L'ancien identifiant pouvait être l'adresse elle-même
      const parAdresse = unique(noms.filter(n => n.trim().toLowerCase() === m));
      if (parAdresse) return parAdresse;
      const local = m.split("@")[0];
      const prenom = local.split(/[._-]/)[0];
      const parLocal = unique(noms.filter(n => forme(n) === forme(local)));
      if (parLocal) return parLocal;
      if (prenom && prenom !== local) {
        const parPrenom = unique(noms.filter(n => forme(n) === forme(prenom)));
        if (parPrenom) return parPrenom;
      }
    }
    return "";
  }

  /** Une fiche lue en base, ramenée à une forme sûre. */
  function normaliserFiche(uid, f) {
    const o = (f && typeof f === "object") ? f : {};
    return {
      uid: String(uid == null ? "" : uid),
      role: estRole(o.role) ? o.role : "",
      nom: nettoyerNom(o.nom),
      mail: String(o.mail == null ? "" : o.mail).slice(0, 120),
      demande: String(o.demande == null ? "" : o.demande).slice(0, 40)
    };
  }

  /**
   * Où en est une personne connectée :
   *   "demande"  aucune fiche : la demande reste à déposer
   *   "attente"  fiche sans rôle (ou sans nom) : un administrateur doit valider
   *   "ouvert"   rôle et nom : l'annuaire s'ouvre sous ce nom
   */
  function etatAcces(fiche) {
    if (!fiche) return "demande";
    return (estRole(fiche.role) && nettoyerNom(fiche.nom)) ? "ouvert" : "attente";
  }

  const MAIL_VALIDE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function domaineAutorise(mail) {
    const d = String(mail == null ? "" : mail).trim().toLowerCase().split("@")[1] || "";
    return DOMAINES.includes(d);
  }

  /** Contrôles d'une création de compte, avec les mêmes limites que les règles. */
  function verifierDemande(d) {
    const o = d || {};
    const nom = nettoyerNom(o.nom);
    const mail = String(o.mail == null ? "" : o.mail).trim();
    if (nom.length < 2) return "Indiquez votre nom tel que vous le saisissiez jusqu'ici.";
    if (!MAIL_VALIDE.test(mail)) return "Adresse e-mail invalide.";
    if (!domaineAutorise(mail)) {
      return "Utilisez votre adresse professionnelle (" + DOMAINES.map(x => "@" + x).join(", ") + ").";
    }
    if (String(o.motDePasse == null ? "" : o.motDePasse).length < LONGUEUR_MDP) {
      return "Le mot de passe doit faire au moins " + LONGUEUR_MDP + " caractères.";
    }
    return "";
  }

  /** Messages d'erreur Firebase, en français. */
  function messageErreur(code) {
    const c = String(code == null ? "" : code);
    const m = {
      "auth/invalid-credential": "Adresse ou mot de passe incorrect.",
      "auth/invalid-login-credentials": "Adresse ou mot de passe incorrect.",
      "auth/wrong-password": "Adresse ou mot de passe incorrect.",
      "auth/user-not-found": "Adresse ou mot de passe incorrect.",
      "auth/invalid-email": "Adresse e-mail invalide.",
      "auth/email-already-in-use": "Un compte existe déjà pour cette adresse : utilisez « Se connecter ».",
      "auth/weak-password": "Mot de passe trop simple.",
      "auth/password-does-not-meet-requirements": "Mot de passe trop simple pour la politique du projet.",
      "auth/too-many-requests": "Trop de tentatives : réessayez dans quelques minutes.",
      "auth/network-request-failed": "Pas de connexion au service de comptes (réseau).",
      "auth/user-disabled": "Ce compte a été désactivé par un administrateur.",
      "auth/operation-not-allowed": "La connexion par adresse et mot de passe n'est pas activée dans la console Firebase.",
      "auth/admin-restricted-operation": "La création de comptes est fermée : demandez à un administrateur.",
      "auth/requires-recent-login": "Par sécurité, déconnectez-vous, reconnectez-vous, puis recommencez.",
      "auth/missing-email": "Saisissez votre adresse.",
      "permission-denied": "Accès refusé par les règles de la base.",
      "unavailable": "Base injoignable pour le moment (réseau)."
    };
    return m[c] || ("Erreur : " + (c || "inconnue"));
  }

  const API = {
    ROLES, COLLECTION, DOMAINES, LONGUEUR_MDP,
    estRole, libelleRole, nettoyerNom, nomsExistants, proposerNom,
    normaliserFiche, etatAcces, domaineAutorise, verifierDemande, messageErreur
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.Acces = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
