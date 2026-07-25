import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";
import type { ProjectEvent } from "@helix/api-schemas";
import { ActivityRecorder } from "../../src/modules/activity/activity-recorder";

const recorder = new ActivityRecorder();

describe("ActivityRecorder — P4 (событие атомарно с мутацией)", () => {
  let orgId: string;
  let workspaceId: string;
  let phaseAId: string;
  let phaseBId: string;

  beforeEach(async () => {
    const org = await prisma.organization.create({ data: { name: "Org" } });
    const ws = await prisma.workspace.create({ data: { orgId: org.id, name: "Board" } });
    const a = await prisma.phase.create({
      data: { workspaceId: ws.id, key: "a", name: { en: "A" }, type: "OPEN", order: 1 },
    });
    const b = await prisma.phase.create({
      data: { workspaceId: ws.id, key: "b", name: { en: "B" }, type: "OPEN", order: 2 },
    });
    orgId = org.id;
    workspaceId = ws.id;
    phaseAId = a.id;
    phaseBId = b.id;
  });

  const createdEvent: ProjectEvent = {
    type: "project.created",
    schemaVersion: 1,
    payload: { actorName: "Асад" },
  };

  it("успешная транзакция → и проект, и событие записаны", async () => {
    await prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: { orgId, workspaceId, phaseId: phaseAId, title: "Lead", rank: "a0" },
      });
      await recorder.record(tx, { orgId, projectId: project.id, actorId: null, event: createdEvent });
    });

    expect(await prisma.project.count()).toBe(1);
    expect(await prisma.activityEvent.count()).toBe(1);
  });

  it("откат мутации → события НЕТ (P4)", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        const project = await tx.project.create({
          data: { orgId, workspaceId, phaseId: phaseAId, title: "Lead", rank: "a0" },
        });
        await recorder.record(tx, { orgId, projectId: project.id, actorId: null, event: createdEvent });
        throw new Error("boom"); // бизнес-мутация упала после записи события
      }),
    ).rejects.toThrow("boom");

    // Событие не «повисло» отдельно от отката — оно в той же транзакции.
    expect(await prisma.activityEvent.count()).toBe(0);
    expect(await prisma.project.count()).toBe(0);
  });

  it("кривой payload отвергается на входе (funnel валидирует форму)", async () => {
    const project = await prisma.project.create({
      data: { orgId, workspaceId, phaseId: phaseAId, title: "Lead", rank: "a0" },
    });
    const bad = { type: "project.moved", schemaVersion: 1, payload: { actorName: "x" } } as ProjectEvent;

    await expect(
      prisma.$transaction((tx) =>
        recorder.record(tx, { orgId, projectId: project.id, actorId: null, event: bad }),
      ),
    ).rejects.toThrow();
    expect(await prisma.activityEvent.count()).toBe(0);
  });

  it("событие ПЕРЕЖИВАЕТ удаление фазы — payload-снапшот, без живого FK (P2)", async () => {
    // Проект в фазе B; событие снапшотит фазу A (from) и B (to). Фаза A пуста → удаляема.
    const project = await prisma.project.create({
      data: { orgId, workspaceId, phaseId: phaseBId, title: "Lead", rank: "a0" },
    });
    const moved: ProjectEvent = {
      type: "project.moved",
      schemaVersion: 1,
      payload: {
        fromPhaseKey: "a",
        fromPhaseName: { en: "A" },
        toPhaseKey: "b",
        toPhaseName: { en: "B" },
        actorName: "Асад",
      },
    };
    await prisma.$transaction((tx) =>
      recorder.record(tx, { orgId, projectId: project.id, actorId: null, event: moved }),
    );

    await prisma.phase.delete({ where: { id: phaseAId } }); // фаза-источник удалена

    const event = await prisma.activityEvent.findFirst();
    const payload = event?.payload as { fromPhaseKey: string; fromPhaseName: { en: string } };
    expect(payload.fromPhaseKey).toBe("a");
    expect(payload.fromPhaseName.en).toBe("A"); // снапшот цел, FK на Phase нет
  });
});
