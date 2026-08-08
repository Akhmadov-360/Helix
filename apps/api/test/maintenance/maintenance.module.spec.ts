import type { INestApplication } from "@nestjs/common";
import { getQueueToken } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MAINTENANCE_QUEUE } from "../../src/core/queue/queue.module";
import { INVITE_CLEANUP_JOB } from "../../src/modules/maintenance/invite-cleanup-job";
import { REFRESH_SESSION_CLEANUP_JOB } from "../../src/modules/maintenance/refresh-session-cleanup-job";
import { createTestApp } from "../helpers/create-test-app";

// MaintenanceModule.onModuleInit регистрирует repeatable job при старте приложения (§ доки модуля) —
// проверяем, что она реально появляется в BullMQ, а не просто что код не бросает исключение.
describe("MaintenanceModule — регистрация repeatable job на старте", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("refresh-session.cleanup зарегистрирован с cron-паттерном раз в сутки", async () => {
    const queue = app.get<Queue>(getQueueToken(MAINTENANCE_QUEUE));
    const repeatable = await queue.getRepeatableJobs();

    const job = repeatable.find((j) => j.name === REFRESH_SESSION_CLEANUP_JOB);
    expect(job).toBeDefined();
    expect(job?.pattern).toBe("0 3 * * *");
  });

  it("invite.cleanup зарегистрирован отдельным repeatable job (invites.md §11)", async () => {
    const queue = app.get<Queue>(getQueueToken(MAINTENANCE_QUEUE));
    const repeatable = await queue.getRepeatableJobs();

    const job = repeatable.find((j) => j.name === INVITE_CLEANUP_JOB);
    expect(job).toBeDefined();
    expect(job?.pattern).toBe("0 4 * * *");
  });

  it("повторная инициализация (эмуляция рестарта) не плодит дубликат ни для одной из джоб", async () => {
    const queue = app.get<Queue>(getQueueToken(MAINTENANCE_QUEUE));
    await queue.add(REFRESH_SESSION_CLEANUP_JOB, {}, { repeat: { pattern: "0 3 * * *" }, jobId: REFRESH_SESSION_CLEANUP_JOB });
    await queue.add(INVITE_CLEANUP_JOB, {}, { repeat: { pattern: "0 4 * * *" }, jobId: INVITE_CLEANUP_JOB });

    const repeatable = await queue.getRepeatableJobs();
    expect(repeatable.filter((j) => j.name === REFRESH_SESSION_CLEANUP_JOB)).toHaveLength(1);
    expect(repeatable.filter((j) => j.name === INVITE_CLEANUP_JOB)).toHaveLength(1);
  });
});
