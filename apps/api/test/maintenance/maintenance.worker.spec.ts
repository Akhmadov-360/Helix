import { describe, expect, it, vi } from "vitest";
import { INVITE_CLEANUP_JOB, INVITE_RETENTION_DAYS } from "../../src/modules/maintenance/invite-cleanup-job";
import type { InviteCleanupRepository } from "../../src/modules/maintenance/invite-cleanup.repository";
import { MaintenanceWorker } from "../../src/modules/maintenance/maintenance.worker";
import { REFRESH_SESSION_CLEANUP_JOB, REFRESH_SESSION_RETENTION_DAYS } from "../../src/modules/maintenance/refresh-session-cleanup-job";
import type { RefreshSessionCleanupRepository } from "../../src/modules/maintenance/refresh-session-cleanup.repository";

const DAY_MS = 24 * 60 * 60 * 1000;

function expectCutoffWithinWindow(cutoff: Date, retentionDays: number, before: number, after: number): void {
  const expectedMs = retentionDays * DAY_MS;
  expect(cutoff.getTime()).toBeGreaterThanOrEqual(before - expectedMs);
  expect(cutoff.getTime()).toBeLessThanOrEqual(after - expectedMs);
}

describe("MaintenanceWorker.process — диспетч по job.name (одна очередь, несколько джоб)", () => {
  it("job без имени (default) → refresh-session cleanup", async () => {
    const deleteStale = vi.fn().mockResolvedValue(3);
    const inviteDeleteStale = vi.fn().mockResolvedValue(0);
    const worker = new MaintenanceWorker(
      { deleteStale } as unknown as RefreshSessionCleanupRepository,
      { deleteStale: inviteDeleteStale } as unknown as InviteCleanupRepository,
    );

    const before = Date.now();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await worker.process({ name: REFRESH_SESSION_CLEANUP_JOB } as any);
    const after = Date.now();

    expect(deleteStale).toHaveBeenCalledTimes(1);
    expect(inviteDeleteStale).not.toHaveBeenCalled();
    expectCutoffWithinWindow(deleteStale.mock.calls[0]![0] as Date, REFRESH_SESSION_RETENTION_DAYS, before, after);
  });

  it(`job.name === "${INVITE_CLEANUP_JOB}" → invite cleanup, не refresh-session`, async () => {
    const deleteStale = vi.fn().mockResolvedValue(0);
    const inviteDeleteStale = vi.fn().mockResolvedValue(5);
    const worker = new MaintenanceWorker(
      { deleteStale } as unknown as RefreshSessionCleanupRepository,
      { deleteStale: inviteDeleteStale } as unknown as InviteCleanupRepository,
    );

    const before = Date.now();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await worker.process({ name: INVITE_CLEANUP_JOB } as any);
    const after = Date.now();

    expect(inviteDeleteStale).toHaveBeenCalledTimes(1);
    expect(deleteStale).not.toHaveBeenCalled();
    expectCutoffWithinWindow(inviteDeleteStale.mock.calls[0]![0] as Date, INVITE_RETENTION_DAYS, before, after);
  });
});
