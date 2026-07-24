import { Injectable } from "@nestjs/common";
import type { Prisma } from "@helix/db";
import type { CreatePhaseInput, PhaseResponse, UpdatePhaseInput } from "@helix/api-schemas";
import {
  InvalidReassignTargetError,
  PhaseNotEmptyError,
  ResourceNotFoundError,
} from "../../core/errors/domain-error";
import { PrismaService } from "../../core/prisma/prisma.service";
import { ensureUniquePhaseKey, generatePhaseKeyBase } from "../phases/phase-key";
import { toPhaseResponse } from "../phases/phase.mapper";
import { PhasesRepository } from "../phases/phases.repository";
import { ProjectsRepository } from "../projects/projects.repository";
import { WorkspacesRepository } from "./workspaces.repository";

@Injectable()
export class PhasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaces: WorkspacesRepository,
    private readonly phases: PhasesRepository,
    private readonly projects: ProjectsRepository,
  ) {}

  // Новая фаза всегда в конец (§5): order = max+1. version++ доски (§4). Всё в транзакции —
  // между чтением max(order)/ключей и вставкой не должно быть окна.
  async add(orgId: string, workspaceId: string, input: CreatePhaseInput): Promise<PhaseResponse> {
    return this.prisma.client.$transaction(async (tx) => {
      const ws = await this.workspaces.findByIdInOrg(workspaceId, orgId, tx);
      if (!ws) throw new ResourceNotFoundError("Workspace not found");

      const taken = new Set(ws.phases.map((p) => p.key));
      const maxOrder = ws.phases.reduce((max, p) => Math.max(max, p.order), 0);
      const key = ensureUniquePhaseKey(generatePhaseKeyBase(input.name), taken);

      const phase = await this.phases.create(
        {
          workspaceId,
          key,
          name: input.name as Prisma.InputJsonValue,
          type: input.type,
          order: maxOrder + 1,
          color: input.color,
        },
        tx,
      );
      await this.workspaces.bumpVersion(workspaceId, tx);
      return toPhaseResponse(phase);
    });
  }

  // Меняются только name/type/color. key иммутабелен, order — только через reorder;
  // оба отсутствуют в UpdatePhaseSchema, поэтому дойти сюда не могут. version НЕ трогаем:
  // атрибуты фазы — не состав/порядок доски (§4).
  async update(orgId: string, id: string, input: UpdatePhaseInput): Promise<PhaseResponse> {
    const existing = await this.phases.findByIdInOrg(id, orgId);
    if (!existing) throw new ResourceNotFoundError("Phase not found");

    const updated = await this.phases.update(id, {
      name: input.name as Prisma.InputJsonValue | undefined,
      type: input.type,
      color: input.color,
    });
    return toPhaseResponse(updated);
  }

  // Удаление с переносом проектов В ТОЙ ЖЕ транзакции (§6): между «перенести» и
  // «удалить» не должно быть окна, в котором кто-то создаст лид в удаляемой фазе.
  // onDelete: Restrict на стороне Project — страховка БД, если сервис ошибётся.
  async remove(orgId: string, id: string, reassignTo?: string): Promise<void> {
    await this.prisma.client.$transaction(async (tx) => {
      const phase = await this.phases.findByIdInOrg(id, orgId, tx);
      if (!phase) throw new ResourceNotFoundError("Phase not found");

      if ((await this.projects.countByPhase(id, tx)) > 0) {
        if (!reassignTo) {
          const candidates = (await this.phases.listByWorkspaceOrdered(phase.workspaceId, tx))
            .filter((p) => p.id !== id)
            .map(toPhaseResponse);
          throw new PhaseNotEmptyError(candidates);
        }
        if (reassignTo === id) throw new InvalidReassignTargetError();
        const target = await this.phases.findByIdInOrg(reassignTo, orgId, tx);
        if (!target || target.workspaceId !== phase.workspaceId) {
          throw new InvalidReassignTargetError();
        }
        await this.projects.reassignPhase(id, reassignTo, tx);
      }

      await this.phases.delete(id, tx);

      // Уплотняем оставшиеся в 1..n (удаление оставило дырку).
      const remaining = await this.phases.listByWorkspaceOrdered(phase.workspaceId, tx);
      for (const [index, p] of remaining.entries()) {
        if (p.order !== index + 1) await this.phases.setOrder(p.id, index + 1, tx);
      }

      await this.workspaces.bumpVersion(phase.workspaceId, tx);
    });
  }
}
