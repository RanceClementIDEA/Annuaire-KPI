import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseRythme } from "@/lib/rythme";
import { CalendrierAlternance } from "@/components/calendrier/calendrier-alternance";

export const metadata = { title: "Mon suivi · AlternPilot" };

export default async function AlternantPage() {
  const user = await requireRole(["ALTERNANT"]);
  const alternant = await prisma.alternant.findUnique({
    where: { id: user.entityId! },
    include: { diplome: true },
  });

  const rythme = parseRythme(alternant?.rythmeAlternance);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Bonjour {user.nom}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {alternant?.diplome.nom ?? "Mon suivi d'alternance"}
      </p>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          Mon calendrier d&apos;alternance
        </h2>
        <CalendrierAlternance rythme={rythme} refIso={today} today={today} />
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border bg-card p-5 shadow-soft">
          <div className="text-sm font-medium text-foreground">Mes missions</div>
          <p className="mt-1 text-sm text-muted-foreground">Le Kanban de vos missions (Phase 5).</p>
        </div>
        <Link
          href="/alternant/bilan"
          className="rounded-2xl border bg-card p-5 shadow-soft transition-colors hover:border-primary/50"
        >
          <div className="text-sm font-medium text-foreground">Mon bilan</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Réussites / difficultés de la semaine + résumé IA.
          </p>
        </Link>
      </section>
    </div>
  );
}
