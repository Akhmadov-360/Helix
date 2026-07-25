import { Injectable } from "@nestjs/common";
import type { Prisma } from "@helix/db";
import { projectEventSchema, type ProjectEvent } from "@helix/api-schemas";

export interface RecordEventInput {
  orgId: string;
  projectId: string;
  /** null = система/автоматизация/ИИ (actor SetNull). Имя актора снапшотится в payload. */
  actorId: string | null;
  event: ProjectEvent;
}

/**
 * Единая точка записи ActivityEvent (decisions.md) — НЕ `activity.create` вразброс по сервисам.
 *
 * P4: принимает транзакцию вызывающего → событие атомарно с бизнес-мутацией. Откат мутации
 * уносит и событие. Побочные эффекты (email/webhook/embedding) — ПОСЛЕ коммита, не здесь.
 *
 * `parse` на входе: единый funnel заодно валидирует форму события (discriminated union),
 * поэтому в БД не попадёт кривой payload, даже если вызывающий скастовал типы.
 */
@Injectable()
export class ActivityRecorder {
  async record(tx: Prisma.TransactionClient, input: RecordEventInput): Promise<void> {
    const event = projectEventSchema.parse(input.event);

    await tx.activityEvent.create({
      data: {
        orgId: input.orgId,
        projectId: input.projectId,
        type: event.type,
        schemaVersion: event.schemaVersion,
        actorId: input.actorId,
        payload: event.payload as Prisma.InputJsonValue,
      },
    });
  }
}
