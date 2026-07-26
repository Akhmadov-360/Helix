import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard на manual-migration-points: превращает «вырезать руками и проверить глазами» в «тест падает».
 * Каждый `prisma migrate` в чужом срезе генерит DROP на raw-SQL инвариантах (gotcha #4) — если
 * забыть вырезать, эти тесты краснеют ДО коммита, а не всплывают багом в проде.
 */
const MIGRATIONS_DIR = join(__dirname, "../../../../packages/db/prisma/migrations");

function migrationSql(): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => ({ name: e.name, sql: readFileSync(join(MIGRATIONS_DIR, e.name, "migration.sql"), "utf8") }));
}

// Реальный SQL-стейтмент (строка, начинающаяся с DROP), а не упоминание в комментарии (-- …).
function hasRealDrop(sql: string, target: string): boolean {
  return sql
    .split("\n")
    .some((line) => line.trimStart().toUpperCase().startsWith(`DROP INDEX "${target.toUpperCase()}"`.toUpperCase()));
}

describe("migration guards — manual-migration-points не роняются prisma-дрейфом", () => {
  const files = migrationSql();

  it("миграции найдены (санити)", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  // manual-point #1: DEFERRABLE unique на Phase(workspaceId, order) живёт в raw SQL. Prisma не
  // моделирует DEFERRABLE и на каждом diff предлагает DROP — его обязаны вырезать вручную.
  it("ни одна миграция не роняет phase_ws_order_unique (manual-point #1)", () => {
    const offenders = files.filter((f) => hasRealDrop(f.sql, "phase_ws_order_unique")).map((f) => f.name);
    expect(offenders).toEqual([]);
  });
});
