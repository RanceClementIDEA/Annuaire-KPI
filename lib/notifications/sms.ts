/**
 * Envoi de SMS / WhatsApp via l'API REST Twilio.
 *
 * Aucune dépendance npm : appel direct à l'API (auth Basic). Sans identifiants
 * Twilio configurés, les fonctions ne font rien (skipped) — cohérent avec le
 * principe « ne jamais bloquer l'utilisateur ». Réservé au serveur.
 */

export interface SmsResult {
  /** Message effectivement remis à Twilio. */
  sent: boolean;
  /** Aucune tentative (identifiants ou numéro manquants). */
  skipped: boolean;
  error?: string;
}

function creds(): { sid: string; token: string } | null {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  return sid && token ? { sid, token } : null;
}

/** Les SMS sont-ils configurés (identifiants + numéro expéditeur) ? */
export function smsConfigure(): boolean {
  return Boolean(creds() && process.env.TWILIO_SMS_FROM);
}

/** WhatsApp est-il configuré (identifiants + expéditeur WhatsApp) ? */
export function whatsappConfigure(): boolean {
  return Boolean(creds() && process.env.TWILIO_WHATSAPP_FROM);
}

async function envoyer(to: string, from: string, body: string): Promise<SmsResult> {
  const c = creds();
  if (!c || !from || !to) return { sent: false, skipped: true };

  try {
    const auth = Buffer.from(`${c.sid}:${c.token}`).toString("base64");
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${c.sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
      },
    );
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return {
        sent: false,
        skipped: false,
        error: `Twilio ${res.status}: ${txt.slice(0, 200)}`,
      };
    }
    return { sent: true, skipped: false };
  } catch (e) {
    return {
      sent: false,
      skipped: false,
      error: e instanceof Error ? e.message : "Erreur d'envoi SMS inconnue",
    };
  }
}

/** Envoie un SMS (best-effort). */
export function envoyerSMS(to: string, body: string): Promise<SmsResult> {
  return envoyer(to, process.env.TWILIO_SMS_FROM ?? "", body);
}

/** Envoie un message WhatsApp (best-effort). */
export function envoyerWhatsApp(to: string, body: string): Promise<SmsResult> {
  const dest = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
  return envoyer(dest, process.env.TWILIO_WHATSAPP_FROM ?? "", body);
}
