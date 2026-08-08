import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";
import { PrismaService } from "../../src/core/prisma/prisma.service";
import { InviteCleanupRepository } from "../../src/modules/maintenance/invite-cleanup.repository";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("InviteCleanupRepository.deleteStale", () => {
  let orgId: string;
  let userId: string;
  let repo: InviteCleanupRepository;

  beforeEach(async () => {
    const org = await prisma.organization.create({ data: { name: "Org" } });
    const user = await prisma.user.create({ data: { email: `invcleanup${Date.now()}@example.com`, name: "U", passwordHash: "x" } });
    orgId = org.id;
    userId = user.id;
    repo = new InviteCleanupRepository({ client: prisma } as unknown as PrismaService);
  });

  const create = (data: Partial<{ acceptedAt: Date; revokedAt: Date; expiresAt: Date; tokenHash: string }>) =>
    prisma.invite.create({
      data: {
        orgId,
        email: "invitee@example.com",
        role: "MEMBER",
        invitedByUserId: userId,
        tokenHash: data.tokenHash ?? `tok-${Math.random()}`,
        expiresAt: data.expiresAt ?? new Date(Date.now() + 7 * DAY_MS),
        acceptedAt: data.acceptedAt,
        revokedAt: data.revokedAt,
      },
    });

  it("pending инвайт (acceptedAt/revokedAt null, expiresAt в будущем) не трогает при реалистичном cutoff", async () => {
    await create({});
    const deleted = await repo.deleteStale(new Date(Date.now() - 90 * DAY_MS));
    expect(deleted).toBe(0);
    expect(await prisma.invite.count()).toBe(1);
  });

  it("accepted дольше cutoff → удаляется", async () => {
    await create({ acceptedAt: new Date(Date.now() - 100 * DAY_MS) });
    const cutoff = new Date(Date.now() - 90 * DAY_MS);
    expect(await repo.deleteStale(cutoff)).toBe(1);
    expect(await prisma.invite.count()).toBe(0);
  });

  it("accepted, но моложе cutoff (в окне retention) → НЕ удаляется", async () => {
    await create({ acceptedAt: new Date(Date.now() - 10 * DAY_MS) });
    const cutoff = new Date(Date.now() - 90 * DAY_MS);
    expect(await repo.deleteStale(cutoff)).toBe(0);
    expect(await prisma.invite.count()).toBe(1);
  });

  it("revoked дольше cutoff → удаляется", async () => {
    await create({ revokedAt: new Date(Date.now() - 100 * DAY_MS) });
    expect(await repo.deleteStale(new Date(Date.now() - 90 * DAY_MS))).toBe(1);
  });

  it("expiresAt в прошлом дольше cutoff (истёк, никогда не accepted/revoked) → удаляется", async () => {
    await create({ expiresAt: new Date(Date.now() - 100 * DAY_MS) });
    expect(await repo.deleteStale(new Date(Date.now() - 90 * DAY_MS))).toBe(1);
  });

  it("смешанный набор: удаляет только мёртвые-дольше-cutoff, pending оставляет", async () => {
    await create({ acceptedAt: new Date(Date.now() - 100 * DAY_MS) }); // удалить
    await create({}); // pending, оставить
    await create({ revokedAt: new Date(Date.now() - 5 * DAY_MS) }); // в окне retention, оставить
    const cutoff = new Date(Date.now() - 90 * DAY_MS);
    expect(await repo.deleteStale(cutoff)).toBe(1);
    expect(await prisma.invite.count()).toBe(2);
  });
});
