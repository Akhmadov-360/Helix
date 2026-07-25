import { generateKeyBetween } from "fractional-indexing";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";

/**
 * Manual migration point #4 — байтовая коллация Project.rank. Два теста ловят РАЗНОЕ:
 * структурный краснеет, когда Prisma сбросила коллацию (`ALTER COLUMN TYPE`); поведенческий —
 * когда сортировка поехала по любой причине. Защита одинарная (§3.1) → тесты несущие.
 */
describe("Project.rank — коллация C (manual point #4)", () => {
  let phaseId: string;
  let orgId: string;
  let workspaceId: string;

  beforeEach(async () => {
    const org = await prisma.organization.create({ data: { name: "Org" } });
    const ws = await prisma.workspace.create({ data: { orgId: org.id, name: "Board" } });
    const phase = await prisma.phase.create({
      data: { workspaceId: ws.id, key: "lead", name: { en: "Lead" }, type: "OPEN", order: 1 },
    });
    orgId = org.id;
    workspaceId = ws.id;
    phaseId = phase.id;
  });

  const addProject = (title: string, rank: string) =>
    prisma.project.create({ data: { orgId, workspaceId, phaseId, title, rank } });

  it("структурный: collation_name колонки rank = 'C'", async () => {
    const rows = await prisma.$queryRaw<Array<{ collation_name: string | null }>>`
      SELECT collation_name FROM information_schema.columns
      WHERE table_name = 'Project' AND column_name = 'rank'
    `;
    expect(rows[0]?.collation_name).toBe("C");
  });

  it("поведенческий: ORDER BY rank даёт байтовый порядок 'B0' < 'a0'", async () => {
    // Под дефолтной коллацией было бы ['a0','B0'] (регистр вторичен) — тест бы покраснел.
    await addProject("upper", "B0");
    await addProject("lower", "a0");

    const ordered = await prisma.project.findMany({
      where: { phaseId },
      orderBy: { rank: "asc" },
      select: { rank: true },
    });
    expect(ordered.map((p) => p.rank)).toEqual(["B0", "a0"]);
  });

  it("prepend-ключ ('Zz') сортируется ПЕРЕД 'a0' в БД (согласовано с логикой ранга)", async () => {
    await addProject("first", "a0");
    await addProject("prepended", generateKeyBetween(null, "a0")); // "Zz"

    const ordered = await prisma.project.findMany({
      where: { phaseId },
      orderBy: [{ rank: "asc" }, { id: "asc" }],
      select: { rank: true },
    });
    expect(ordered.map((p) => p.rank)).toEqual(["Zz", "a0"]);
  });

  it("сохранённые ранги парсятся библиотекой (бэкфилл-совместимость)", async () => {
    await addProject("x", "a0");
    const stored = await prisma.project.findFirst({ select: { rank: true } });
    // generateKeyBetween(rank, null) не бросает → строка в формате библиотеки.
    expect(() => generateKeyBetween(stored?.rank ?? null, null)).not.toThrow();
  });
});
