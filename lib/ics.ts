/**
 * Génération (pure) de fichiers iCalendar (RFC 5545) pour l'export du
 * calendrier d'alternance (périodes école/entreprise + échéances de missions).
 *
 * Événements « journée entière » : DTSTART;VALUE=DATE inclus, DTEND;VALUE=DATE
 * exclu (dernier jour + 1), conformément à la RFC.
 * Dates d'entrée au format ISO « AAAA-MM-JJ ».
 */

export interface EvenementICS {
  /** Identifiant unique et stable de l'événement (sans le domaine). */
  uid: string;
  titre: string;
  /** Premier jour (ISO, inclus). */
  debut: string;
  /** Dernier jour (ISO, inclus). Par défaut = `debut` (événement d'un jour). */
  fin?: string;
  description?: string;
}

const CRLF = "\r\n";

/** « 2026-09-01 » → « 20260901 » (format DATE d'iCalendar). */
function versDateICS(iso: string): string {
  return iso.replace(/-/g, "");
}

/** Ajoute `n` jours à une date ISO et renvoie le format iCalendar. */
function dateICSDecalee(iso: string, n: number): string {
  const t = Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000;
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const j = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${j}`;
}

/** Échappe les caractères spéciaux d'une valeur TEXT (RFC 5545 §3.3.11). */
function echapper(v: string): string {
  return v
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Plie une ligne de contenu à 75 octets (RFC 5545 §3.1) : les continuations
 * commencent par une espace. Découpe prudente par caractères (≤ 72) pour rester
 * correct avec les accents multi-octets courants en français.
 */
function plierLigne(ligne: string): string {
  if (ligne.length <= 72) return ligne;
  const morceaux: string[] = [];
  let reste = ligne;
  morceaux.push(reste.slice(0, 72));
  reste = reste.slice(72);
  while (reste.length > 0) {
    morceaux.push(` ${reste.slice(0, 71)}`);
    reste = reste.slice(71);
  }
  return morceaux.join(CRLF);
}

/**
 * Construit un document iCalendar complet.
 * @param nomCalendrier nom affiché du calendrier (X-WR-CALNAME)
 * @param evenements    liste d'événements journée entière
 * @param dtstamp       horodatage UTC « AAAAMMJJTHHMMSSZ » (injecté pour la
 *                      testabilité ; l'appelant passe l'heure courante)
 */
export function genererICS(
  nomCalendrier: string,
  evenements: EvenementICS[],
  dtstamp: string,
): string {
  const lignes: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AlternPilot//Calendrier alternance//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${echapper(nomCalendrier)}`,
  ];

  for (const e of evenements) {
    const fin = e.fin ?? e.debut;
    lignes.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}@alternpilot`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${versDateICS(e.debut)}`,
      // DTEND est exclusif : dernier jour inclus + 1.
      `DTEND;VALUE=DATE:${dateICSDecalee(fin, 1)}`,
      `SUMMARY:${echapper(e.titre)}`,
    );
    if (e.description) {
      lignes.push(`DESCRIPTION:${echapper(e.description)}`);
    }
    lignes.push("END:VEVENT");
  }

  lignes.push("END:VCALENDAR");
  return lignes.map(plierLigne).join(CRLF) + CRLF;
}
