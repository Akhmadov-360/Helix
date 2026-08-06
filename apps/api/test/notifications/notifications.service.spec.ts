import type { Queue } from "bullmq";
import { describe, expect, it, vi } from "vitest";
import { LEAD_CREATED_JOB, type LeadCreatedJobData } from "../../src/modules/notifications/lead-created-job";
import { NotificationsService } from "../../src/modules/notifications/notifications.service";

// §2 P4-порядок: enqueue вызывается ПОСЛЕ коммита мутации — падение здесь не должно
// откатывать/проваливать создание лида. Проверяем контракт напрямую: сбой Queue.add
// не долетает наружу как исключение.
describe("NotificationsService.enqueueLeadCreated", () => {
  it("зовёт queue.add с правильным job-именем/данными/retry-опциями", async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    const service = new NotificationsService({ add } as unknown as Queue<LeadCreatedJobData>);

    await service.enqueueLeadCreated({ orgId: "org-1", projectId: "proj-1" });

    expect(add).toHaveBeenCalledWith(
      LEAD_CREATED_JOB,
      { orgId: "org-1", projectId: "proj-1" },
      { attempts: 5, backoff: { type: "exponential", delay: 30_000 } },
    );
  });

  it("queue.add бросает → enqueueLeadCreated не пробрасывает исключение", async () => {
    const add = vi.fn().mockRejectedValue(new Error("redis down"));
    const service = new NotificationsService({ add } as unknown as Queue<LeadCreatedJobData>);

    await expect(service.enqueueLeadCreated({ orgId: "org-1", projectId: "proj-1" })).resolves.toBeUndefined();
  });
});
