import { prisma } from "@/lib/prisma";

/** Dernières notifications d'un utilisateur (tuteur), les plus récentes d'abord. */
export function getNotificationsForUser(userId: string, take = 8) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { envoyeLe: "desc" },
    take,
  });
}
