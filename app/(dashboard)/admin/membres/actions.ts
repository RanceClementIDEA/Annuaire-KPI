"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { inviterUtilisateur } from "@/lib/invitations";
import { laisseraitSansAdmin } from "@/lib/membres";

const base = "/admin/membres";

function erreur(msg: string): never {
  redirect(`${base}?error=${encodeURIComponent(msg)}`);
}

/** Normalise le rôle saisi vers un rôle gérable (défaut : tuteur). */
function roleGerable(v: FormDataEntryValue | null): "TUTEUR" | "ADMIN" {
  return String(v ?? "") === "ADMIN" ? "ADMIN" : "TUTEUR";
}

/** Invite un nouveau membre (tuteur ou admin) dans l'organisation courante. */
export async function inviterMembre(formData: FormData): Promise<void> {
  const admin = await requireRole(["ADMIN"]);
  if (!admin.organisationId) erreur("Aucune organisation rattachée.");
  const orgId = admin.organisationId;

  const nom = String(formData.get("nom") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = roleGerable(formData.get("role"));

  if (!nom || !email) erreur("Nom et e-mail requis.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) erreur("E-mail invalide.");

  const [userExist, altExist] = await Promise.all([
    prisma.user.findUnique({ where: { email } }),
    prisma.alternant.findUnique({ where: { email } }),
  ]);
  if (userExist || altExist) {
    erreur("Cet e-mail est déjà associé à un compte.");
  }

  await prisma.user.create({
    data: { email, nom, role, organisationId: orgId },
  });

  // Invitation par e-mail (best-effort) : la personne définit son mot de passe.
  const invitation = await inviterUtilisateur(email);

  revalidatePath(base);
  redirect(`${base}?ok=invite${invitation.invited ? "&mail=1" : ""}`);
}

/** Change le rôle d'un membre (tuteur ↔ admin), sans laisser l'org sans admin. */
export async function changerRole(
  userId: string,
  formData: FormData,
): Promise<void> {
  const admin = await requireRole(["ADMIN"]);
  if (!admin.organisationId) erreur("Aucune organisation rattachée.");
  const orgId = admin.organisationId;
  const role = roleGerable(formData.get("role"));

  const cible = await prisma.user.findFirst({
    where: { id: userId, organisationId: orgId, role: { in: ["TUTEUR", "ADMIN"] } },
    select: { id: true, role: true },
  });
  if (!cible) erreur("Membre introuvable dans votre organisation.");
  if (cible.role === role) redirect(`${base}?ok=role`);

  if (role === "TUTEUR") {
    const membres = await prisma.user.findMany({
      where: { organisationId: orgId, role: { in: ["TUTEUR", "ADMIN"] } },
      select: { id: true, role: true },
    });
    if (laisseraitSansAdmin(membres, userId)) {
      erreur("L'organisation doit garder au moins un administrateur.");
    }
  }

  await prisma.user.update({ where: { id: userId }, data: { role } });
  revalidatePath(base);
  redirect(`${base}?ok=role`);
}

/** Retire un membre de l'organisation (suppression de sa fiche d'accès). */
export async function retirerMembre(userId: string): Promise<void> {
  const admin = await requireRole(["ADMIN"]);
  if (!admin.organisationId) erreur("Aucune organisation rattachée.");
  const orgId = admin.organisationId;

  if (userId === admin.entityId) {
    erreur("Vous ne pouvez pas vous retirer vous-même.");
  }

  const cible = await prisma.user.findFirst({
    where: { id: userId, organisationId: orgId, role: { in: ["TUTEUR", "ADMIN"] } },
    select: { id: true, _count: { select: { alternantsSuivis: true } } },
  });
  if (!cible) erreur("Membre introuvable dans votre organisation.");

  const membres = await prisma.user.findMany({
    where: { organisationId: orgId, role: { in: ["TUTEUR", "ADMIN"] } },
    select: { id: true, role: true },
  });
  if (laisseraitSansAdmin(membres, userId)) {
    erreur("L'organisation doit garder au moins un administrateur.");
  }
  if (cible._count.alternantsSuivis > 0) {
    erreur(
      "Ce tuteur suit encore des alternants. Réassignez-les avant de le retirer.",
    );
  }

  await prisma.user.delete({ where: { id: userId } });
  revalidatePath(base);
  redirect(`${base}?ok=retire`);
}
