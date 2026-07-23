import { Injectable } from "@nestjs/common";
import type { Prisma } from "@helix/db";
import type { CreatePhaseInput, PhaseResponse, UpdatePhaseInput } from "@helix/api-schemas";
import { ResourceNotFoundError } from "../../core/errors/domain-error";
import { PrismaService } from "../../core/prisma/prisma.service";
import { ensureUniquePhaseKey, generatePhaseKeyBase } from "../phases/phase-key";
import { toPhaseResponse } from "../phases/phase.mapper";
import { PhasesRepository } from "../phases/phases.repository";
import { WorkspacesRepository } from "./workspaces.repository";

@Injectable()
export class PhasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaces: WorkspacesRepository,
    private readonly phases: PhasesRepository,
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
}
