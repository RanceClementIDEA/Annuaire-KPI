/* Comptes et accès : chaque personne se connecte avec son compte, un
   administrateur la rattache au nom qu'elle utilisait déjà — et elle
   retrouve ses favoris, son espace personnel et son historique.
   Ces tests éprouvent le module pur (js/acces.js), les règles Firestore
   livrées, et les VRAIS parcours d'app.js avec des comptes simulés. */
const { test } = require("node:test");
const assert = require("node:assert");
const Acces = require("./js/acces.js");
const { loadApp } = require("./app-harness.js");

const A = loadApp();

async function attendre(tours = 40) {
  for (let i = 0; i < tours; i++) await new Promise(r => setTimeout(r, 0));
}

const CODE = "idea-kpi-2026";
const FICHE_A = { id: "kpi_volume_hebdo", manual: true, title: "Volumétrie", freq: "Hebdomadaire",
                  _mtime: 100, _by: "Marie" };
const PERSO_MARIE = { id: "perso_marie_1", title: "Mon suivi", freq: "Mensuel", _mtime: 90, _by: "Marie" };

/* L'annuaire tel qu'il est aujourd'hui dans le cloud : des noms, pas de comptes. */
function annuaireExistant() {
  return {
    kpiManual: [FICHE_A], kpiDeleted: [], kpiSites: [], kpiPurged: [],
    kpiActivity: [{ at: 1000, by: "Marie", action: "create", title: "Volumétrie", space: "shared" },
                  { at: 900, by: "benjamin", action: "update", title: "Volumétrie", space: "shared" }],
    kpiPresets: [],
    personalByUser: { Marie: [PERSO_MARIE] },
    personalTrashByUser: {},
    favoritesByUser: { Marie: ["kpi_volume_hebdo"], benjamin: [] },
    favoritesMeta: { Marie: 1000, benjamin: 900 },
    updatedAt: 1000
  };
}

/** Un appareil neuf, en mode comptes, avec l'annuaire existant dans le cloud.
    Les envois encore en vol d'un test précédent sont attendus puis oubliés :
    dans tests.html, tous les groupes partagent le même bac à sable. */
async function appareilComptes(etat) {
  await attendre(20);
  A.run(`if (fbUnsub) { fbUnsub(); fbUnsub = null; } couperEcouteEmpreintes();
         connectedSyncCode = null; initialSyncDone = false; syncBusy = false;
         pendingPush = false; pendingRemotePayload = null; localUpdatedAt = 0;
         lastSyncPushAt = 0; lastAppliedSyncAt = 0; clockOffset = 0;`);
  A.reset(Object.assign({ autoriserSync: true }, etat || {}));
  A.firebaseSimule();
  A.comptesSimules();
  A.ecrireCloud("kpi_sync/" + CODE, annuaireExistant());
  A.run("currentUser = null; appShell.style.display = 'none'; loginScreen.style.display = 'flex';" +
        "['compteMail','compteMdp','compteNom','demandeNom','compteNouveauMdp']" +
        ".forEach(function (id) { document.getElementById(id).value = ''; });");
  return A;
}
const visible = id => A.el(id).style.display !== "none";

/* ═══ Module pur ═══ */

test("les noms existants sont repris à l'identique, avec ce qui leur appartient", () => {
  const noms = Acces.nomsExistants({
    favoritesByUser: { Marie: ["a", "b"], "?": ["x"], benjamin: [] },
    favoritesMeta: { Marie: 500 },
    personalByUser: { Marie: [{ id: "p" }], anne: [{ id: "q" }, { id: "r" }] },
    personalTrashByUser: { anne: [{ id: "t" }] },
    activityLog: [{ by: "benjamin", at: 800 }, { by: "benjamin", at: 700 }, { by: "", at: 999 }],
    manualEntries: [{ _by: "anne", _mtime: 300 }]
  });
  assert.deepStrictEqual(noms.map(n => n.nom), ["benjamin", "Marie", "anne"]);
  const marie = noms.find(n => n.nom === "Marie");
  assert.strictEqual(marie.favoris, 2);
  assert.strictEqual(marie.fiches, 1);
  const anne = noms.find(n => n.nom === "anne");
  assert.strictEqual(anne.fiches, 2);
  assert.strictEqual(anne.corbeille, 1);
  assert.strictEqual(noms.find(n => n.nom === "benjamin").actions, 2);
  assert.ok(!noms.some(n => n.nom === "?" || n.nom === ""), "les noms techniques sont ignorés");
});

test("la casse d'un nom n'est jamais corrigée : deux graphies restent deux noms", () => {
  const noms = Acces.nomsExistants({ favoritesByUser: { Marie: [], marie: ["x"] } }).map(n => n.nom);
  assert.deepStrictEqual(noms.sort(), ["Marie", "marie"]);
});

test("la liste de favoris de cet appareil prime sur la carte partagée", () => {
  const noms = Acces.nomsExistants({ favoritesByUser: { Marie: ["a"] },
                                     utilisateurCourant: "Marie", favorisCourants: ["a", "b", "c"] });
  assert.strictEqual(noms[0].favoris, 3);
});

test("le nom proposé pour une demande ne l'est qu'en cas de correspondance unique", () => {
  const noms = ["Marie", "benjamin", "Anne-Sophie", "j.dupont@groupe-idea.com", "Paul", "paul"];
  assert.strictEqual(Acces.proposerNom("Marie", noms), "Marie");
  assert.strictEqual(Acces.proposerNom("  marie ", noms), "Marie", "casse et espaces");
  assert.strictEqual(Acces.proposerNom("anne-sophie", noms), "Anne-Sophie");
  assert.strictEqual(Acces.proposerNom("Benjamin", noms), "benjamin");
  assert.strictEqual(Acces.proposerNom("PAUL", noms), "", "ambigu : l'administrateur choisit");
  assert.strictEqual(Acces.proposerNom("Jean", noms, "J.Dupont@groupe-idea.com"), "j.dupont@groupe-idea.com",
    "l'ancien identifiant était l'adresse");
  assert.strictEqual(Acces.proposerNom("", ["Marie"], "marie.durand@groupe-idea.com"), "Marie", "par le prénom");
  assert.strictEqual(Acces.proposerNom("Zoé", noms), "");
  assert.strictEqual(Acces.proposerNom("", [], ""), "");
});

