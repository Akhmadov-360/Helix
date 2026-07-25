import { Injectable } from "@nestjs/common";
import type { Prisma } from "@helix/db";
import { auditEventSchema, type AuditEvent } from "@helix/api-schemas";

export interface RecordAuditInput {
  orgId: string;
  /** null = система/автоматизация (actor SetNull при удалении пользователя). */
  actorId: string | null;
  event: AuditEvent;
}

/**
 * Единая точка записи AuditLog (contacts.md §7.3) — аналог ActivityRecorder, но для org-уровневых
 * административных действий (merge и т.п.), не привязанных к проекту.
 *
 * P4: принимает транзакцию вызывающего → запись аудита атомарна с мутацией. Откат merge уносит
 * и запись. `parse` — единый funnel валидирует форму события перед записью в БД.
 */
@Injectable()
export class AuditRecorder {
  async record(tx: Prisma.TransactionClient, input: RecordAuditInput): Promise<void> {
    const event = auditEventSchema.parse(input.event);

    await tx.auditLog.create({
      data: {
        orgId: input.orgId,
        actorId: input.actorId,
        action: event.action,
        payload: { schemaVersion: event.schemaVersion, ...event.payload } as Prisma.InputJsonValue,
      },
    });
  }
}
