import { z } from "zod";

/**
 * Rythme d'alternance : suite de périodes datées, chacune en ÉCOLE (CFA) ou en
 * ENTREPRISE. Stocké en JSON sur `Alternant.rythmeAlternance`.
 * Les dates sont au format ISO « AAAA-MM-JJ » : la comparaison lexicographique
 * équivaut à la comparaison chronologique (aucun piège de fuseau horaire).
 */

export const PERIODE_TYPES = ["ECOLE", "ENTREPRISE"] as const;
export type PeriodeType = (typeof PERIODE_TYPES)[number];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const PeriodeSchema = z
  .object({
    debut: z.string().regex(ISO_DATE, "Date de début invalide (AAAA-MM-JJ)."),
    fin: z.string().regex(ISO_DATE, "Date de fin invalide (AAAA-MM-JJ)."),
    type: z.enum(PERIODE_TYPES),
  })
  .refine((p) => p.debut <= p.fin, {
    message: "La date de fin doit être postérieure ou égale à la date de début.",
    path: ["fin"],
  });

export type Periode = z.infer<typeof PeriodeSchema>;

export const RythmeSchema = z.array(PeriodeSchema);
export type Rythme = Periode[];

/** Parse tolérant : renvoie un tableau trié, ou [] si la donnée est absente/invalide. */
export function parseRythme(value: unknown): Rythme {
  const res = RythmeSchema.safeParse(value ?? []);
  if (!res.success) return [];
  return [...res.data].sort((a, b) => a.debut.localeCompare(b.debut));
}

/** Type applicable à une journée ISO selon le rythme, ou null si hors période. */
export function typeForDate(rythme: Rythme, iso: string): PeriodeType | null {
  for (const p of rythme) {
    if (iso >= p.debut && iso <= p.fin) return p.type;
  }
  return null;
}

/** Deux périodes se chevauchent-elles ? (bornes incluses) */
export function periodesSeChevauchent(a: Periode, b: Periode): boolean {
  return a.debut <= b.fin && b.debut <= a.fin;
}

/** Le rythme contient-il déjà une période chevauchant `candidate` ? */
export function chevaucheRythme(rythme: Rythme, candidate: Periode): boolean {
  return rythme.some((p) => periodesSeChevauchent(p, candidate));
}

/** Nombre de jours d'une période, bornes incluses. */
export function nbJours(p: Periode): number {
  const d1 = Date.parse(`${p.debut}T00:00:00Z`);
  const d2 = Date.parse(`${p.fin}T00:00:00Z`);
  return Math.round((d2 - d1) / 86_400_000) + 1;
}

/**
 * Mois (année, mois0 sur 0-11) à afficher : de la première à la dernière période,
 * sinon le mois de `refIso`. Plafonné à `max` mois.
 */
export function moisCouverts(
  rythme: Rythme,
  refIso: string,
  max = 12,
): { year: number; month0: number }[] {
  let startY: number;
  let startM: number;
  let endY: number;
  let endM: number;

  if (rythme.length === 0) {
    const [y, m] = refIso.split("-").map(Number);
    startY = endY = y;
    startM = endM = m - 1;
  } else {
    const debuts = rythme.map((p) => p.debut).sort();
    const fins = rythme.map((p) => p.fin).sort();
    const [sy, sm] = debuts[0].split("-").map(Number);
    const [ey, em] = fins[fins.length - 1].split("-").map(Number);
    startY = sy;
    startM = sm - 1;
    endY = ey;
    endM = em - 1;
  }

  const out: { year: number; month0: number }[] = [];
  let y = startY;
  let m = startM;
  while ((y < endY || (y === endY && m <= endM)) && out.length < max) {
    out.push({ year: y, month0: m });
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return out;
}

/**
 * Grille d'un mois : semaines de 7 cellules (lundi → dimanche). Les cellules hors
 * du mois valent null. Chaque cellule du mois est une date ISO « AAAA-MM-JJ ».
 */
export function grilleMois(year: number, month0: number): (string | null)[][] {
  const first = new Date(Date.UTC(year, month0, 1));
  const startWeekday = (first.getUTCDay() + 6) % 7; // lundi = 0
  const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();

  const cells: (string | null)[] = [];
  for (let i = 0; i < startWeekday; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) {
    const mm = String(month0 + 1).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    cells.push(`${year}-${mm}-${dd}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