test("une fiche lue en base est ramenée à une forme sûre", () => {
  const f = Acces.normaliserFiche("u1", { role: "superadmin", nom: "  Marie  ", mail: 42, extra: "x" });
  assert.deepStrictEqual(f, { uid: "u1", role: "", nom: "Marie", mail: "42", demande: "" });
  assert.strictEqual(Acces.normaliserFiche("u2", null).role, "");
  assert.strictEqual(Acces.normaliserFiche("u3", { nom: "x".repeat(200) }).nom.length, 80);
});

test("l'état d'accès distingue demande, attente et ouverture", () => {
  assert.strictEqual(Acces.etatAcces(null), "demande");
  assert.strictEqual(Acces.etatAcces({ role: "", nom: "Marie" }), "attente");
  assert.strictEqual(Acces.etatAcces({ role: "membre", nom: "  " }), "attente", "un rôle sans nom n'ouvre rien");
  assert.strictEqual(Acces.etatAcces({ role: "membre", nom: "Marie" }), "ouvert");
  assert.strictEqual(Acces.etatAcces({ role: "admin", nom: "Clément" }), "ouvert");
});

test("une création de compte est contrôlée avant tout envoi, quelle que soit l'adresse", () => {
  const ok = { nom: "Marie", mail: "marie.durand@groupe-idea.com", motDePasse: "unbonmotdepasse" };
  assert.strictEqual(Acces.verifierDemande(ok), "");
  assert.strictEqual(Acces.verifierDemande({ ...ok, mail: "marie@gmail.com" }), "",
    "adresse personnelle acceptée : c'est la validation qui protège");
  assert.strictEqual(Acces.verifierDemande({ ...ok, mail: "contact@prestataire.fr" }), "");
  assert.match(Acces.verifierDemande({ ...ok, nom: "M" }), /nom/);
  assert.match(Acces.verifierDemande({ ...ok, mail: "pas-une-adresse" }), /invalide/);
  assert.match(Acces.verifierDemande({ ...ok, motDePasse: "court" }), /8 caractères/);
  assert.strictEqual(Acces.domaineAutorise("qui-que-ce-soit@example.org"), true);
});

test("un accès retiré ne rouvre rien et se distingue d'une attente", () => {
  assert.strictEqual(Acces.etatAcces({ role: Acces.ROLE_BLOQUE, nom: "Marie" }), "bloque");
  assert.strictEqual(Acces.estBloque(Acces.ROLE_BLOQUE), true);
  assert.strictEqual(Acces.estRole(Acces.ROLE_BLOQUE), false, "ce n'est pas un rôle qui ouvre");
  assert.strictEqual(Acces.libelleRole(Acces.ROLE_BLOQUE), "Accès retiré");
  assert.strictEqual(Acces.normaliserFiche("u", { role: Acces.ROLE_BLOQUE }).role, Acces.ROLE_BLOQUE,
    "le blocage doit survivre à la relecture de la fiche");
});

test("un changement de nom est contrôlé avant tout déplacement", () => {
  const fiches = [{ uid: "u1", role: "membre", nom: "benjamin" }, { uid: "u2", role: "", nom: "Zoé" }];
  assert.strictEqual(Acces.verifierNom("Marie", "marie", fiches, "u9"), "");
  assert.match(Acces.verifierNom("M", "Marie", fiches, "u9"), /2 caractères/);
  assert.match(Acces.verifierNom("Marie", "Marie", fiches, "u9"), /déjà votre nom/);
  assert.match(Acces.verifierNom("benjamin", "Marie", fiches, "u9"), /déjà rattaché/);
  assert.strictEqual(Acces.verifierNom("benjamin", "Marie", fiches, "u1"), "", "sauf si c'est le sien");
  assert.strictEqual(Acces.verifierNom("Zoé", "Marie", fiches, "u9"), "", "une demande sans rôle ne réserve rien");
});

test("changer de nom emporte favoris et espace personnel, sans rien perdre", () => {
  const cartes = Acces.deplacerNom({
    favoritesByUser: { "marie.d": ["a", "b"], Marie: ["b", "c"] },
    favoritesMeta: { "marie.d": 10, Marie: 20 },
    personalByUser: { "marie.d": [{ id: "p1" }], Marie: [{ id: "p2" }] },
    personalTrashByUser: { "marie.d": [{ id: "t1" }] }
  }, "marie.d", "Marie", 500);
  assert.deepStrictEqual(cartes.favoritesByUser.Marie.sort(), ["a", "b", "c"], "les deux listes fusionnent");
  assert.deepStrictEqual(cartes.favoritesByUser["marie.d"], [], "l'ancien nom est vidé, pas supprimé");
  assert.deepStrictEqual(cartes.personalByUser.Marie.map(x => x.id).sort(), ["p1", "p2"]);
  assert.deepStrictEqual(cartes.personalTrashByUser.Marie.map(x => x.id), ["t1"]);
  assert.strictEqual(cartes.favoritesMeta.Marie, 500, "les deux dates sont rafraîchies");
  assert.strictEqual(cartes.favoritesMeta["marie.d"], 500);
  const inchange = Acces.deplacerNom({ favoritesByUser: { Marie: ["a"] } }, "Marie", "Marie", 1);
  assert.deepStrictEqual(inchange.favoritesByUser, { Marie: ["a"] }, "même nom : rien ne bouge");
});

test("les erreurs Firebase sont traduites, les inconnues restent lisibles", () => {
  assert.match(Acces.messageErreur("auth/invalid-credential"), /incorrect/);
  assert.match(Acces.messageErreur("auth/email-already-in-use"), /Se connecter/);
  assert.match(Acces.messageErreur("permission-denied"), /règles/);
  assert.strictEqual(Acces.messageErreur("auth/nouveau-code"), "Erreur : auth/nouveau-code");
  assert.strictEqual(Acces.libelleRole("membre"), "Membre");
  assert.strictEqual(Acces.libelleRole(""), "En attente");
});

/* ═══ Règles Firestore livrées ═══ */

/* Sous Node, le fichier est lu sur le disque ; dans tests.html, la page l'a
   téléchargé avant de lancer les tests. Lu à la demande, jamais au chargement. */
function reglesLivrees() {
  const g = typeof window !== "undefined" ? window : globalThis;
  const brut = typeof g.__reglesFirestore === "string"
    ? g.__reglesFirestore
    : require("node:fs").readFileSync(require("node:path").join(__dirname, "firestore.rules"), "utf8");
  return brut.replace(/\/\/.*$/gm, "");
}

