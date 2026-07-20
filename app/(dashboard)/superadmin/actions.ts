"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { dashboardPathForRole, getAppUser } from "@/lib/auth";
import { IMPERSONATION_COOKIE } from "@/lib/superadmin";

/**
 * Bascule vers l'identité d'un `User` ou d'un `Alternant` et ouvre son portail.
 * Réservé aux super-admins (double vérification serveur).
 */
export async function impersonner(
  k: "user" | "alternant",
  id: string,
): Promise<void> {
  const admin = await getAppUser();
  if (!admin?.isSuperAdmin) redirect("/");

  let destination: string;
  if (k === "user") {
    const u = await prisma.user.findUnique({
      where: { id },
      select: { role: true },
    });
    if (!u) redirect("/superadmin?error=introuvable");
    destination = dashboardPathForRole(u.role);
  } else {
    const a = await prisma.alternant.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!a) redirect("/superadmin?error=introuvable");
    destination = "/alternant";
  }

  cookies().set(IMPERSONATION_COOKIE, JSON.stringify({ k, id }), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8, // 8 h
  });
  revalidatePath("/", "layout");
  redirect(destination);
}

/** Met fin à la bascule et revient au tableau de bord super-admin. */
export async function arreterImpersonation(): Promise<void> {
  cookies().delete(IMPERSONATION_COOKIE);
  revalidatePath("/", "layout");
  redirect("/superadmin");
}
