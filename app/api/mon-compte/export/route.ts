import { NextResponse } from "next/server";
import { getAppUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Export RGPD : renvoie les données personnelles de l'utilisateur en JSON. */
export async function GET() {
  const user = await getAppUser();
  if (!user) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const data: Record<string, unknown> = {
    exportLe: new Date().toISOString(),
    compte: { email: user.email, nom: user.nom, role: user.role },
  };

  if (user.role === "ALTERNANT" && user.entityId) {
    data.alternant = await prisma.alternant.findUnique({
      where: { id: user.entityId },
      include: {
        diplome: { select: { nom: true } },
        missions: true,
        bilans: true,
      },
    });
  } else if (
    (user.role === "TUTEUR" || user.role === "ADMIN") &&
    user.entityId
  ) {
    data.utilisateur = await prisma.user.findUnique({
      where: { id: user.entityId },
      include: {
        organisation: true,
        alternantsSuivis: {
          include: { diplome: { select: { nom: true } } },
        },
      },
    });
  }

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="mes-donnees-alternpilot.json"',
    },
  });
}
