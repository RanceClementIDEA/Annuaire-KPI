import { NextResponse } from "next/server";
import { getAppUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseRythme } from "@/lib/rythme";
import { genererICS, type EvenementICS } from "@/lib/ics";

export const dynamic = "force-dynamic";

/** Horodatage iCalendar « AAAAMMJJTHHMMSSZ » de l'instant courant. */
function dtstampNow(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** Nom de fichier sûr (sans accents ni caractères spéciaux). */
function slug(nom: string): string {
  return (
    nom
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "alternant"
  );
}

/**
 * Télécharge le calendrier d'alternance (.ics) : périodes école/entreprise
 * + échéances de missions. Accessible au tuteur/admin de l'organisation ou à
 * l'alternant lui-même.
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const user = await getAppUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const alternant = await prisma.alternant.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      nom: true,
      tuteurId: true,
      organisationId: true,
      rythmeAlternance: true,
      missions: {
        where: { echeance: { not: null } },
        select: { id: true, titre: true, description: true, echeance: true, statut: true },
      },
    },
  });
  if (!alternant) {
    return NextResponse.json({ error: "Alternant introuvable." }, { status: 404 });
  }

  const autorise =
    (user.role === "ALTERNANT" && user.entityId === alternant.id) ||
    (user.role === "TUTEUR" && user.entityId === alternant.tuteurId) ||
    (user.role === "ADMIN" && user.organisationId === alternant.organisationId);
  if (!autorise) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const rythme = parseRythme(alternant.rythmeAlternance);
  const evenements: EvenementICS[] = [];

  rythme.forEach((p, i) => {
    evenements.push({
      uid: `periode-${alternant.id}-${i}-${p.debut}`,
      titre: p.type === "ECOLE" ? "École / CFA" : "Entreprise",
      debut: p.debut,
      fin: p.fin,
      description: `Alternance de ${alternant.nom}`,
    });
  });

  for (const m of alternant.missions) {
    if (!m.echeance) continue;
    const jour = m.echeance.toISOString().slice(0, 10);
    evenements.push({
      uid: `mission-${m.id}`,
      titre: `À rendre : ${m.titre}`,
      debut: jour,
      description: m.description,
    });
  }

  const ics = genererICS(
    `Alternance — ${alternant.nom}`,
    evenements,
    dtstampNow(),
  );

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="alternance-${slug(alternant.nom)}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
