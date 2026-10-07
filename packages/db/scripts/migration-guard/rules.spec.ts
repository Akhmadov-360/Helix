import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeMigrationChanges, decideOutcome, stripSqlNoise, type MigrationChange } from "./rules";

const MIGRATIONS_DIR = join(__dirname, "../../prisma/migrations");
const added = (sql: string, name = "20260101000000_example"): MigrationChange => ({
  status: "A",
  path: `packages/db/prisma/migrations/${name}/migration.sql`,
  sql,
});
const existing = (status: "M" | "D" | "R", name = "20260719170201_init"): MigrationChange => ({
  status,
  path: `packages/db/prisma/migrations/${name}/migration.sql`,
});
const rulesOf = (changes: MigrationChange[]) => analyzeMigrationChanges(changes).map((f) => `${f.severity}:${f.rule}`);

describe("stripSqlNoise", () => {
  it("заменяет комментарии и строковые литералы пробелами, сохраняя переводы строк и длину", () => {
    const sql = "SELECT 1; -- DROP TABLE x\n/* DROP\nCOLUMN */ SELECT 'DROP TABLE y';";
    const stripped = stripSqlNoise(sql);

    expect(stripped).toHaveLength(sql.length);
    expect(stripped.split("\n")).toHaveLength(sql.split("\n").length);
    expect(stripped).not.toMatch(/DROP/);
  });

  it("экранированная кавычка внутри литерала не обрывает литерал", () => {
    expect(stripSqlNoise("SELECT 'it''s DROP TABLE';")).not.toMatch(/DROP/);
  });
});

describe("analyzeMigrationChanges — безопасные миграции", () => {
  it("нет изменений → нет находок", () => {
    expect(analyzeMigrationChanges([])).toEqual([]);
  });

  it("CREATE TABLE / ADD COLUMN / CREATE INDEX → нет находок", () => {
    const sql = `CREATE TABLE "A" ("id" TEXT NOT NULL);\nALTER TABLE "A" ADD COLUMN "b" TEXT;\nCREATE INDEX "A_b_idx" ON "A"("b");`;
    expect(rulesOf([added(sql)])).toEqual([]);
  });

  it("DROP INDEX / DROP CONSTRAINT чужих индексов и ограничений не считаются деструктивными", () => {
    const sql = `DROP INDEX "Task_projectId_idx";\nALTER TABLE "Task" DROP CONSTRAINT "Task_projectId_fkey";`;
    expect(rulesOf([added(sql)])).toEqual([]);
  });

  it("переименование индекса и ограничения (Prisma делает так при смене имён) не деструктивно", () => {
    const sql = `ALTER INDEX "old_idx" RENAME TO "new_idx";\nALTER TABLE "A" RENAME CONSTRAINT "old_fkey" TO "new_fkey";`;
    expect(rulesOf([added(sql)])).toEqual([]);
  });

  it("колонка с именем type не принимается за смену типа", () => {
    expect(rulesOf([added(`ALTER TABLE "A" ALTER COLUMN "type" SET NOT NULL;`)])).toEqual([]);
  });

  it("ключевые слова в комментариях и строках игнорируются", () => {
    const sql = [
      "-- ВНИМАНИЕ: Prisma сгенерировал DROP INDEX \"phase_ws_order_unique\" и DROP COLUMN",
      "/* DROP TABLE \"X\";",
      "   ALTER COLUMN y TYPE text */",
      `INSERT INTO "Note"("text") VALUES ('DROP TABLE "Y"');`,
    ].join("\n");
    expect(rulesOf([added(sql)])).toEqual([]);
  });

  it("не-SQL файлы и файлы вне migration.sql игнорируются", () => {
    expect(
      rulesOf([
        { status: "M", path: "packages/db/prisma/migrations/migration_lock.toml" },
        { status: "A", path: "packages/db/prisma/migrations/20260101000000_x/README.md", sql: "DROP TABLE a;" },
      ]),
    ).toEqual([]);
  });
});

