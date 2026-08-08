import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";
import { PrismaService } from "../../src/core/prisma/prisma.service";
import { REFRESH_SESSION_CLEANUP_BATCH_SIZE } from "../../src/modules/maintenance/refresh-session-cleanup-job";
import { RefreshSessionCleanupRepository } from "../../src/modules/maintenance/refresh-session-cleanup.repository";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("RefreshSessionCleanupRepository.deleteStale", () => {
  let userId: string;
  let repo: RefreshSessionCleanupRepository;

  beforeEach(async () => {
    const user = await prisma.user.create({ data: { email: `cleanup${Date.now()}@example.com`, name: "U", passwordHash: "x" } });
    userId = user.id;
    repo = new RefreshSessionCleanupRepository({ client: prisma } as unknown as PrismaService);
  });

  const create = (data: Partial<{ revokedAt: Date; usedAt: Date; expiresAt: Date; tokenHash: string }>) =>
    prisma.refreshSession.create({
      data: {
        userId,
        tokenHash: data.tokenHash ?? `tok-${Math.random()}`,
        familyId: "fam-1",
        expiresAt: data.expiresAt ?? new Date(Date.now() + 7 * DAY_MS),
        revokedAt: data.revokedAt,
        usedAt: data.usedAt,
      },
    });

  it("живую сессию (usedAt/revokedAt null, expiresAt в будущем) не трогает при реалистичном cutoff", async () => {
    await create({}); // expiresAt по умолчанию — через 7 дней
    const deleted = await repo.deleteStale(new Date(Date.now() - 30 * DAY_MS));
    expect(deleted).toBe(0);
    expect(await prisma.refreshSession.count()).toBe(1);
  });

  it("revoked дольше cutoff → удаляется", async () => {
    await create({ revokedAt: new Date(Date.now() - 40 * DAY_MS) });
    const cutoff = new Date(Date.now() - 30 * DAY_MS);
    expect(await repo.deleteStale(cutoff)).toBe(1);
    expect(await prisma.refreshSession.count()).toBe(0);
  });

  it("revoked, но моложе cutoff (в окне retention) → НЕ удаляется", async () => {
    await create({ revokedAt: new Date(Date.now() - 10 * DAY_MS) });
    const cutoff = new Date(Date.now() - 30 * DAY_MS);
    expect(await repo.deleteStale(cutoff)).toBe(0);
    expect(await prisma.refreshSession.count()).toBe(1);
  });

  it("usedAt дольше cutoff (ротирована и забыта) → удаляется", async () => {
    await create({ usedAt: new Date(Date.now() - 40 * DAY_MS) });
    expect(await repo.deleteStale(new Date(Date.now() - 30 * DAY_MS))).toBe(1);
  });

  it("expiresAt в прошлом дольше cutoff (истекла, revoke/use не было) → удаляется", async () => {
    await create({ expiresAt: new Date(Date.now() - 40 * DAY_MS) });
    expect(await repo.deleteStale(new Date(Date.now() - 30 * DAY_MS))).toBe(1);
  });

  it("смешанный набор: удаляет только мёртвые-дольше-cutoff, живую оставляет", async () => {
    await create({ revokedAt: new Date(Date.now() - 40 * DAY_MS) }); // удалить
    await create({}); // живая, оставить
    await create({ revokedAt: new Date(Date.now() - 5 * DAY_MS) }); // в окне retention, оставить
    const cutoff = new Date(Date.now() - 30 * DAY_MS);
    expect(await repo.deleteStale(cutoff)).toBe(1);
    expect(await prisma.refreshSession.count()).toBe(2);
  });

  // Батчинг (EXPLAIN-обоснование в refresh-session-cleanup-job.ts): проверяем, что цикл
  // findMany→deleteMany реально проходит НЕСКОЛЬКО итераций и не останавливается на первой
  // (BATCH_SIZE+1 строк — минимум 2 батча), и не оставляет "хвост" ровно на границе размера батча.
  it("больше одного батча: удаляет ВСЕ мёртвые строки, не только первый BATCH_SIZE", async () => {
    const deadAt = new Date(Date.now() - 40 * DAY_MS);
    const total = REFRESH_SESSION_CLEANUP_BATCH_SIZE + 137;
    await prisma.refreshSession.createMany({
      data: Array.from({ length: total }, (_, i) => ({
        userId,
        tokenHash: `batch-tok-${i}`,
        familyId: "fam-batch",
        expiresAt: new Date(Date.now() + 7 * DAY_MS),
        revokedAt: deadAt,
      })),
    });

    const deleted = await repo.deleteStale(new Date(Date.now() - 30 * DAY_MS));

    expect(deleted).toBe(total);
    expect(await prisma.refreshSession.count()).toBe(0);
  });
});
