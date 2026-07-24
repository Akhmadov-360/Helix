import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";

/**
 * Страж manual-migration point #1: UNIQUE(workspaceId, order) DEFERRABLE INITIALLY DEFERRED.
 * Тест краснеет, если prisma migrate пересоздаст констрейнт как обычный (немедленный) UNIQUE
 * или уронит его вовсе — то есть автоматическая замена ручного ревью миграций.
 */
describe("Phase(workspaceId, order) — DEFERRABLE unique", () => {
  let workspaceId: string;
  let phaseA: string;
  let phaseB: string;

  const makePhase = (key: string, order: number) =>
    prisma.phase.create({
      data: { workspaceId, key, name: { en: key }, type: "OPEN", order },
      select: { id: true },
    });

  beforeEach(async () => {
    const org = await prisma.organization.create({ data: { name: "Org" } });
    const ws = await prisma.workspace.create({ data: { orgId: org.id, name: "Board" } });
    workspaceId = ws.id;
    phaseA = (await makePhase("a", 1)).id;
    phaseB = (await makePhase("b", 2)).id;
  });

  it("транзакция с временным дублем order коммитится (это и есть смысл DEFERRABLE)", async () => {
    // Своп 1↔2: при обычном UNIQUE первый UPDATE упал бы сразу на дубле.
    await prisma.$transaction(async (tx) => {
      await tx.phase.update({ where: { id: phaseA }, data: { order: 2 } });
      await tx.phase.update({ where: { id: phaseB }, data: { order: 1 } });
    });

    const orders = Object.fromEntries(
      (await prisma.phase.findMany({ select: { id: true, order: true } })).map((p) => [p.id, p.order]),
    );
    expect(orders[phaseA]).toBe(2);
    expect(orders[phaseB]).toBe(1);
  });

  it("транзакция, коммитящаяся с настоящим дублем order, падает НА COMMIT", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.phase.update({ where: { id: phaseB }, data: { order: 1 } });
      }),
    ).rejects.toThrow();

    // Откат целостен — order фаз не изменился.
    const b = await prisma.phase.findUnique({ where: { id: phaseB }, select: { order: true } });
    expect(b?.order).toBe(2);
  });

  it("вне транзакции дубль order отвергается сразу (констрейнт реально включён)", async () => {
    await expect(makePhase("c", 1)).rejects.toThrow();
  });

  it("одинаковый order в РАЗНЫХ воркспейсах разрешён (уникальность скоуплена)", async () => {
    const org = await prisma.organization.create({ data: { name: "Org2" } });
    const other = await prisma.workspace.create({ data: { orgId: org.id, name: "Board2" } });

    await expect(
      prisma.phase.create({
        data: { workspaceId: other.id, key: "a", name: { en: "a" }, type: "OPEN", order: 1 },
      }),
    ).resolves.toBeDefined();
  });
});