test("les règles et le module parlent des mêmes rôles et des mêmes domaines", () => {
  const R = reglesLivrees();
  assert.ok(R.length > 200, "firestore.rules introuvable ou vide");
  const roles = ((R.match(/role in \[([^\]]*)\]/) || [])[1] || "").split(",")
    .map(x => x.trim().replace(/'/g, ""));
  assert.deepStrictEqual(roles.sort(), Acces.ROLES_STOCKABLES.slice().sort(),
    "les valeurs de rôle des règles et du module doivent coïncider");
  assert.ok(roles.includes(""), "« en attente » (rôle vide) doit rester possible");
  assert.ok(roles.includes(Acces.ROLE_BLOQUE), "« accès retiré » doit être une valeur possible");
  // Adresses : aucune restriction de domaine, ni dans le module ni dans les règles
  assert.deepStrictEqual(Acces.DOMAINES, [], "toutes les adresses sont acceptées");
  assert.match(R, /function domaineMaison\(\)\s*\{\s*return true;/, "les règles n'imposent aucun domaine");
  assert.ok(R.includes("match /" + Acces.COLLECTION + "/{uid}"));
});

test("les règles ferment tout ce qui n'est pas l'annuaire", () => {
  const R = reglesLivrees();
  assert.ok(R.length > 200, "firestore.rules introuvable ou vide");
  assert.ok(!/if\s+true/.test(R), "aucune ouverture inconditionnelle");
  assert.match(R, /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;/);
  assert.match(R, /match \/kpi_sync\/\{doc\}/);
  // Un compte peut créer SA demande, jamais se donner un rôle
  assert.match(R, /request\.resource\.data\.role == ''/);
  assert.match(R, /affectedKeys\(\)\.hasOnly\(\['role', 'nom'\]\)/);
});

test("les documents de l'annuaire reconnus par les règles sont exactement ceux qu'il utilise", () => {
  const R = reglesLivrees();
  assert.ok(R.length > 200, "firestore.rules introuvable ou vide");
  const re = (R.match(/function documentAnnuaire\(doc\)\s*\{\s*return doc\.matches\('([^']+)'\)/) || [])[1];
  assert.ok(re, "fonction documentAnnuaire introuvable");
  const rx = new RegExp(re);
  ["idea-kpi-2026", "idea-kpi-2026__empreintes", "idea-kpi-2026__clock", "idea-kpi-2026__conntest",
   "idea-kpi-2026__autotest", "idea-kpi-2026__scenario", "idea-kpi-2026__scenario__clock",
   "idea-kpi-2026__masse", "idea-kpi-essai", "idea-kpi-essai__empreintes"]
    .forEach(d => assert.ok(rx.test(d), "refusé à tort : " + d));
  ["autre-code", "idea-kpi-2026x", "idea-kpi-2026__../x", ""].forEach(d => assert.ok(!rx.test(d), "accepté à tort : " + d));
  assert.strictEqual(A.run("BUILTIN_SYNC_CODE"), "idea-kpi-2026", "le code intégré doit rester couvert par les règles");

  const reSuppr = (R.match(/allow delete:\s*if estAdmin\(\) && doc\.matches\('([^']+)'\)/) || [])[1];
  assert.ok(reSuppr, "règle de suppression introuvable");
  const rs = new RegExp(reSuppr);
  ["idea-kpi-2026", "idea-kpi-essai", "idea-kpi-2026__empreintes"].forEach(d =>
    assert.ok(!rs.test(d), "un document réel ne doit jamais être supprimable : " + d));
  ["idea-kpi-2026__autotest", "idea-kpi-2026__scenario", "idea-kpi-2026__masse", "idea-kpi-2026__scenario__clock"]
    .forEach(d => assert.ok(rs.test(d), "document de test non supprimable : " + d));
});

/* ═══ Sans module de comptes : rien ne change ═══ */

test("sans module de comptes, la connexion par nom et la synchro restent celles d'avant", async () => {
  A.reset({ autoriserSync: true });
  A.firebaseSimule();
  assert.strictEqual(A.run("modeComptes()"), false);
  A.run(`login("jean")`);
  await attendre();
  assert.strictEqual(A.run("currentUser"), "jean");
  assert.strictEqual(A.run("appShell.style.display"), "flex");
  assert.ok(A.ecoutesActives() >= 1, "la synchro écoute le cloud comme avant");
});

/* ═══ Mode comptes : l'écran d'entrée ═══ */

test("en mode comptes, la page s'ouvre sur la connexion et l'ancien formulaire disparaît", async () => {
  await appareilComptes();
  assert.strictEqual(A.run("modeComptes()"), true);
  const etat = await A.run("demarrerSession()");
  assert.strictEqual(etat, "connexion");
  assert.ok(visible("porteConnexion"));
  assert.ok(!visible("connexionNom"), "la connexion par simple nom n'est plus proposée");
  assert.ok(!visible("porteAttente") && !visible("porteDemande") && !visible("porteChargement"));
  assert.strictEqual(A.run("appShell.style.display"), "none");
});

test("en mode comptes, la synchro refuse de partir sans compte validé", async () => {
  await appareilComptes();
  A.run("currentUser = 'Marie'; connectSync(true);");
  await attendre();
  assert.strictEqual(A.ecoutesActives(), 0, "aucune écoute du cloud");
  assert.match(A.texte("syncStatus"), /connectez-vous/);
  assert.match(A.dernierMessage(), /Connectez-vous/);
});

test("« créer mon compte » reprend le nom que cet appareil utilisait", async () => {
  await appareilComptes();
  A.ecrireStockage("kpiUser", "Marie");
  assert.strictEqual(A.run("basculerCreation(true)"), true);
  assert.strictEqual(A.el("compteNom").value, "Marie");
  assert.strictEqual(A.texte("compteConnexionTxt"), "Créer mon compte");
  assert.notStrictEqual(A.el("blocNomCompte").style.display, "none");
  assert.strictEqual(A.run("basculerCreation(false)"), false);
  assert.strictEqual(A.texte("compteConnexionTxt"), "Se connecter");
  assert.strictEqual(A.el("blocNomCompte").style.display, "none");
});

test("créer son compte dépose une demande sans rôle, puis fait patienter", async () => {
  await appareilComptes();
  A.run("basculerCreation(true)");
  A.saisir("compteNom", "marie").saisir("compteMail", "Marie.Durand@groupe-idea.com").saisir("compteMdp", "unbonmotdepasse");
  const ok = await A.run("validerPorte()");
  assert.strictEqual(ok, true);
  const uid = A.run("authCompte.currentUser.uid");
  const fiche = A.fiche(uid);
  assert.strictEqual(fiche.role, "", "une demande n'est jamais un droit");
  assert.strictEqual(fiche.nom, "marie");
  assert.strictEqual(fiche.mail, "marie.durand@groupe-idea.com");
  assert.ok(fiche.demande);
  assert.ok(visible("porteAttente"));
  assert.match(A.texte("porteAttenteTexte"), /« marie »/);
  assert.strictEqual(A.run("appShell.style.display"), "none", "l'annuaire reste fermé");
  assert.strictEqual(A.el("compteMdp").value, "", "le mot de passe ne reste pas dans la page");
  assert.strictEqual(A.ecoutesActives(), 0);
});

test("un compte se crée depuis n'importe quelle adresse, et n'ouvre rien pour autant", async () => {
  await appareilComptes();
  A.run("basculerCreation(true)");
  A.saisir("compteNom", "Prestataire").saisir("compteMail", "contact@prestataire.fr").saisir("compteMdp", "unbonmotdepasse");
  assert.strictEqual(await A.run("creationCompte()"), true);
  assert.deepStrictEqual(A.comptesCrees(), ["contact@prestataire.fr"]);
  assert.ok(visible("porteAttente"), "la demande attend quand même une validation");
  assert.strictEqual(A.run("appShell.style.display"), "none");
  // Une adresse mal formée, elle, ne part jamais
  await appareilComptes();
  A.run("basculerCreation(true)");
  A.saisir("compteNom", "Zoé").saisir("compteMail", "pas-une-adresse").saisir("compteMdp", "unbonmotdepasse");
  assert.strictEqual(await A.run("creationCompte()"), false);
  assert.match(A.texte("porteMessage"), /invalide/);
});

test("une adresse déjà inscrite oriente vers la connexion", async () => {
  await appareilComptes();
  A.compteExistant("marie.durand@groupe-idea.com", "unbonmotdepasse");
  A.run("basculerCreation(true)");
  A.saisir("compteNom", "Marie").saisir("compteMail", "marie.durand@groupe-idea.com").saisir("compteMdp", "unautremotdepasse");
  assert.strictEqual(await A.run("creationCompte()"), false);
  assert.match(A.texte("porteMessage"), /Se connecter/);
});

test("un compte créé mais dont la demande échoue peut la renvoyer", async () => {
  await appareilComptes();
  A.run(`const origine = refFiche; refFiche = function (uid) { const r = origine(uid);
         return Object.assign({}, r, { set: async function () { throw Object.assign(new Error("x"), { code: "permission-denied" }); } }); };
         globalThis.__refFicheOrigine = origine;`);
  A.run("basculerCreation(true)");
  A.saisir("compteNom", "Marie").saisir("compteMail", "marie.durand@groupe-idea.com").saisir("compteMdp", "unbonmotdepasse");
  assert.strictEqual(await A.run("creationCompte()"), false);
  assert.ok(visible("porteDemande"));
  assert.match(A.texte("porteMessage"), /n'a pas pu être enregistrée/);
  assert.strictEqual(A.el("demandeNom").value, "Marie", "le nom saisi est conservé");
  A.run("refFiche = globalThis.__refFicheOrigine;");
  assert.strictEqual(await A.run("envoyerDemande()"), true);
  assert.ok(visible("porteAttente"));
});

test("une mauvaise combinaison adresse / mot de passe n'ouvre rien", async () => {
  await appareilComptes();
  A.compteExistant("marie.durand@groupe-idea.com", "unbonmotdepasse", { role: "membre", nom: "Marie" });
  A.saisir("compteMail", "marie.durand@groupe-idea.com").saisir("compteMdp", "mauvais");
  assert.strictEqual(await A.run("connexionCompte()"), false);
  assert.match(A.texte("porteMessage"), /incorrect/);
  assert.strictEqual(A.run("appShell.style.display"), "none");
  A.saisir("compteMail", "").saisir("compteMdp", "");
  assert.strictEqual(await A.run("connexionCompte()"), false);
  assert.match(A.texte("porteMessage"), /Saisissez/);
});

/* ═══ Le point essentiel : les données d'avant reviennent ═══ */

test("un compte rattaché à un nom existant retrouve ses favoris et son espace personnel", async () => {
  await appareilComptes();
  A.compteExistant("marie.durand@groupe-idea.com", "unbonmotdepasse", { role: "membre", nom: "Marie" });
  A.saisir("compteMail", "marie.durand@groupe-idea.com").saisir("compteMdp", "unbonmotdepasse");
  assert.strictEqual(await A.run("connexionCompte()"), true);
  await attendre(80);
  assert.strictEqual(A.run("currentUser"), "Marie", "l'annuaire s'ouvre sous le nom rattaché");
  assert.strictEqual(A.run("appShell.style.display"), "flex");
  assert.deepStrictEqual(A.get("favorites"), ["kpi_volume_hebdo"], "favoris retrouvés");
  const perso = A.get("lireMapPerso(LS_PERSO_MAP)")["Marie"] || [];
  assert.ok(perso.some(p => p.id === "perso_marie_1"), "espace personnel retrouvé");
  // Et rien n'a été perdu pour les autres noms
  const cloud = A.cloud("kpi_sync/" + CODE);
  assert.ok(cloud.favoritesByUser.benjamin, "les données des autres noms restent en place");
  assert.ok(cloud.personalByUser.Marie.some(p => p.id === "perso_marie_1"));
});

test("au rechargement, une session gardée rouvre l'annuaire sans mot de passe", async () => {
  await appareilComptes();
  A.compteExistant("benjamin.martin@groupe-idea.com", "unbonmotdepasse", { role: "membre", nom: "benjamin" });
  A.sessionOuverte("benjamin.martin@groupe-idea.com");
  assert.strictEqual(await A.run("demarrerSession()"), "ouvert");
  await attendre();
  assert.strictEqual(A.run("currentUser"), "benjamin");
  assert.ok(A.ecoutesActives() >= 1, "la synchro démarre avec le compte");
});

test("un compte sans fiche (créé dans la console) propose d'envoyer la demande", async () => {
  await appareilComptes();
  A.ecrireStockage("kpiUser", "anne");
  A.compteExistant("anne.leroy@groupe-idea.com", "unbonmotdepasse");
  A.sessionOuverte("anne.leroy@groupe-idea.com");
  assert.strictEqual(await A.run("demarrerSession()"), "demande");
  assert.ok(visible("porteDemande"));
  assert.strictEqual(A.el("demandeNom").value, "anne", "l'ancien nom de l'appareil est proposé");
  A.saisir("demandeNom", "a");
  assert.strictEqual(await A.run("envoyerDemande()"), false, "un nom trop court est refusé");
  A.saisir("demandeNom", "anne");
  assert.strictEqual(await A.run("envoyerDemande()"), true);
  assert.ok(visible("porteAttente"));
});

test("une fois validé, « actualiser » ouvre l'annuaire sous le bon nom", async () => {
  await appareilComptes();
  const uid = A.compteExistant("anne.leroy@groupe-idea.com", "unbonmotdepasse", { role: "", nom: "Anne", mail: "anne.leroy@groupe-idea.com" });
  A.sessionOuverte("anne.leroy@groupe-idea.com");
  assert.strictEqual(await A.run("demarrerSession()"), "attente");
  assert.strictEqual(await A.run("actualiserAcces()"), "attente");
  assert.match(A.texte("porteMessage"), /Pas encore validé/);
  A.ecrireCloud("acces/" + uid, { role: "membre", nom: "anne", mail: "anne.leroy@groupe-idea.com" });
  assert.strictEqual(await A.run("actualiserAcces()"), "ouvert");
  assert.strictEqual(A.run("currentUser"), "anne");
});

test("une fiche illisible affiche une erreur claire au lieu d'ouvrir quoi que ce soit", async () => {
  await appareilComptes();
  A.compteExistant("marie.durand@groupe-idea.com", "unbonmotdepasse", { role: "membre", nom: "Marie" });
  A.sessionOuverte("marie.durand@groupe-idea.com");
  A.panneCloud("permission-denied");
  assert.strictEqual(await A.run("demarrerSession()"), "erreur");
  assert.ok(visible("porteConnexion"));
  assert.match(A.texte("porteMessage"), /règles/);
  assert.strictEqual(A.run("appShell.style.display"), "none");
  A.panneCloud(null);
});

/* ═══ Panneau de l'administrateur ═══ */

async function adminConnecte() {
  await appareilComptes();
  A.compteExistant("clement.rance@groupe-idea.com", "unbonmotdepasse", { role: "admin", nom: "Clément" });
  A.compteExistant("marie.durand@groupe-idea.com", "unbonmotdepasse",
    { role: "", nom: "marie", mail: "marie.durand@groupe-idea.com", demande: "2026-09-17T08:00:00.000Z" });
  A.compteExistant("pirate@groupe-idea.com", "unbonmotdepasse",
    { role: "", nom: "<img src=x onerror=alert(1)>", mail: "pirate@groupe-idea.com\"><b>" });
  A.sessionOuverte("clement.rance@groupe-idea.com");
  await A.run("demarrerSession()");
  await attendre(80);
  return A;
}
const uidDe = mail => A.run(`globalThis.__comptes[${JSON.stringify(mail)}].uid`);

test("l'administrateur voit le bouton des accès, un membre non", async () => {
  await adminConnecte();
  assert.strictEqual(A.el("accesBtn").style.display, "");
  assert.match(A.texte("compteInfo"), /Administrateur/);
  assert.match(A.texte("compteInfo"), /« Clément »/);
  await appareilComptes();
  A.compteExistant("benjamin.martin@groupe-idea.com", "unbonmotdepasse", { role: "membre", nom: "benjamin" });
  A.sessionOuverte("benjamin.martin@groupe-idea.com");
  await A.run("demarrerSession()");
  assert.strictEqual(A.el("accesBtn").style.display, "none");
  assert.strictEqual(await A.run("ouvrirAcces()"), false, "un membre n'ouvre pas le panneau");
});

test("le panneau liste les demandes et tous les noms existants, avec leurs données", async () => {
  await adminConnecte();
  assert.strictEqual(await A.run("ouvrirAcces()"), true);
  const liste = A.html("accesListe");
  assert.ok(liste.indexOf("marie.durand@groupe-idea.com") < liste.indexOf("clement.rance@groupe-idea.com"),
    "les demandes en attente passent en premier");
  // Le nom proposé est le nom EXISTANT, malgré la casse différente de la demande
  const uidMarie = uidDe("marie.durand@groupe-idea.com");
  assert.match(liste, new RegExp(`id="accesNom_${uidMarie}"[^>]*value="Marie"`),
    "le nom existant est proposé, et reste modifiable à la main");
  assert.match(liste, /list="accesNomsConnus"/);
  assert.match(A.html("accesNomsConnus"), /<option value="benjamin">/, "les noms connus sont suggérés");
  const noms = A.html("accesNoms");
  assert.match(noms, /<b>Marie<\/b>[\s\S]*?1 favori · 1 fiche perso/);
  assert.match(noms, /<b>benjamin<\/b>/);
  assert.match(noms, /à rattacher/);
  assert.match(noms, /<b>Clément<\/b>[\s\S]*?rattaché à clement\.rance@groupe-idea\.com/);
});

test("le panneau échappe tout ce qu'un inconnu a pu saisir", async () => {
  await adminConnecte();
  await A.run("ouvrirAcces()");
  const html = A.html("accesListe");
  assert.ok(!html.includes("<img src=x"), "aucune balise injectée");
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
  assert.ok(!html.includes('"><b>'));
});

test("valider rattache le compte au nom choisi, et la personne retrouve ses données", async () => {
  await adminConnecte();
  await A.run("ouvrirAcces()");
  const uid = uidDe("marie.durand@groupe-idea.com");
  A.selectionner("accesRole_" + uid, "membre");
  A.el("accesNom_" + uid).value = "Marie";
  assert.strictEqual(await A.run(`enregistrerAcces(${JSON.stringify(uid)})`), true);
  assert.deepStrictEqual({ role: A.fiche(uid).role, nom: A.fiche(uid).nom }, { role: "membre", nom: "Marie" });
  assert.match(A.dernierMessage(), /rattaché à « Marie »/);
  assert.match(A.html("accesNoms"), /<b>Marie<\/b>[\s\S]*?rattaché à marie\.durand@groupe-idea\.com/);

  // L'administrateur se déconnecte, Marie se connecte sur le même poste
  A.run("deconnecter()");
  await attendre();
  A.saisir("compteMail", "marie.durand@groupe-idea.com").saisir("compteMdp", "unbonmotdepasse");
  assert.strictEqual(await A.run("connexionCompte()"), true);
  await attendre(80);
  assert.strictEqual(A.run("currentUser"), "Marie");
  assert.deepStrictEqual(A.get("favorites"), ["kpi_volume_hebdo"]);
});

test("un rôle sans nom est refusé, et le dernier administrateur est protégé", async () => {
  await adminConnecte();
  await A.run("ouvrirAcces()");
  const uid = uidDe("marie.durand@groupe-idea.com");
  A.selectionner("accesRole_" + uid, "membre");
  A.el("accesNom_" + uid).value = "   ";
  assert.strictEqual(await A.run(`enregistrerAcces(${JSON.stringify(uid)})`), false);
  assert.strictEqual(A.fiche(uid).role, "");

  const moi = uidDe("clement.rance@groupe-idea.com");
  A.selectionner("accesRole_" + moi, "membre");
  A.el("accesNom_" + moi).value = "Clément";
  assert.strictEqual(await A.run(`enregistrerAcces(${JSON.stringify(moi)})`), false);
  assert.strictEqual(A.fiche(moi).role, "admin");
  assert.match(A.dernierMessage(), /au moins un administrateur/);
  assert.strictEqual(await A.run(`retirerAcces(${JSON.stringify(moi)})`), false, "on ne se retire pas soi-même");
});

test("rattacher deux comptes au même nom demande une confirmation", async () => {
  await adminConnecte();
  await A.run("ouvrirAcces()");
  const uid = uidDe("marie.durand@groupe-idea.com");
  A.selectionner("accesRole_" + uid, "membre");
  A.el("accesNom_" + uid).value = "Clément";
  A.confirmer(false);
  assert.strictEqual(await A.run(`enregistrerAcces(${JSON.stringify(uid)})`), false);
  assert.strictEqual(A.fiche(uid).role, "");
  A.confirmer(true);
  assert.strictEqual(await A.run(`enregistrerAcces(${JSON.stringify(uid)})`), true);
  assert.strictEqual(A.fiche(uid).nom, "Clément");
});

test("remettre en attente puis retirer un accès garde les données du nom", async () => {
  await adminConnecte();
  await A.run("ouvrirAcces()");
  const uid = uidDe("marie.durand@groupe-idea.com");
  A.selectionner("accesRole_" + uid, "");
  A.el("accesNom_" + uid).value = "Marie";
  assert.strictEqual(await A.run(`enregistrerAcces(${JSON.stringify(uid)})`), true);
  assert.match(A.dernierMessage(), /remis en attente/);
  A.confirmer(false);
  assert.strictEqual(await A.run(`retirerAcces(${JSON.stringify(uid)})`), false);
  assert.ok(A.fiche(uid));
  A.confirmer(true);
  assert.strictEqual(await A.run(`retirerAcces(${JSON.stringify(uid)})`), true);
  assert.strictEqual(A.fiche(uid), null);
  assert.ok(A.cloud("kpi_sync/" + CODE).favoritesByUser.Marie, "les favoris du nom restent dans l'annuaire");
  assert.strictEqual(await A.run(`retirerAcces("inconnu")`), false);
});

test("une liste des accès illisible est signalée dans le panneau", async () => {
  await adminConnecte();
  A.run(`const col = fbDb.collection; fbDb.collection = function (n) {
           if (n === "acces") return { get: async function () { throw Object.assign(new Error("x"), { code: "permission-denied" }); } };
           return col.call(fbDb, n); };`);
  assert.strictEqual(await A.run("ouvrirAcces()"), true);
  assert.match(A.html("accesListe"), /n'a pas pu être lue/);
  A.run("fermerAcces()");
  assert.ok(A.el("accesModal").classList.contains("hidden"));
});

/* ═══ Session et mot de passe ═══ */

test("se déconnecter ferme aussi la session du compte", async () => {
  await adminConnecte();
  A.run("deconnecter()");
  await attendre();
  assert.strictEqual(A.run("authCompte.currentUser"), null);
  assert.strictEqual(A.run("compte"), null);
  assert.ok(visible("porteConnexion"));
  assert.strictEqual(A.el("accesBtn").style.display, "none");
});

test("une session perdue pendant l'utilisation referme l'annuaire", async () => {
  await adminConnecte();
  A.sessionPerdue();
  await attendre();
  assert.strictEqual(A.run("appShell.style.display"), "none");
  assert.ok(A.messages().some(m => /session a pris fin/.test(m)));
});

test("« mot de passe oublié » envoie l'e-mail de réinitialisation", async () => {
  await appareilComptes();
  assert.strictEqual(await A.run("motDePasseOublie()"), false);
  assert.match(A.texte("porteMessage"), /adresse/);
  A.saisir("compteMail", "marie.durand@groupe-idea.com");
  assert.strictEqual(await A.run("motDePasseOublie()"), true);
  assert.deepStrictEqual(A.mailsReinitialisation(), ["marie.durand@groupe-idea.com"]);
  A.panneAuth("auth/too-many-requests");
  assert.strictEqual(await A.run("motDePasseOublie()"), false);
  assert.match(A.texte("porteMessage"), /Trop de tentatives/);
  A.panneAuth(null);
});

test("changer son mot de passe : longueur contrôlée, erreurs traduites", async () => {
  await adminConnecte();
  A.saisir("compteNouveauMdp", "court");
  assert.strictEqual(await A.run("changerMotDePasse()"), false);
  A.saisir("compteNouveauMdp", "unnouveaumotdepasse");
  assert.strictEqual(await A.run("changerMotDePasse()"), true);
  assert.strictEqual(A.el("compteNouveauMdp").value, "");
  assert.strictEqual(A.run(`globalThis.__comptes["clement.rance@groupe-idea.com"].mdp`), "unnouveaumotdepasse");
  A.saisir("compteNouveauMdp", "encoreunautre");
  A.panneAuth("auth/requires-recent-login");
  assert.strictEqual(await A.run("changerMotDePasse()"), false);
  assert.match(A.dernierMessage(), /reconnectez-vous/);
  A.panneAuth(null);
});

test("sans session, les actions de compte ne font rien", async () => {
  await appareilComptes();
  assert.strictEqual(await A.run("changerMotDePasse()"), false);
  assert.strictEqual(await A.run("fermerSessionCompte()"), false);
  assert.strictEqual(await A.run("envoyerDemande()"), false);
  assert.ok(visible("porteConnexion"));
  assert.strictEqual(A.run("surveillerSession()"), false);
  assert.strictEqual(A.run("champ('champ-inexistant-' + Date.now())"), "");
});

/* Poste partagé : un collègue vient de modifier SES favoris, se déconnecte,
   puis Marie se connecte. La date récente du poste ne doit pas écraser
   les favoris de Marie (ils sont rangés sous son nom). */
for (const mode of ["comptes", "nom"]) {
  test(`poste partagé (${mode}) : les favoris de chacun survivent au changement de personne`, async () => {
    await attendre(20);
    A.run(`if (fbUnsub) { fbUnsub(); fbUnsub = null; } couperEcouteEmpreintes();
           connectedSyncCode = null; initialSyncDone = false; syncBusy = false;
           pendingPush = false; pendingRemotePayload = null; localUpdatedAt = 0;
           lastSyncPushAt = 0; lastAppliedSyncAt = 0; clockOffset = 0;`);
    A.reset({ autoriserSync: true });
    A.firebaseSimule();
    if (mode === "comptes") A.comptesSimules();
    const c0 = annuaireExistant();
    c0.kpiManual = [FICHE_A, Object.assign({}, FICHE_A, { id: "kpi_autre", title: "Autre" })];
    c0.favoritesByUser = { Marie: ["kpi_volume_hebdo"], "Clément": [] };
    c0.favoritesMeta = { Marie: 1000, "Clément": 1000 };
    A.ecrireCloud("kpi_sync/" + CODE, c0);
    if (mode === "comptes") {
      A.compteExistant("clement.rance@groupe-idea.com", "motdepasse1", { role: "admin", nom: "Clément" });
      A.compteExistant("marie.durand@groupe-idea.com", "motdepasse2", { role: "membre", nom: "Marie" });
      A.sessionOuverte("clement.rance@groupe-idea.com");
      await A.run("demarrerSession()");
    } else {
      A.run(`ensureBuiltinConfig(); login("Clément")`);
    }
    await attendre(80);
    A.run(`toggleFavorite("kpi_autre")`);
    await A.run("pushToCloud(false)");      // l'envoi différé (minuterie neutralisée dans le banc)
    await attendre();
    assert.deepStrictEqual(A.cloud("kpi_sync/" + CODE).favoritesByUser["Clément"], ["kpi_autre"]);

    A.run("deconnecter()");
    await attendre();
    if (mode === "comptes") {
      A.saisir("compteMail", "marie.durand@groupe-idea.com").saisir("compteMdp", "motdepasse2");
      assert.strictEqual(await A.run("connexionCompte()"), true);
    } else {
      A.run(`login("Marie")`);
    }
    await attendre(120);
    await A.run("pushToCloud(false)");      // un envoi de Marie juste après l'ouverture
    await attendre(60);

    const c = A.cloud("kpi_sync/" + CODE);
    assert.strictEqual(A.run("currentUser"), "Marie");
    assert.deepStrictEqual(A.get("favorites"), ["kpi_volume_hebdo"], "Marie retrouve ses favoris");
    assert.deepStrictEqual(c.favoritesByUser.Marie, ["kpi_volume_hebdo"], "ils restent dans le cloud");
    assert.deepStrictEqual(c.favoritesByUser["Clément"], ["kpi_autre"], "ceux du collègue aussi");
  });
}

/* ═══ Mémorisation de l'appareil, changement de nom, accès retiré ═══ */

test("« Mémoriser cet appareil » choisit la durée de la session", async () => {
  await appareilComptes();
  A.compteExistant("marie.durand@groupe-idea.com", "unbonmotdepasse", { role: "membre", nom: "Marie" });
  A.cocher("compteMemoDevice", false);            // poste partagé
  A.saisir("compteMail", "marie.durand@groupe-idea.com").saisir("compteMdp", "unbonmotdepasse");
  assert.strictEqual(await A.run("connexionCompte()"), true);
  assert.strictEqual(A.persistanceChoisie(), "session", "la session meurt avec l'onglet");
  assert.strictEqual(A.stockage()["kpiCompteMemo"], "0", "le choix est retenu");

  A.run("deconnecter()");
  await attendre();
  A.cocher("compteMemoDevice", true);             // son propre appareil
  A.saisir("compteMail", "marie.durand@groupe-idea.com").saisir("compteMdp", "unbonmotdepasse");
  assert.strictEqual(await A.run("connexionCompte()"), true);
  assert.strictEqual(A.persistanceChoisie(), "local", "la session survit à la fermeture du navigateur");
  assert.strictEqual(A.stockage()["kpiCompteMemo"], "1");

  A.ecrireStockage("kpiCompteMemo", "0");
  A.run(`afficherPorte("connexion")`);
  assert.strictEqual(A.el("compteMemoDevice").checked, false, "l'écran réaffiche le dernier choix");
});

test("chacun peut changer son nom : ses favoris et son espace personnel suivent", async () => {
  await appareilComptes();
  const avant = annuaireExistant();               // tout est rangé sous « marie.d »
  avant.favoritesByUser = { "marie.d": ["kpi_volume_hebdo"], benjamin: [] };
  avant.favoritesMeta = { "marie.d": 1000, benjamin: 900 };
  avant.personalByUser = { "marie.d": [PERSO_MARIE] };
  A.ecrireCloud("kpi_sync/" + CODE, avant);
  A.compteExistant("marie.durand@groupe-idea.com", "unbonmotdepasse", { role: "membre", nom: "marie.d" });
  A.sessionOuverte("marie.durand@groupe-idea.com");
  await A.run("demarrerSession()");
  await attendre(80);
  assert.deepStrictEqual(A.get("favorites"), ["kpi_volume_hebdo"]);

  A.saisir("compteNouveauNom", "M");
  assert.strictEqual(await A.run("changerNomAnnuaire()"), false, "un nom trop court est refusé");
  A.saisir("compteNouveauNom", "Marie");
  assert.strictEqual(await A.run("changerNomAnnuaire()"), true);
  await attendre(80);

  assert.strictEqual(A.run("currentUser"), "Marie");
  assert.strictEqual(A.fiche(A.run("compte.uid")).nom, "Marie");
  assert.deepStrictEqual(A.get("favorites"), ["kpi_volume_hebdo"], "les favoris ont suivi");
  assert.ok((A.get("lireMapPerso(LS_PERSO_MAP)")["Marie"] || []).some(p => p.id === "perso_marie_1"),
    "l'espace personnel a suivi");
  const c = A.cloud("kpi_sync/" + CODE);
  assert.deepStrictEqual(c.favoritesByUser["Marie"], ["kpi_volume_hebdo"], "publié pour les autres appareils");
  assert.deepStrictEqual(c.favoritesByUser["benjamin"], [], "personne d'autre n'est touché");
  assert.strictEqual(A.el("compteNouveauNom").value, "");
});

test("l'administrateur retire un accès : la personne est mise dehors et ne peut plus redemander", async () => {
  await adminConnecte();
  const uid = uidDe("marie.durand@groupe-idea.com");
  A.ecrireCloud("acces/" + uid, { role: "membre", nom: "Marie", mail: "marie.durand@groupe-idea.com" });
  await A.run("ouvrirAcces()");
  A.selectionner("accesRole_" + uid, "bloque");
  assert.strictEqual(await A.run(`enregistrerAcces(${JSON.stringify(uid)})`), true);
  assert.strictEqual(A.fiche(uid).role, "bloque");
  assert.match(A.dernierMessage(), /accès retiré/);
  assert.match(A.html("accesListe"), /Accès retiré/);

  await appareilComptes();                        // Marie, sur son appareil
  A.run(`globalThis.__comptes["marie.durand@groupe-idea.com"] = { uid: ${JSON.stringify(uid)}, mail: "marie.durand@groupe-idea.com", mdp: "unbonmotdepasse" };`);
  A.ecrireCloud("acces/" + uid, { role: "bloque", nom: "Marie", mail: "marie.durand@groupe-idea.com" });
  A.sessionOuverte("marie.durand@groupe-idea.com");
  assert.strictEqual(await A.run("demarrerSession()"), "bloque");
  assert.ok(visible("porteBloque"));
  assert.strictEqual(A.run("appShell.style.display"), "none");
  assert.strictEqual(A.ecoutesActives(), 0, "aucun accès au cloud");
  A.saisir("demandeNom", "Marie");
  await A.run("envoyerDemande()");
  assert.strictEqual(A.fiche(uid).role, "bloque", "une nouvelle demande ne lève pas le blocage");
});

test("l'administrateur supprime une fiche : les données du nom restent dans l'annuaire", async () => {
  await adminConnecte();
  const uid = uidDe("pirate@groupe-idea.com");
  await A.run("ouvrirAcces()");
  A.confirmer(true);
  assert.strictEqual(await A.run(`retirerAcces(${JSON.stringify(uid)})`), true);
  assert.strictEqual(A.fiche(uid), null);
  assert.ok(!A.html("accesListe").includes("pirate@groupe-idea.com"));
  assert.ok(A.cloud("kpi_sync/" + CODE).favoritesByUser.Marie, "l'annuaire n'a pas bougé");
});

/* ═══ Outils réservés aux administrateurs ═══ */

test("synchronisation, historique et accès sont réservés aux administrateurs", async () => {
  // Un membre : il ne voit ni la synchro, ni l'historique, ni les accès
  await appareilComptes();
  A.compteExistant("benjamin.martin@groupe-idea.com", "unbonmotdepasse", { role: "membre", nom: "benjamin" });
  A.sessionOuverte("benjamin.martin@groupe-idea.com");
  await A.run("demarrerSession()");
  await attendre(60);
  assert.strictEqual(A.run("peutAdministrer()"), false);
  ["syncSettingsBtn", "historyBtn", "accesBtn"].forEach(id =>
    assert.strictEqual(A.el(id).style.display, "none", id + " doit être masqué"));
  assert.strictEqual(A.el("monCompteBtn").style.display, "", "« Mon compte » reste accessible");

  // Et même en forçant l'ouverture, les fenêtres restent fermées
  assert.strictEqual(A.run("ouvrirSyncModal()"), false);
  assert.ok(A.el("syncModal").classList.contains("hidden"));
  assert.strictEqual(A.run("openHistoryModal()"), false);
  assert.ok(A.el("historyModal").classList.contains("hidden"));
  assert.strictEqual(await A.run("ouvrirAcces()"), false);
  assert.match(A.dernierMessage(), /administrateurs/);

  // Un administrateur : tout est là
  await adminConnecte();
  assert.strictEqual(A.run("peutAdministrer()"), true);
  ["syncSettingsBtn", "historyBtn", "accesBtn", "monCompteBtn"].forEach(id =>
    assert.strictEqual(A.el(id).style.display, "", id + " doit être visible"));
  assert.strictEqual(A.run("ouvrirSyncModal()"), true);
  assert.ok(!A.el("syncModal").classList.contains("hidden"));
  assert.strictEqual(A.run("openHistoryModal()"), true);
  assert.ok(!A.el("historyModal").classList.contains("hidden"));
});

test("un membre garde la main sur son compte : nom, mot de passe et espace personnel", async () => {
  await appareilComptes();
  A.compteExistant("benjamin.martin@groupe-idea.com", "unbonmotdepasse", { role: "membre", nom: "benjamin" });
  A.sessionOuverte("benjamin.martin@groupe-idea.com");
  await A.run("demarrerSession()");
  await attendre(60);

  assert.strictEqual(A.run("ouvrirMonCompte()"), true);
  assert.ok(!A.el("compteModal").classList.contains("hidden"));
  assert.match(A.texte("compteInfo"), /Membre/);
  assert.strictEqual(A.el("personalSyncToggle").checked, true, "l'interrupteur reflète l'état réel");

  A.saisir("compteNouveauMdp", "unnouveaumotdepasse");
  assert.strictEqual(await A.run("changerMotDePasse()"), true);
  A.saisir("compteNouveauNom", "Benjamin");
  assert.strictEqual(await A.run("changerNomAnnuaire()"), true);
  await attendre(60);
  assert.strictEqual(A.run("currentUser"), "Benjamin");

  A.run("fermerMonCompte()");
  assert.ok(A.el("compteModal").classList.contains("hidden"));
});

test("sans module de comptes, aucun outil n'est masqué", async () => {
  await attendre(20);
  A.reset({ autoriserSync: true });
  A.firebaseSimule();                       // pas de comptes : fonctionnement d'origine
  assert.strictEqual(A.run("modeComptes()"), false);
  assert.strictEqual(A.run("peutAdministrer()"), true);
  assert.strictEqual(A.run("ouvrirSyncModal()"), true);
  assert.strictEqual(A.run("openHistoryModal()"), true);
  A.run("syncModal.classList.add('hidden'); closeHistoryModal();");
  assert.strictEqual(A.run("ouvrirMonCompte()"), false, "il n'y a pas de compte à afficher");
});

/* Dernier test : l'annuaire retrouve l'état d'origine du banc (sans module
   de comptes), pour ne pas influencer les groupes qui suivent dans tests.html. */
test("nettoyage : retour au fonctionnement sans comptes", () => {
  A.run(`firebase = undefined; authCompte = null; compte = null; accesListe = null; accesErreur = "";
         modeCreation = false; sessionSurveillee = false; deconnexionVolontaire = false;
         fbApp = null; fbDb = null; fbUnsub = null; connectedSyncCode = null;`);
  A.reset();
  assert.strictEqual(A.run("modeComptes()"), false);
});
