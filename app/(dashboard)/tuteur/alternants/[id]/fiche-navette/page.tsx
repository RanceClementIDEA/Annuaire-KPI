import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getAlternantOwnedByTuteur } from "@/lib/data/alternants";
import { risqueAlternant } from "@/lib/data/risque";
import { prisma } from "@/lib/prisma";
import { nbJours, parseRythme } from "@/lib/rythme";
import { libelleSemaine } from "@/lib/semaine";
import { libelleNiveau } from "@/lib/risque";
import { PrintButton } from "@/components/print-button";

export const metadata = { title: "Fiche navette · AlternPilot" };

function formatDate(d: Date): string {
  const jj = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${jj}/${mm}/${d.getUTCFullYear()}`;
}

const STATUT_LABEL: Record<string, string> = {
  A_FAIRE: "À faire",
  EN_COURS: "En cours",
  VALIDE: "Validée",
};

export default async function FicheNavettePage({
  params,
}: {
  params: { id: string };
}) {
  const user = await requireRole(["TUTEUR"]);
  const alternant = await getAlternantOwnedByTuteur(params.id, user.entityId!);
  if (!alternant) notFound();

  const today = new Date().toISOString().slice(0, 10);
  const [missions, dernierBilan, risque] = await Promise.all([
    prisma.mission.findMany({
      where: { alternantId: alternant.id },
      orderBy: [{ echeance: "asc" }, { createdAt: "asc" }],
    }),
    prisma.bilanHebdo.findFirst({
      where: { alternantId: alternant.id },
      orderBy: { semaine: "desc" },
    }),
    risqueAlternant(alternant.id, today),
  ]);

  const rythme = parseRythme(alternant.rythmeAlternance);
  const enCours = missions.filter((m) => m.statut !== "VALIDE");
  const validees = missions.filter((m) => m.statut === "VALIDE").length;

  const th = "border px-3 py-1.5 text-left text-xs font-semibold";
  const td = "border px-3 py-1.5 text-sm align-top";

  return (
    <div>
      {/* Barre d'actions — masquée à l'impression. */}
      <div className="no-print mb-6 flex items-center justify-between gap-3">
        <Link
          href={`/tuteur/alternants/${alternant.id}`}
          className="text-sm text-primary hover:underline"
        >
          ← Retour à l&apos;alternant
        </Link>
        <PrintButton />
      </div>

      {/* Document imprimable. */}
      <article className="print-plain mx-auto max-w-3xl rounded-2xl border bg-card p-5 shadow-soft sm:p-8">
        <header className="flex items-start justify-between gap-4 border-b pb-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Fiche navette</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Document de liaison entreprise · CFA · alternant
            </p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            Éditée le {formatDate(new Date())}
          </div>
        </header>

        <section className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <Info label="Alternant" value={alternant.nom} />
          <Info label="Diplôme préparé" value={alternant.diplome.nom} />
          <Info label="Tuteur / maître d'apprentissage" value={user.nom} />
          <Info
            label="Missions"
            value={`${validees} validée(s) · ${enCours.length} en cours`}
          />
        </section>

        {/* Rythme d'alternance. */}
        <h2 className="mt-6 text-sm font-semibold text-foreground">
          Rythme d&apos;alternance
        </h2>
        {rythme.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Rythme non renseigné.
          </p>
        ) : (
          <table className="mt-2 w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>Type</th>
                <th className={th}>Début</th>
                <th className={th}>Fin</th>
                <th className={th}>Durée</th>
              </tr>
            </thead>
            <tbody>
              {rythme.map((p) => (
                <tr key={`${p.debut}-${p.fin}`}>
                  <td className={td}>
                    {p.type === "ECOLE" ? "École / CFA" : "Entreprise"}
                  </td>
                  <td className={td}>{p.debut}</td>
                  <td className={td}>{p.fin}</td>
                  <td className={td}>{nbJours(p)} j</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Missions en cours. */}
        <h2 className="mt-6 text-sm font-semibold text-foreground">
          Missions en cours
        </h2>
        {enCours.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Aucune mission en cours.
          </p>
        ) : (
          <table className="mt-2 w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>Mission</th>
                <th className={th}>Statut</th>
                <th className={th}>Échéance</th>
              </tr>
            </thead>
            <tbody>
              {enCours.map((m) => (
                <tr key={m.id}>
                  <td className={td}>
                    <div className="font-medium text-foreground">{m.titre}</div>
                    <div className="text-xs text-muted-foreground">
                      {m.description}
                    </div>
                  </td>
                  <td className={td}>{STATUT_LABEL[m.statut] ?? m.statut}</td>
                  <td className={td}>
                    {m.echeance ? formatDate(m.echeance) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Dernier bilan. */}
        <h2 className="mt-6 text-sm font-semibold text-foreground">
          Dernier bilan hebdomadaire
        </h2>
        {dernierBilan ? (
          <div className="mt-2 space-y-2 text-sm">
            <p className="text-xs font-medium capitalize text-muted-foreground">
              {libelleSemaine(dernierBilan.semaine)}
              {dernierBilan.valideParTuteur ? " · validé par le tuteur" : ""}
            </p>
            <FicheChamp titre="Réussites" valeur={dernierBilan.reussites} />
            <FicheChamp titre="Difficultés" valeur={dernierBilan.difficultes} />
            {dernierBilan.commentaire && (
              <FicheChamp titre="Commentaire" valeur={dernierBilan.commentaire} />
            )}
            {dernierBilan.resumeIA && (
              <FicheChamp titre="Synthèse (IA)" valeur={dernierBilan.resumeIA} />
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Aucun bilan transmis pour l&apos;instant.
          </p>
        )}

        {/* Indicateur de suivi. */}
        <h2 className="mt-6 text-sm font-semibold text-foreground">
          Indicateur de suivi
        </h2>
        <p className="mt-2 text-sm text-foreground">
          Risque de décrochage : <strong>{libelleNiveau(risque.niveau)}</strong>{" "}
          ({risque.score}/100)
          {risque.facteurs.length > 0 && (
            <span className="text-muted-foreground">
              {" "}
              — {risque.facteurs.join(", ").toLowerCase()}.
            </span>
          )}
        </p>

        {/* Signatures. */}
        <section className="mt-8 grid grid-cols-3 gap-4 border-t pt-6 text-xs">
          {["Tuteur", "Alternant", "Référent CFA"].map((r) => (
            <div key={r}>
              <div className="font-medium text-foreground">{r}</div>
              <div className="mt-8 border-t pt-1 text-muted-foreground">
                Date &amp; signature
              </div>
            </div>
          ))}
        </section>
      </article>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}

function FicheChamp({ titre, valeur }: { titre: string; valeur: string }) {
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground">{titre}</div>
      <p className="whitespace-pre-line text-foreground">{valeur || "—"}</p>
    </div>
  );
}
