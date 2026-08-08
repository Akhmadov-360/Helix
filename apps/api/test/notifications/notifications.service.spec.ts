import type { Queue } from "bullmq";
import { describe, expect, it, vi } from "vitest";
import { LEAD_CREATED_JOB } from "../../src/modules/notifications/lead-created-job";
import { NotificationsService, type EmailJobData } from "../../src/modules/notifications/notifications.service";

// §2 P4-порядок: enqueue вызывается ПОСЛЕ коммита мутации — падение здесь не должно
// откатывать/проваливать создание лида. Проверяем контракт напрямую: сбой Queue.add
// не долетает наружу как исключение.
describe("NotificationsService.enqueueLeadCreated", () => {
  it("зовёт queue.add с правильным job-именем/данными/retry-опциями", async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    const service = new NotificationsService({ add } as unknown as Queue<EmailJobData>);

    await service.enqueueLeadCreated({ orgId: "org-1", projectId: "proj-1" });

    expect(add).toHaveBeenCalledWith(
      LEAD_CREATED_JOB,
      { orgId: "org-1", projectId: "proj-1" },
      { attempts: 5, backoff: { type: "exponential", delay: 30_000 } },
    );
  });

  it("queue.add бросает → enqueueLeadCreated не пробрасывает исключение", async () => {
    const add = vi.fn().mockRejectedValue(new Error("redis down"));
    const service = new NotificationsService({ add } as unknown as Queue<EmailJobData>);

    await expect(service.enqueueLeadCreated({ orgId: "org-1", projectId: "proj-1" })).resolves.toBeUndefined();
  });
});

describe("NotificationsService.enqueueAssignment", () => {
  it("зовёт queue.add с job-именем project.assigned и не пробрасывает исключение при сбое", async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    const service = new NotificationsService({ add } as unknown as Queue<EmailJobData>);

    await service.enqueueAssignment({ orgId: "org-1", projectId: "proj-1", userId: "user-1" });

    expect(add).toHaveBeenCalledWith(
      "project.assigned",
      { orgId: "org-1", projectId: "proj-1", userId: "user-1" },
      { attempts: 5, backoff: { type: "exponential", delay: 30_000 } },
    );

    const failing = vi.fn().mockRejectedValue(new Error("redis down"));
    const failingService = new NotificationsService({ add: failing } as unknown as Queue<EmailJobData>);
    await expect(
      failingService.enqueueAssignment({ orgId: "org-1", projectId: "proj-1", userId: "user-1" }),
    ).resolves.toBeUndefined();
  });
});

describe("NotificationsService.enqueuePhaseChanged", () => {
  it("зовёт queue.add с job-именем project.phase_changed и не пробрасывает исключение при сбое", async () => {
    const data = { orgId: "org-1", projectId: "proj-1", actorId: "user-1", fromPhaseId: "phase-a", toPhaseId: "phase-b" };
    const add = vi.fn().mockResolvedValue(undefined);
    const service = new NotificationsService({ add } as unknown as Queue<EmailJobData>);

    await service.enqueuePhaseChanged(data);

    expect(add).toHaveBeenCalledWith(
      "project.phase_changed",
      data,
      { attempts: 5, backoff: { type: "exponential", delay: 30_000 } },
    );

    const failing = vi.fn().mockRejectedValue(new Error("redis down"));
    const failingService = new NotificationsService({ add: failing } as unknown as Queue<EmailJobData>);
    await expect(failingService.enqueuePhaseChanged(data)).resolves.toBeUndefined();
  });
});

describe("NotificationsService.enqueueOrgInvite", () => {
  it("зовёт queue.add с job-именем org.invite и не пробрасывает исключение при сбое", async () => {
    const data = { email: "a@example.com", orgName: "Acme", inviterName: "Jane", role: "MEMBER" as const, token: "raw-token" };
    const add = vi.fn().mockResolvedValue(undefined);
    const service = new NotificationsService({ add } as unknown as Queue<EmailJobData>);

    await service.enqueueOrgInvite(data);

    expect(add).toHaveBeenCalledWith(
      "org.invite",
      data,
      { attempts: 5, backoff: { type: "exponential", delay: 30_000 } },
    );

    const failing = vi.fn().mockRejectedValue(new Error("redis down"));
    const failingService = new NotificationsService({ add: failing } as unknown as Queue<EmailJobData>);
    await expect(failingService.enqueueOrgInvite(data)).resolves.toBeUndefined();
  });
});

describe("NotificationsService.enqueuePasswordReset", () => {
  it("зовёт queue.add с job-именем password.reset и не пробрасывает исключение при сбое", async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    const service = new NotificationsService({ add } as unknown as Queue<EmailJobData>);

    await service.enqueuePasswordReset({ email: "a@example.com", name: "A", token: "raw-token" });

    expect(add).toHaveBeenCalledWith(
      "password.reset",
      { email: "a@example.com", name: "A", token: "raw-token" },
      { attempts: 5, backoff: { type: "exponential", delay: 30_000 } },
    );

    const failing = vi.fn().mockRejectedValue(new Error("redis down"));
    const failingService = new NotificationsService({ add: failing } as unknown as Queue<EmailJobData>);
    await expect(
      failingService.enqueuePasswordReset({ email: "a@example.com", name: "A", token: "raw-token" }),
    ).resolves.toBeUndefined();
  });
});
