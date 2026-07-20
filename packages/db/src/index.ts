import { PrismaClient } from "@prisma/client";

// `Prisma` — namespace значений (классы ошибок: PrismaClientKnownRequestError и т.п.).
// Реэкспортим отсюда, чтобы @helix/db оставался единственной точкой доступа к БД-слою
// (глобальный exception filter в apps/api ловит доменные ошибки именно через него).
export { PrismaClient, Prisma } from "@prisma/client";
export type * from "@prisma/client";

/**
 * Single PrismaClient instance for the whole process.
 *
 * Why a singleton wrapper (not `new PrismaClient()` per import):
 *  - one connection pool per process;
 *  - one place to attach the tenant-scoping middleware (M1) and query logging;
 *  - `@helix/db` stays the only import surface for domain data access.
 *
 * In dev, HMR/watch reloads would otherwise leak a new client (and pool) on
 * every reload — we stash the instance on `globalThis` to survive reloads.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
