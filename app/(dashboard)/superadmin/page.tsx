import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { impersonner } from "./actions";

export const metadata = { title: "Mode administrateur · AlternPilot" };

const ROLE_LABELS: Record<string, string> = {
  TUTEUR: "Tuteur",
  ADMIN: "Administrateur",
  CFA_REFERENT: "Référent CFA",
};

export default async function SuperAdminPage() {
  await requireSuperAdmin();

  const [users, alternants] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ role: "asc" }, { nom: "asc" }],
      include: {
        organisation: { select: { nom: true } },
        cfa: { select: { nom: true } },
      },
    }),
    prisma.alternant.findMany({
      orderBy: { nom: "asc" },
      include: {
        organisation: { select: { nom: true } },
        diplome: { select: { nom: true } },
      },
    }),
  ]);

  const th = "px-3 py-2 text-left text-xs font-semibold text-muted-foreground";
  const td = "px-3 py-2.5 text-sm align-middle";
  const btn =
    "rounded-lg border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent";

  return (
    <div>
      <div>
        <h1 className="text-xl font-semibold text-foreground">
          Mode administrateur
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Consultez n&apos;importe quel espace (tuteur, alternant, CFA, admin) en
          basculant sur l&apos;identité correspondante.
        </p>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Stat label="Comptes (tuteurs, admins, CFA)" valeur={users.length} />
        <Stat label="Alternants" valeur={alternants.length} />
      </div>

      {/* ── Comptes ──────────────────────────────────────────── */}
      <h2 className="mt-8 text-sm font-semibold text-foreground">
        Tuteurs · Admins · Référents CFA
      </h2>
      <div className="mt-3 overflow-x-auto rounded-2xl border bg-card shadow-soft">
        <table className="w-full min-w-[640px] border-collapse">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className={th}>Nom</th>
              <th className={th}>E-mail</th>
              <th className={th}>Rôle</th>
              <th className={th}>Rattachement</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td className={`${td} text-muted-foreground`} colSpan={5}>
                  Aucun compte.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="border-b last:border-0">
                  <td className={`${td} font-medium text-foreground`}>{u.nom}</td>
                  <td className={`${td} text-muted-foreground`}>{u.email}</td>
                  <td className={`${td} text-muted-foreground`}>
                    {ROLE_LABELS[u.role] ?? u.role}
                  </td>
                  <td className={`${td} text-muted-foreground`}>
                    {u.cfa?.nom ?? u.organisation?.nom ?? "—"}
                  </td>
                  <td className={`${td} text-right`}>
                    <form action={impersonner.bind(null, "user", u.id)}>
                      <button type="submit" className={btn}>
                        Consulter son espace
                      </button>
                    </form>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Alternants ───────────────────────────────────────── */}
      <h2 className="mt-8 text-sm font-semibold text-foreground">Alternants</h2>
      <div className="mt-3 overflow-x-auto rounded-2xl border bg-card shadow-soft">
        <table className="w-full min-w-[640px] border-collapse">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className={th}>Nom</th>
              <th className={th}>E-mail</th>
              <th className={th}>Entreprise</th>
              <th className={th}>Diplôme</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody>
            {alternants.length === 0 ? (
              <tr>
                <td className={`${td} text-muted-foreground`} colSpan={5}>
                  Aucun alternant.
                </td>
              </tr>
            ) : (
              alternants.map((a) => (
                <tr key={a.id} className="border-b last:border-0">
                  <td className={`${td} font-medium text-foreground`}>{a.nom}</td>
                  <td className={`${td} text-muted-foreground`}>{a.email}</td>
                  <td className={`${td} text-muted-foreground`}>
                    {a.organisation.nom}
                  </td>
                  <td className={`${td} text-muted-foreground`}>{a.diplome.nom}</td>
                  <td className={`${td} text-right`}>
                    <form action={impersonner.bind(null, "alternant", a.id)}>
                      <button type="submit" className={btn}>
                        Consulter son espace
                      </button>
                    </form>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, valeur }: { label: string; valeur: number }) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-soft">
      <div className="text-2xl font-bold text-foreground">{valeur}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
