import { Resend } from "resend";
import { construireEmailAlerte } from "./format";

export { construireEmailAlerte };

export interface EmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailResult {
  /** e-mail effectivement remis à Resend. */
  sent: boolean;
  /** aucune tentative (pas de clé API configurée). */
  skipped: boolean;
  error?: string;
}

const FROM = process.env.EMAIL_FROM ?? "AlternPilot <onboarding@resend.dev>";

/**
 * Envoie un e-mail via Resend. En l'absence de RESEND_API_KEY, ne fait rien
 * (skipped) : les notifications restent créées en base, l'envoi est simplement
 * désactivé — cohérent avec le principe « ne jamais bloquer l'utilisateur ».
 */
export async function envoyerEmail(input: EmailInput): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, skipped: true };

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: FROM,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html ?? input.text,
    });
    if (error) {
      return { sent: false, skipped: false, error: error.message };
    }
    return { sent: true, skipped: false };
  } catch (e) {
    return {
      sent: false,
      skipped: false,
      error: e instanceof Error ? e.message : "Erreur d'envoi inconnue",
    };
  }
}
