import { Canal } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { construireEmailAlerte, envoyerEmail, type EmailResult } from "./email";

/**
 * Crée une notification en base et, si le canal est EMAIL, tente l'envoi via
 * Resend (best-effort : un échec d'envoi ne remet pas en cause la notification).
 */
export async function creerNotification(params: {
  userId: string;
  contenu: string;
  canal?: Canal;
}): Promise<{ id: string; email: EmailResult }> {
  const canal = params.canal ?? Canal.EMAIL;

  const notif = await prisma.notification.create({
    data: { userId: params.userId, canal, contenu: params.contenu },
  });

  let email: EmailResult = { sent: false, skipped: true };
  if (canal === Canal.EMAIL) {
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: { email: true },
    });
    if (user?.email) {
      const { subject, text, html } = construireEmailAlerte(params.contenu);
      email = await envoyerEmail({ to: user.email, subject, text, html });
    }
  }

  return { id: notif.id, email };
}
