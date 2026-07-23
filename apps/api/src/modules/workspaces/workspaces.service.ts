import { Injectable } from "@nestjs/common";
import type { Prisma } from "@helix/db";
import type {
  CreateWorkspaceInput,
  LocalizedName,
  PhaseResponse,
  WorkspaceResponse,
} from "@helix/api-schemas";
import { ResourceNotFoundError } from "../../core/errors/domain-error";
import { PrismaService } from "../../core/prisma/prisma.service";
import { toPhaseResponse } from "../phases/phase.mapper";
import { PhasesRepository } from "../phases/phases.repository";
import { WorkspacesRepository } from "./workspaces.repository";

// Дефолтный минимальный набор (§10, вариант B): доска сразу рабочая — есть куда класть
// лид и есть WON/LOST-фаза, без которой status не станет WON. Блюпринты (M2) заменят.
// key статичен и уникален по построению — генератор слагов не нужен (он придёт с POST /phases).
const DEFAULT_PHASES: ReadonlyArray<{ key: string; name: LocalizedName; type: "OPEN" | "WON" | "LOST" }> = [
  { key: "lead", name: { en: "Lead" }, type: "OPEN" },
  { key: "in-progress", name: { en: "In Progress" }, type: "OPEN" },
  { key: "won", name: { en: "Won" }, type: "WON" },
  { key: "lost", name: { en: "Lost" }, type: "LOST" },
];

interface WorkspaceRow {
  id: string;
  name: string;
  audience: WorkspaceResponse["audience"];
  settings: Prisma.JsonValue;
  version: number;
  createdAt: Date;
}

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaces: WorkspacesRepository,
    private readonly phases: PhasesRepository,
  ) {}

  async create(orgId: string, input: CreateWorkspaceInput): Promise<WorkspaceResponse> {
    // Доска с половиной фаз недопустима → воркспейс и дефолтные фазы в одной транзакции.
    const full = await this.prisma.client.$transaction(async (tx) => {
      const ws = await this.workspaces.create(
        {
          orgId,
          name: input.name,
          audience: input.audience,
          settings: input.settings as Prisma.InputJsonValue | undefined,
        },
        tx,
      );
      await this.phases.createMany(
        DEFAULT_PHASES.map((p, i) => ({
          workspaceId: ws.id,
          key: p.key,
          name: p.name,
          type: p.type,
          order: i + 1,
        })),
        tx,
      );
      return this.workspaces.findByIdInOrg(ws.id, orgId, tx);
    });

    if (!full) throw new Error("workspace vanished within its own creation transaction");
    return toWorkspaceResponse(full, { phases: full.phases.map(toPhaseResponse) });
  }

  async list(orgId: string): Promise<WorkspaceResponse[]> {
    const rows = await this.workspaces.listByOrg(orgId);
    return rows.map((w) => toWorkspaceResponse(w, { phaseCount: w._count.phases }));
  }

  async getById(orgId: string, id: string): Promise<WorkspaceResponse> {
    const ws = await this.workspaces.findByIdInOrg(id, orgId);
    if (!ws) throw new ResourceNotFoundError("Workspace not found");
    return toWorkspaceResponse(ws, { phases: ws.phases.map(toPhaseResponse) });
  }
}

function toWorkspaceResponse(
  w: WorkspaceRow,
  extra: { phases?: PhaseResponse[]; phaseCount?: number },
): WorkspaceResponse {
  return {
    id: w.id,
    name: w.name,
    audience: w.audience,
    settings: (w.settings ?? {}) as Record<string, unknown>,
    version: w.version,
    createdAt: w.createdAt.toISOString(),
    ...(extra.phases ? { phases: extra.phases } : {}),
    ...(extra.phaseCount !== undefined ? { phaseCount: extra.phaseCount } : {}),
  };
}
