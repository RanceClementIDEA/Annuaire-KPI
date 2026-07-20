import { NextResponse } from "next/server";
import { StatutMission } from "@prisma/client";
import { getAppUser } from "@/lib/auth";
import { getAlternantOwnedByTuteur } from "@/lib/data/alternants";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { suggererMissions } from "@/lib/ia/suggestion-missions";

export async function POST(request: Request) {
  const user = await getAppUser();
  if (!user || user.role !== "TUTEUR" || !user.entityId) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  // Garde-fou anti-abus : 10 générations/minute par utilisateur.
  if (!rateLimit(`ia:sugg:${user.entityId}`, 10, 60_000).allowed) {
    return NextResponse.json(
      { error: "Trop de requêtes. Réessayez dans un instant." },
      { status: 429 },
    );
  }

  let body: { alternantId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }
  if (!body?.alternantId) {
    return NextResponse.json({ error: "alternantId requis." }, { status: 400 });
  }

  const alternant = await getAlternantOwnedByTuteur(body.alternantId, user.entityId);
  if (!alternant) {
    return NextResponse.json({ error: "Alternant introuvable." }, { status: 404 });
  }

  const [competences, missionsValidees, organisation] = await Promise.all([
    prisma.competence.findMany({
      where: { referentielId: alternant.diplomeId },
      orderBy: { intitule: "asc" },
    }),
    prisma.mission.findMany({
      where: { alternantId: alternant.id, statut: StatutMission.VALIDE },
      select: { titre: true },
    }),
    prisma.organisation.findUnique({
      where: { id: alternant.organisationId },
      select: { secteur: true },
    }),
  ]);

  const result = await suggererMissions({
    metier: organisation?.secteur ?? null,
    diplome: alternant.diplome.nom,
    competences: competences.map((c) => ({ id: c.id, intitule: c.intitule })),
    missionsValidees: missionsValidees.map((m) => m.titre),
  });

  return NextResponse.json(result);
}
