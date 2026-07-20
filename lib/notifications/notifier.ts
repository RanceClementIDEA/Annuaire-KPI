import { Canal } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { construireEmailAlerte, envoyerEmail, type EmailResult } from "./email";
import { envoyerSMS, envoyerWhatsApp, type SmsResult } from "./sms";

/**
 * Crée une notification en base et tente sa remise sur le canal choisi
 * (EMAIL via Resend, SMS/WhatsApp via Twilio). Best-effort : un échec d'envoi
 * ne remet jamais en cause la création de la notification.
 */
export async function creerNotification(params: {
  userId: string;
  contenu: string;
  canal?: Canal;
}): Promise<{ id: string; email: EmailResult; sms: SmsResult }> {
  const canal = params.canal ?? Canal.EMAIL;

  const notif = await prisma.notification.create({
    data: { userId: params.userId, canal, contenu: params.contenu },
  });

  let email: EmailResult = { sent: false, skipped: true };
  let sms: SmsResult = { sent: false, skipped: true };

  if (canal === Canal.EMAIL) {
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: { email: true },
    });
    if (user?.email) {
      const { subject, text, html } = construireEmailAlerte(params.contenu);
      email = await envoyerEmail({ to: user.email, subject, text, html });
    }
  } else if (canal === Canal.SMS || canal === Canal.WHATSAPP) {
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: { telephone: true },
    });
    if (user?.telephone) {
      sms =
        canal === Canal.SMS
          ? await envoyerSMS(user.telephone, params.contenu)
          : await envoyerWhatsApp(user.telephone, params.contenu);
    }
  }

  return { id: notif.id, email, sms };
}
