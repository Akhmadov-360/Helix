import { PrismaClient } from "@prisma/client";

// Полный реэкспорт сгенерированного клиента: типы, namespace `Prisma` (классы ошибок
// для exception filter), доменные enum'ы как ЗНАЧЕНИЯ (Role, ProjectStatus, PhaseType…)
// и Prisma.TransactionClient для репозиториев, принимающих транзакцию (P4).
// @helix/db остаётся единственной точкой доступа к БД-слою.
export * from "@prisma/client";

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

/**
 * В тестах молчим: негативные сценарии (дубль email, reuse-detection) намеренно
 * доводят запрос до ошибки БД, и лог Prisma засоряет вывод — настоящее падение
 * теряется среди ожидаемых. Тест проверяет брошенное исключение, а не лог.
 */
const logLevels: Array<"warn" | "error"> =
  process.env.NODE_ENV === "test" ? [] : process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"];

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? new PrismaClient({ log: logLevels });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
