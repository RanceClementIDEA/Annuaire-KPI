import {
  grilleMois,
  moisCouverts,
  typeForDate,
  type PeriodeType,
  type Rythme,
} from "@/lib/rythme";

const MOIS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];
const JOURS_FR = ["L", "M", "M", "J", "V", "S", "D"];

const DAY_STYLE: Record<PeriodeType, string> = {
  ECOLE: "bg-sky-100 text-sky-900 dark:bg-sky-500/25 dark:text-sky-100",
  ENTREPRISE: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/25 dark:text-emerald-100",
};

function LegendItem({ type, label }: { type: PeriodeType; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      <span className={`inline-block h-3 w-3 rounded ${DAY_STYLE[type]}`} />
      {label}
    </span>
  );
}

function MonthCard({
  year,
  month0,
  rythme,
  today,
}: {
  year: number;
  month0: number;
  rythme: Rythme;
  today?: string;
}) {
  const weeks = grilleMois(year, month0);
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-soft">
      <div className="mb-3 text-sm font-semibold capitalize text-foreground">
        {MOIS_FR[month0]} {year}
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {JOURS_FR.map((j, i) => (
          <div key={i} className="pb-1 text-xs font-medium text-muted-foreground">
            {j}
          </div>
        ))}
        {weeks.flat().map((iso, i) => {
          if (!iso) return <div key={i} />;
          const type = typeForDate(rythme, iso);
          const day = Number(iso.slice(8, 10));
          const isToday = iso === today;
          return (
            <div
              key={i}
              className={[
                "flex h-8 items-center justify-center rounded-lg text-xs",
                type ? DAY_STYLE[type] : "text-foreground",
                isToday ? "ring-2 ring-ring ring-offset-1" : "",
              ].join(" ")}
              title={type ? `${iso} · ${type === "ECOLE" ? "École / CFA" : "Entreprise"}` : iso}
            >
              {day}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CalendrierAlternance({
  rythme,
  refIso,
  today,
}: {
  rythme: Rythme;
  refIso: string;
  today?: string;
}) {
  const mois = moisCouverts(rythme, refIso);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <LegendItem type="ECOLE" label="École / CFA" />
        <LegendItem type="ENTREPRISE" label="Entreprise" />
      </div>
      {rythme.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          Aucun rythme d&apos;alternance saisi pour le moment.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mois.map(({ year, month0 }) => (
            <MonthCard
              key={`${year}-${month0}`}
              year={year}
              month0={month0}
              rythme={rythme}
              today={today}
            />
          ))}
        </div>
      )}
    </div>
  );
}
