/**
 * AlternPilot — Seed de données de test (Phase 2).
 *
 * Crée un jeu cohérent et minimal : 1 organisation (TPE), 1 tuteur,
 * 1 référentiel de diplôme + ses compétences, 2 alternants, quelques
 * missions et un bilan hebdo — de quoi faire tourner le Kanban et le bilan.
 *
 * Idempotent : basé sur des `upsert` avec des identifiants stables, il peut
 * être relancé sans créer de doublons.
 *
 * Lancement :
 *   npm run seed          (script package.json)
 *   npx prisma db seed    (via la config `prisma.seed`)
 */
import {
  PrismaClient,
  Role,
  StatutMission,
  Canal,
  StatutAbonnement,
} from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // ── Organisation (la TPE cliente) ─────────────────────────────
  const organisation = await prisma.organisation.upsert({
    where: { id: "seed-org-menuiserie" },
    update: {},
    create: {
      id: "seed-org-menuiserie",
      nom: "Menuiserie Dubois",
      secteur: "Artisanat / Bois",
    },
  });

  // ── Tuteur (maître d'apprentissage) ───────────────────────────
  const tuteur = await prisma.user.upsert({
    where: { email: "tuteur@menuiserie-dubois.fr" },
    update: {},
    create: {
      id: "seed-user-tuteur",
      email: "tuteur@menuiserie-dubois.fr",
      nom: "Camille Dubois",
      role: Role.TUTEUR,
      organisationId: organisation.id,
    },
  });

  // ── Administrateur de l'organisation ──────────────────────────
  await prisma.user.upsert({
    where: { email: "admin@menuiserie-dubois.fr" },
    update: {},
    create: {
      id: "seed-user-admin",
      email: "admin@menuiserie-dubois.fr",
      nom: "Alex Dubois",
      role: Role.ADMIN,
      organisationId: organisation.id,
    },
  });

  // ── Référentiel de diplôme + compétences ──────────────────────
  const referentiel = await prisma.referentiel.upsert({
    where: { id: "seed-ref-tma" },
    update: {},
    create: {
      id: "seed-ref-tma",
      nom: "Bac Pro Technicien Menuisier-Agenceur",
    },
  });

  const competencesData = [
    { id: "seed-comp-preparer", intitule: "Préparer une fabrication" },
    { id: "seed-comp-fabriquer", intitule: "Réaliser un ouvrage en atelier" },
    { id: "seed-comp-poser", intitule: "Poser et installer chez le client" },
    { id: "seed-comp-controler", intitule: "Contrôler la qualité de l'ouvrage" },
  ];

  for (const c of competencesData) {
    await prisma.competence.upsert({
      where: { id: c.id },
      update: {},
      create: { ...c, referentielId: referentiel.id },
    });
  }

  // ── Catalogue de référentiels courants (pré-chargé) ───────────
  // Deux diplômes supplémentaires prêts à l'emploi pour d'autres secteurs.
  const catalogue = [
    {
      id: "seed-ref-gpme",
      nom: "BTS Gestion de la PME",
      competences: [
        { id: "seed-comp-gpme-relation", intitule: "Gérer la relation avec les clients et fournisseurs" },
        { id: "seed-comp-gpme-admin", intitule: "Participer à la gestion des risques de la PME" },
        { id: "seed-comp-gpme-rh", intitule: "Gérer le personnel et contribuer à la GRH" },
        { id: "seed-comp-gpme-pilotage", intitule: "Soutenir le fonctionnement et le développement de la PME" },
      ],
    },
    {
      id: "seed-ref-logistique",
      nom: "Licence Pro Logistique et Transport",
      competences: [
        { id: "seed-comp-log-flux", intitule: "Piloter les flux et les stocks" },
        { id: "seed-comp-log-transport", intitule: "Organiser une opération de transport" },
        { id: "seed-comp-log-entrepot", intitule: "Optimiser l'implantation d'un entrepôt" },
        { id: "seed-comp-log-indicateurs", intitule: "Suivre les indicateurs de performance (KPI)" },
      ],
    },
  ];

  for (const ref of catalogue) {
    await prisma.referentiel.upsert({
      where: { id: ref.id },
      update: {},
      create: { id: ref.id, nom: ref.nom },
    });
    for (const c of ref.competences) {
      await prisma.competence.upsert({
        where: { id: c.id },
        update: {},
        create: { id: c.id, intitule: c.intitule, referentielId: ref.id },
      });
    }
  }

  // ── Alternants ────────────────────────────────────────────────
  // Rythme d'alternance : 2 semaines entreprise / 1 semaine école.
  const rythmeAlternance = [
    { debut: "2026-09-01", fin: "2026-09-14", type: "ENTREPRISE" },
    { debut: "2026-09-15", fin: "2026-09-19", type: "ECOLE" },
    { debut: "2026-09-22", fin: "2026-10-05", type: "ENTREPRISE" },
  ];

  const alternant1 = await prisma.alternant.upsert({
    where: { email: "lea.moreau@exemple.fr" },
    update: {},
    create: {
      id: "seed-alt-1",
      nom: "Léa Moreau",
      email: "lea.moreau@exemple.fr",
      organisationId: organisation.id,
      tuteurId: tuteur.id,
      diplomeId: referentiel.id,
      rythmeAlternance,
    },
  });

  const alternant2 = await prisma.alternant.upsert({
    where: { email: "noah.petit@exemple.fr" },
    update: {},
    create: {
      id: "seed-alt-2",
      nom: "Noah Petit",
      email: "noah.petit@exemple.fr",
      organisationId: organisation.id,
      tuteurId: tuteur.id,
      diplomeId: referentiel.id,
      rythmeAlternance,
    },
  });

  // ── Quelques missions (cartes du Kanban) ──────────────────────
  const missionsData = [
    {
      id: "seed-mission-1",
      titre: "Prendre les cotes d'un dressing sur mesure",
      description:
        "Relever les dimensions chez le client et reporter le plan de fabrication.",
      statut: StatutMission.EN_COURS,
      alternantId: alternant1.id,
      competenceId: "seed-comp-preparer",
      echeance: new Date("2026-07-20T00:00:00.000Z"),
    },
    {
      id: "seed-mission-2",
      titre: "Assembler un caisson de cuisine",
      description: "Découpe, chants et montage à blanc d'un caisson en atelier.",
      statut: StatutMission.A_FAIRE,
      alternantId: alternant1.id,
      competenceId: "seed-comp-fabriquer",
      echeance: new Date("2026-08-15T00:00:00.000Z"),
    },
    {
      id: "seed-mission-3",
      titre: "Poser un plan de travail stratifié",
      description: "Découpe, ajustage et fixation d'un plan de travail chez le client.",
      statut: StatutMission.VALIDE,
      alternantId: alternant2.id,
      competenceId: "seed-comp-poser",
    },
  ];

  for (const m of missionsData) {
    await prisma.mission.upsert({
      where: { id: m.id },
      update: {},
      create: m,
    });
  }

  // ── Un bilan hebdomadaire (un seul par semaine et par alternant) ─
  const semaine = new Date("2026-07-06T00:00:00.000Z"); // lundi
  await prisma.bilanHebdo.upsert({
    where: { alternantId_semaine: { alternantId: alternant1.id, semaine } },
    update: {},
    create: {
      id: "seed-bilan-1",
      alternantId: alternant1.id,
      semaine,
      reussites: "A pris les cotes du dressing en autonomie, sans erreur de report.",
      difficultes: "Encore hésitante sur le réglage de la scie à format.",
      commentaire: "Souhaiterait plus de temps sur la machine la semaine prochaine.",
      valideParTuteur: false,
    },
  });

  // ── Une notification d'exemple ────────────────────────────────
  await prisma.notification.upsert({
    where: { id: "seed-notif-1" },
    update: {},
    create: {
      id: "seed-notif-1",
      userId: tuteur.id,
      canal: Canal.EMAIL,
      contenu: "Léa Moreau a soumis son bilan de la semaine du 6 juillet.",
    },
  });

  // ── Abonnement de l'organisation (essai) ──────────────────────
  await prisma.abonnement.upsert({
    where: { organisationId: organisation.id },
    update: {},
    create: {
      id: "seed-abo-1",
      organisationId: organisation.id,
      nbAlternants: 2,
      statut: StatutAbonnement.TRIAL,
    },
  });

  console.log("✅ Seed terminé :");
  console.log(`   • Organisation : ${organisation.nom}`);
  console.log(`   • Tuteur       : ${tuteur.nom} (${tuteur.email})`);
  console.log(`   • Référentiels : ${referentiel.nom} + ${catalogue.length} au catalogue`);
  console.log(`   • Alternants   : ${alternant1.nom}, ${alternant2.nom}`);
  console.log(`   • Missions     : ${missionsData.length} · Bilans : 1 · Notifications : 1`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("❌ Échec du seed :", e);
    await prisma.$disconnect();
    process.exit(1);
  });
