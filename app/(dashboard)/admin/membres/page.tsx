import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getMembresForOrg } from "@/lib/data/membres";
import { changerRole, inviterMembre, retirerMembre } from "./actions";

export const metadata = { title: "Gestion des accès · AlternPilot" };

const OK_MESSAGES: Record<string, string> = {
  invite: "Membre ajouté.",
  role: "Rôle mis à jour.",
  retire: "Membre retiré.",
};

const ROLE_LABELS: Record<string, string> = {
  TUTEUR: "Tuteur",
  ADMIN: "Administrateur",
};

export default async function MembresPage({
  searchParams,
}: {
  searchParams: { ok?: string; mail?: string; error?: string };
}) {
  const user = await requireRole(["ADMIN"]);
  const membres = user.organisationId
    ? await getMembresForOrg(user.organisationId)
    : [];

  const inputClass =
    "w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
  const th = "px-3 py-2 text-left text-xs font-semibold text-muted-foreground";
  const td = "px-3 py-2.5 text-sm align-middle";

  return (
    <div>
      <Link href="/admin" className="text-sm text-primary hover:underline">
        ← Administration
      </Link>

      <h1 className="mt-3 text-xl font-semibold text-foreground">
        Gestion des accès
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Invitez des tuteurs ou des administrateurs, ajustez leurs rôles.
      </p>

      {searchParams.ok && (
        <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
          {OK_MESSAGES[searchParams.ok] ?? "Opération effectuée."}
          {searchParams.ok === "invite" &&
            (searchParams.mail
              ? " Une invitation par e-mail a été envoyée."
              : " Pensez à lui communiquer comment se connecter.")}
        </p>
      )}
      {searchParams.error && (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
          {searchParams.error}
        </p>
      )}

      {/* ── Liste des membres ────────────────────────────────── */}
      <div className="mt-6 overflow-x-auto rounded-2xl border bg-card shadow-soft">
        <table className="w-full min-w-[640px] border-collapse">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className={th}>Membre</th>
              <th className={th}>Rôle</th>
              <th className={th}>Alternants</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody>
            {membres.map((m) => {
              const estMoi = m.id === user.entityId;
              return (
                <tr key={m.id} className="border-b last:border-0">
                  <td className={td}>
                    <div className="font-medium text-foreground">
                      {m.nom}
                      {estMoi && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          (vous)
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">{m.email}</div>
                  </td>
                  <td className={td}>
                    <form
                      action={changerRole.bind(null, m.id)}
                      className="flex items-center gap-2"
                    >
                      <select
                        name="role"
                        defaultValue={m.role}
                        className="rounded-lg border bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-ring"
                        aria-label={`Rôle de ${m.nom}`}
                      >
                        <option value="TUTEUR">Tuteur</option>
                        <option value="ADMIN">Administrateur</option>
                      </select>
                      <button
                        type="submit"
                        className="rounded-lg border px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                      >
                        Modifier
                      </button>
                    </form>
                  </td>
                  <td className={`${td} text-muted-foreground`}>
                    {m.role === "TUTEUR" ? m._count.alternantsSuivis : "—"}
                  </td>
                  <td className={`${td} text-right`}>
                    {estMoi ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <form action={retirerMembre.bind(null, m.id)}>
                        <button
                          type="submit"
                          className="rounded-lg px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:hover:bg-red-500/15"
                        >
                          Retirer
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Inviter un membre ────────────────────────────────── */}
      <h2 className="mt-8 text-sm font-semibold text-foreground">
        Inviter un membre
      </h2>
      <form
        action={inviterMembre}
        className="mt-3 grid gap-3 rounded-2xl border bg-card p-5 sm:grid-cols-2"
      >
        <input name="nom" required placeholder="Nom complet" className={inputClass} />
        <input
          name="email"
          type="email"
          required
          placeholder="Adresse e-mail"
          className={inputClass}
        />
        <select name="role" defaultValue="TUTEUR" className={inputClass}>
          <option value="TUTEUR">Tuteur</option>
          <option value="ADMIN">Administrateur</option>
        </select>
        <div className="sm:col-span-2">
          <button
            type="submit"
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Inviter
          </button>
          <p className="mt-2 text-xs text-muted-foreground">
            La personne reçoit un e-mail pour créer son mot de passe (si l&apos;envoi
            d&apos;e-mails est configuré).
          </p>
        </div>
      </form>
    </div>
  );
}
