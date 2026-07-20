import { NextResponse } from "next/server";
import { getAppUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { resumerBilan } from "@/lib/ia/resume-bilan";

export async function POST(request: Request) {
  const user = await getAppUser();
  if (!user || !user.entityId) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  // Garde-fou anti-abus : 10 résumés/minute par utilisateur.
  if (!rateLimit(`ia:resume:${user.entityId}`, 10, 60_000).allowed) {
    return NextResponse.json(
      { error: "Trop de requêtes. Réessayez dans un instant." },
      { status: 429 },
    );
  }

  let body: { bilanId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }
  if (!body?.bilanId) {
    return NextResponse.json({ error: "bilanId requis." }, { status: 400 });
  }

  const bilan = await prisma.bilanHebdo.findUnique({
    where: { id: body.bilanId },
    include: { alternant: { select: { id: true, tuteurId: true } } },
  });
  if (!bilan) {
    return NextResponse.json({ error: "Bilan introuvable." }, { status: 404 });
  }

  // L'alternant (son propre bilan) ou son tuteur peuvent générer le résumé.
  const autorise =
    (user.role === "ALTERNANT" && user.entityId === bilan.alternant.id) ||
    (user.role === "TUTEUR" && user.entityId === bilan.alternant.tuteurId);
  if (!autorise) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const result = await resumerBilan({
    reussites: bilan.reussites,
    difficultes: bilan.difficultes,
    commentaire: bilan.commentaire,
  });

  await prisma.bilanHebdo.update({
    where: { id: bilan.id },
    data: { resumeIA: result.resume },
  });

  return NextResponse.json(result);
}
