import { describe, expect, it, vi } from "vitest";
import { ATTACHMENT_CLEANUP_JOB } from "../../src/modules/maintenance/attachment-cleanup-job";
import {
  ATTACHMENT_UPLOAD_CLEANUP_JOB,
  ATTACHMENT_UPLOAD_CLEANUP_RETENTION_HOURS,
} from "../../src/modules/maintenance/attachment-upload-cleanup-job";
import { INVITE_CLEANUP_JOB, INVITE_RETENTION_DAYS } from "../../src/modules/maintenance/invite-cleanup-job";
import type { InviteCleanupRepository } from "../../src/modules/maintenance/invite-cleanup.repository";
import { MaintenanceWorker } from "../../src/modules/maintenance/maintenance.worker";
import { REFRESH_SESSION_CLEANUP_JOB, REFRESH_SESSION_RETENTION_DAYS } from "../../src/modules/maintenance/refresh-session-cleanup-job";
import type { RefreshSessionCleanupRepository } from "../../src/modules/maintenance/refresh-session-cleanup.repository";
import type { AttachmentsRepository } from "../../src/modules/attachments/attachments.repository";
import type { S3Service } from "../../src/core/storage/s3.service";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function expectCutoffWithinWindow(cutoff: Date, retentionMs: number, before: number, after: number): void {
  expect(cutoff.getTime()).toBeGreaterThanOrEqual(before - retentionMs);
  expect(cutoff.getTime()).toBeLessThanOrEqual(after - retentionMs);
}

function makeWorker(overrides?: {
  refreshSessionDeleteStale?: ReturnType<typeof vi.fn>;
  inviteDeleteStale?: ReturnType<typeof vi.fn>;
  findStaleUnconfirmed?: ReturnType<typeof vi.fn>;
  deleteMany?: ReturnType<typeof vi.fn>;
  deleteObject?: ReturnType<typeof vi.fn>;
  deleteObjects?: ReturnType<typeof vi.fn>;
}) {
  const refreshSessions = { deleteStale: overrides?.refreshSessionDeleteStale ?? vi.fn().mockResolvedValue(0) };
  const invites = { deleteStale: overrides?.inviteDeleteStale ?? vi.fn().mockResolvedValue(0) };
  const attachments = {
    findStaleUnconfirmed: overrides?.findStaleUnconfirmed ?? vi.fn().mockResolvedValue([]),
    deleteMany: overrides?.deleteMany ?? vi.fn().mockResolvedValue(0),
  };
  const s3 = {
    deleteObject: overrides?.deleteObject ?? vi.fn().mockResolvedValue(undefined),
    deleteObjects: overrides?.deleteObjects ?? vi.fn().mockResolvedValue(undefined),
  };
  const worker = new MaintenanceWorker(
    refreshSessions as unknown as RefreshSessionCleanupRepository,
    invites as unknown as InviteCleanupRepository,
    attachments as unknown as AttachmentsRepository,
    s3 as unknown as S3Service,
  );
  return { worker, refreshSessions, invites, attachments, s3 };
}

describe("MaintenanceWorker.process — диспетч по job.name (одна очередь, несколько джоб)", () => {
  it(`job.name === "${REFRESH_SESSION_CLEANUP_JOB}" → refresh-session cleanup, не остальные`, async () => {
    const { worker, refreshSessions, invites } = makeWorker();
    const before = Date.now();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await worker.process({ name: REFRESH_SESSION_CLEANUP_JOB } as any);
    const after = Date.now();

    expect(refreshSessions.deleteStale).toHaveBeenCalledTimes(1);
    expect(invites.deleteStale).not.toHaveBeenCalled();
    expectCutoffWithinWindow(
      refreshSessions.deleteStale.mock.calls[0]![0] as Date,
      REFRESH_SESSION_RETENTION_DAYS * DAY_MS,
      before,
      after,
    );
  });

  it(`job.name === "${INVITE_CLEANUP_JOB}" → invite cleanup, не refresh-session`, async () => {
    const { worker, refreshSessions, invites } = makeWorker();
    const before = Date.now();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await worker.process({ name: INVITE_CLEANUP_JOB } as any);
    const after = Date.now();

    expect(invites.deleteStale).toHaveBeenCalledTimes(1);
    expect(refreshSessions.deleteStale).not.toHaveBeenCalled();
    expectCutoffWithinWindow(invites.deleteStale.mock.calls[0]![0] as Date, INVITE_RETENTION_DAYS * DAY_MS, before, after);
  });

  it(`job.name === "${ATTACHMENT_CLEANUP_JOB}" → batch-удаление переданных storage keys из S3`, async () => {
    const { worker, s3 } = makeWorker();
    await worker.process({
      name: ATTACHMENT_CLEANUP_JOB,
      data: { storageKeys: ["org/proj/a1/file.pdf", "org/proj/a2/file.png"] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    expect(s3.deleteObjects).toHaveBeenCalledWith(["org/proj/a1/file.pdf", "org/proj/a2/file.png"]);
  });

  it(`job.name === "${ATTACHMENT_UPLOAD_CLEANUP_JOB}" → чистит объект (best-effort) и строку по каждой неподтверждённой загрузке`, async () => {
    const findStaleUnconfirmed = vi.fn().mockResolvedValue([
      { id: "att1", storageKey: "org/proj/att1/a.pdf" },
      { id: "att2", storageKey: "org/proj/att2/b.pdf" },
    ]);
    const deleteMany = vi.fn().mockResolvedValue(2);
    const deleteObject = vi.fn().mockResolvedValue(undefined);
    const { worker } = makeWorker({ findStaleUnconfirmed, deleteMany, deleteObject });

    const before = Date.now();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await worker.process({ name: ATTACHMENT_UPLOAD_CLEANUP_JOB } as any);
    const after = Date.now();

    expect(deleteObject).toHaveBeenCalledWith("org/proj/att1/a.pdf");
    expect(deleteObject).toHaveBeenCalledWith("org/proj/att2/b.pdf");
    expect(deleteMany).toHaveBeenCalledWith(["att1", "att2"]);
    expectCutoffWithinWindow(
      findStaleUnconfirmed.mock.calls[0]![0] as Date,
      ATTACHMENT_UPLOAD_CLEANUP_RETENTION_HOURS * HOUR_MS,
      before,
      after,
    );
  });

  it(`job.name === "${ATTACHMENT_UPLOAD_CLEANUP_JOB}" → объект отсутствует в S3 (best-effort) не мешает удалить строку`, async () => {
    const findStaleUnconfirmed = vi.fn().mockResolvedValue([{ id: "att1", storageKey: "org/proj/att1/a.pdf" }]);
    const deleteMany = vi.fn().mockResolvedValue(1);
    const deleteObject = vi.fn().mockRejectedValue(new Error("NotFound"));
    const { worker } = makeWorker({ findStaleUnconfirmed, deleteMany, deleteObject });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await worker.process({ name: ATTACHMENT_UPLOAD_CLEANUP_JOB } as any);

    expect(deleteMany).toHaveBeenCalledWith(["att1"]);
  });

  it("неизвестное job.name → бросает (нет молчаливого default-фолбэка на первую джобу)", async () => {
    const { worker } = makeWorker();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(worker.process({ name: "something.unexpected" } as any)).rejects.toThrow();
  });
});
