import { PrismaClient } from "@prisma/client";

// Réutilise une seule instance de PrismaClient en développement pour éviter
// d'épuiser le pool de connexions à chaque rechargement à chaud de Next.js.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
