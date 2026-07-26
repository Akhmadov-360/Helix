import {
  createTaskSchema,
  updateTaskSchema,
  taskResponseSchema,
  projectEventSchema,
} from "@helix/api-schemas";
import { describe, expect, it } from "vitest";

describe("Task contracts (§2/§7)", () => {
  describe("createTaskSchema", () => {
    it("требует непустой title; dueAt/assigneeId опциональны", () => {
      expect(createTaskSchema.safeParse({ title: "T" }).success).toBe(true);
      expect(createTaskSchema.safeParse({ title: "  " }).success).toBe(false);
      expect(createTaskSchema.safeParse({}).success).toBe(false);
    });

    it("dueAt коэрсится из ISO-строки в Date", () => {
      const parsed = createTaskSchema.parse({ title: "T", dueAt: "2026-09-20T12:00:00.000Z" });
      expect(parsed.dueAt).toBeInstanceOf(Date);
    });
  });

  describe("updateTaskSchema — .strict() + nullable (§2)", () => {
    it("done в теле → 400 (strict unknown key, НЕ тихо проигнорирован)", () => {
      expect(updateTaskSchema.safeParse({ done: true }).success).toBe(false);
      expect(updateTaskSchema.safeParse({ title: "T", done: true }).success).toBe(false);
    });

    it("пустой объект → 400 (at-least-one)", () => {
      expect(updateTaskSchema.safeParse({}).success).toBe(false);
    });

    it("dueAt:null / assigneeId:null допустимы (очистка)", () => {
      expect(updateTaskSchema.safeParse({ dueAt: null }).success).toBe(true);
      expect(updateTaskSchema.safeParse({ assigneeId: null }).success).toBe(true);
    });
  });

  describe("taskResponseSchema", () => {
    it("overdue — часть контракта; internal-полей нет", () => {
      const parsed = taskResponseSchema.parse({
        id: "t1",
        projectId: "p1",
        title: "T",
        done: false,
        assigneeId: null,
        dueAt: null,
        overdue: false,
        orgId: "o1", // internal — отсекается
        createdAt: "2026-07-26T00:00:00.000Z",
        updatedAt: "2026-07-26T00:00:00.000Z",
      });
      expect(parsed.overdue).toBe(false);
      expect("orgId" in parsed).toBe(false);
    });
  });

  describe("task events (discriminated union)", () => {
    it("task.completed требует taskId + taskTitle снапшот", () => {
      const ok = projectEventSchema.safeParse({
        type: "task.completed",
        schemaVersion: 1,
        payload: { taskId: "t1", taskTitle: "Call", assigneeName: null, actorName: "Ivan" },
      });
      expect(ok.success).toBe(true);
    });

    it("task.completed с payload другого типа → отвергнут", () => {
      expect(
        projectEventSchema.safeParse({
          type: "task.completed",
          schemaVersion: 1,
          payload: { actorName: "Ivan" },
        }).success,
      ).toBe(false);
    });
  });
});
