/** Construction (pure) du contenu des e-mails d'alerte. */

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c] as string,
  );
}

export interface EmailContenu {
  subject: string;
  text: string;
  html: string;
}

const SIGNATURE = "— AlternPilot, le copilote du maître d'apprentissage.";

/** Gabarit d'e-mail à partir du contenu d'une notification. */
export function construireEmailAlerte(contenu: string): EmailContenu {
  const subject = "AlternPilot — Alerte d'échéance";
  const text = `${contenu}\n\n${SIGNATURE}`;
  const html =
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;` +
    `font-size:15px;line-height:1.6;color:#0f172a">` +
    `<p style="margin:0 0 16px">${escapeHtml(contenu)}</p>` +
    `<p style="margin:0;color:#5b6b85;font-size:13px">${escapeHtml(SIGNATURE)}</p>` +
    `</div>`;
  return { subject, text, html };
}
