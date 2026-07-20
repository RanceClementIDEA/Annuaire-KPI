import { NextResponse } from "next/server";
import { StatutMission } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dateLimite, estEnRetard, messageAlerte } from "@/lib/alertes";
import { creerNotification } from "@/lib/notifications/notifier";
import { envoyerSMS, smsConfigure } from "@/lib/notifications/sms";

export const dynamic = "force-dynamic";

/**
 * Autorisation : Vercel Cron envoie `Authorization: Bearer $CRON_SECRET`.
 * En l'absence de secret configuré (dev local), on laisse passer.
 */
function autorise(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * Job planifié : vérifie les échéances de missions non validées et crée une
 * notification (canal EMAIL) au tuteur pour celles proches ou dépassées.
 * L'envoi effectif des e-mails viendra en Phase 7 (Resend).
 */
export async function GET(request: Request) {
  if (!autorise(request)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const maintenant = new Date();
  const todayIso = maintenant.toISOString().slice(0, 10);
  const limite = dateLimite(maintenant);

  const missions = await prisma.mission.findMany({
    where: {
      echeance: { lte: limite }, // exclut les missions sans échéance
      statut: { in: [StatutMission.A_FAIRE, StatutMission.EN_COURS] },
    },
    include: { alternant: { select: { nom: true, tuteurId: true } } },
  });

  let creees = 0;
  let emailsEnvoyes = 0;
  let smsEnvoyes = 0;
  for (const m of missions) {
    if (!m.echeance) continue;
    const echeanceIso = m.echeance.toISOString().slice(0, 10);
    const enRetard = estEnRetard(echeanceIso, todayIso);
    const contenu = messageAlerte(m.titre, m.alternant.nom, echeanceIso, enRetard);

    // Déduplication : ne pas recréer une alerte identique pour ce tuteur.
    const existe = await prisma.notification.findFirst({
      where: { userId: m.alternant.tuteurId, contenu },
      select: { id: true },
    });
    if (existe) continue;

    // Crée la notification + envoie l'e-mail (Resend) si configuré.
    const { email } = await creerNotification({
      userId: m.alternant.tuteurId,
      contenu,
    });
    creees += 1;
    if (email.sent) emailsEnvoyes += 1;

    // Alerte critique (échéance dépassée) : double notification par SMS.
    if (enRetard && smsConfigure()) {
      const tuteur = await prisma.user.findUnique({
        where: { id: m.alternant.tuteurId },
        select: { telephone: true },
      });
      if (tuteur?.telephone) {
        const sms = await envoyerSMS(tuteur.telephone, contenu);
        if (sms.sent) smsEnvoyes += 1;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    verifiees: missions.length,
    creees,
    emailsEnvoyes,
    smsEnvoyes,
  });
}