describe("analyzeMigrationChanges — деструктивные операции", () => {
  const cases: Array<[string, string, string]> = [
    ["DROP TABLE", `DROP TABLE "A";`, "drop-table"],
    ["DROP COLUMN", `ALTER TABLE "A" DROP COLUMN "b";`, "drop-column"],
    ["DROP TYPE", `DROP TYPE "Status";`, "drop-type"],
    ["ALTER COLUMN … TYPE", `ALTER TABLE "A" ALTER COLUMN "b" TYPE VARCHAR(64);`, "alter-column-type"],
    ["ALTER COLUMN … SET DATA TYPE", `ALTER TABLE "A" ALTER COLUMN "b" SET DATA TYPE TIMESTAMPTZ;`, "alter-column-type"],
    ["RENAME COLUMN", `ALTER TABLE "A" RENAME COLUMN "b" TO "c";`, "rename-column"],
    ["RENAME таблицы", `ALTER TABLE "A" RENAME TO "B";`, "rename-table"],
    ["TRUNCATE", `TRUNCATE TABLE "A";`, "truncate"],
    ["DELETE FROM", `DELETE FROM "A" WHERE "x" = 1;`, "delete"],
  ];

  it.each(cases)("%s → destructive", (_label, sql, rule) => {
    expect(rulesOf([added(sql)])).toEqual([`destructive:${rule}`]);
  });

  it("регистр и многострочная запись не мешают обнаружению", () => {
    const sql = `alter table "A"\n  alter column "b"\n  type integer;`;
    expect(rulesOf([added(sql)])).toEqual(["destructive:alter-column-type"]);
  });

  it("находка указывает файл и строку начала оператора", () => {
    const sql = `CREATE TABLE "A" ("id" TEXT);\n\nALTER TABLE "A" DROP COLUMN "b";`;
    const [finding] = analyzeMigrationChanges([added(sql, "20260102000000_x")]);

    expect(finding).toMatchObject({
      severity: "destructive",
      rule: "drop-column",
      line: 3,
      path: "packages/db/prisma/migrations/20260102000000_x/migration.sql",
    });
  });

  it("несколько операций → несколько находок по порядку", () => {
    const sql = `ALTER TABLE "A" DROP COLUMN "b";\nDROP TABLE "C";`;
    expect(rulesOf([added(sql)])).toEqual(["destructive:drop-column", "destructive:drop-table"]);
  });
});

describe("analyzeMigrationChanges — жёсткие ошибки", () => {
  it.each([["M"], ["D"], ["R"]] as const)("статус %s у существующей migration.sql → error immutable", (status) => {
    expect(rulesOf([existing(status)])).toEqual(["error:immutable"]);
  });

  it.each([
    [`DROP INDEX "phase_ws_order_unique";`],
    [`DROP INDEX IF EXISTS phase_ws_order_unique;`],
    [`drop index "phase_ws_order_unique"`],
  ])("DROP INDEX phase_ws_order_unique (%s) → error protected-index", (sql) => {
    expect(rulesOf([added(sql)])).toContain("error:protected-index");
  });
});

describe("decideOutcome", () => {
  const destructive = analyzeMigrationChanges([added(`DROP TABLE "A";`)]);
  const error = analyzeMigrationChanges([existing("M")]);

  it("нет находок → 0", () => {
    expect(decideOutcome([], false).exitCode).toBe(0);
  });

  it("деструктивные без подтверждения → 1", () => {
    expect(decideOutcome(destructive, false).exitCode).toBe(1);
  });

  it("деструктивные с подтверждением (label) → 0", () => {
    expect(decideOutcome(destructive, true).exitCode).toBe(0);
  });

  it("жёсткая ошибка → 3, даже с подтверждением", () => {
    expect(decideOutcome(error, true).exitCode).toBe(3);
    expect(decideOutcome([...destructive, ...error], false).exitCode).toBe(3);
  });
});

describe("реальная история миграций Helix", () => {
  const sqlOf = (name: string) => readFileSync(join(MIGRATIONS_DIR, name, "migration.sql"), "utf8");
  const migrations = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  it("ни одна из уже применённых миграций не содержит жёстких ошибок (phase_ws_order_unique вырезан везде)", () => {
    const errors = analyzeMigrationChanges(migrations.map((name) => added(sqlOf(name), name))).filter(
      (finding) => finding.severity === "error",
    );
    expect(errors).toEqual([]);
  });

  it("init не деструктивна, а миграция с DROP COLUMN \"roles\" помечена", () => {
    expect(rulesOf([added(sqlOf("20260719170201_init"), "20260719170201_init")])).toEqual([]);
    expect(rulesOf([added(sqlOf("20260726083514_project_links_deal_role"), "20260726083514_project_links_deal_role")])).toContain(
      "destructive:drop-column",
    );
  });
});
