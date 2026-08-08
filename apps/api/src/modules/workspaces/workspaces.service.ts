import { Injectable } from "@nestjs/common";
import type { Prisma } from "@helix/db";
import type {
  BlueprintDefinition,
  CreateWorkspaceInput,
  LocalizedName,
  PhaseResponse,
  ReorderPhasesInput,
  UpdateWorkspaceInput,
  WorkspaceResponse,
} from "@helix/api-schemas";
import {
  InvalidPhaseSetError,
  ResourceNotFoundError,
  WorkspaceVersionConflictError,
} from "../../core/errors/domain-error";
import { PrismaService } from "../../core/prisma/prisma.service";
import { BlueprintsRepository } from "../blueprints/blueprints.repository";
import { FieldsRepository } from "../fields/fields.repository";
import { toPhaseResponse } from "../phases/phase.mapper";
import { PhasesRepository } from "../phases/phases.repository";
import { WorkspacesRepository } from "./workspaces.repository";

// Дефолтный минимальный набор (§10, вариант B): доска сразу рабочая — есть куда класть
// лид и есть WON/LOST-фаза, без которой status не станет WON. Блюпринты (M2) заменят.
// key статичен и уникален по построению — генератор слагов не нужен (он придёт с POST /phases).
const DEFAULT_PHASES: ReadonlyArray<{ key: string; name: LocalizedName; type: "OPEN" | "WON" | "LOST" }> = [
  { key: "lead", name: { en: "Lead", ru: "Лид", uz: "Lid" }, type: "OPEN" },
  { key: "in-progress", name: { en: "In Progress", ru: "В работе", uz: "Jarayonda" }, type: "OPEN" },
  { key: "won", name: { en: "Won", ru: "Выиграно", uz: "Yutildi" }, type: "WON" },
  { key: "lost", name: { en: "Lost", ru: "Проиграно", uz: "Yutqazildi" }, type: "LOST" },
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
    private readonly fields: FieldsRepository,
    private readonly blueprints: BlueprintsRepository,
  ) {}

  async create(orgId: string, input: CreateWorkspaceInput): Promise<WorkspaceResponse> {
    // Доска с половиной фаз недопустима → воркспейс и дефолтные фазы в одной транзакции.
    const full = await this.prisma.client.$transaction(async (tx) => {
      // blueprints.md §3: blueprintId опционален — без него поведение НЕ меняется (DEFAULT_PHASES,
      // §10 workspaces-phases.md решение B). Чужой org-private блюпринт по id → 404, не 403 (IDOR).
      const blueprint = input.blueprintId
        ? await this.blueprints.findVisibleById(input.blueprintId, orgId, tx)
        : null;
      if (input.blueprintId && !blueprint) throw new ResourceNotFoundError("Blueprint not found");
      const definition = blueprint ? (blueprint.definition as BlueprintDefinition) : null;

      // Блюпринт для B2B не должен молча создать MIXED-воркспейс — audience блюпринта побеждает,
      // если запрос его явно не переопределил.
      const audience = input.audience ?? blueprint?.audience;

      // §3.1: notificationDefaults материализуется в Workspace.settings.notifications ОДНИМ
      // write вместе с созданием (не отдельным update после) — notifications.md §4 уже читает
      // этот подключ, если он есть, иначе жёсткий дефолт (owner+assignees) без изменений.
      const settings = {
        ...(input.settings ?? {}),
        ...(definition?.notificationDefaults ? { notifications: definition.notificationDefaults } : {}),
      };

      const ws = await this.workspaces.create(
        { orgId, name: input.name, audience, settings: settings as Prisma.InputJsonValue },
        tx,
      );

      const phasesToCreate = definition
        ? definition.phases.map((p) => ({ workspaceId: ws.id, key: p.key, name: p.name, type: p.type, order: p.order }))
        : DEFAULT_PHASES.map((p, i) => ({ workspaceId: ws.id, key: p.key, name: p.name, type: p.type, order: i + 1 }));
      await this.phases.createMany(phasesToCreate, tx);

      // key — буквально из определения блюпринта (P1), не сгенерирован заново по field-key.ts.
      if (definition && definition.projectFields.length > 0) {
        await this.fields.createMany(
          definition.projectFields.map((f) => ({
            workspaceId: ws.id,
            key: f.key,
            label: f.label,
            type: f.type,
            options: f.options,
            required: f.required ?? false,
          })),
          tx,
        );
      }

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

  // Reorder = ПОЛНЫЙ желаемый порядок → нормализация в плотные 1..n (§3). Один примитив
  // на reorder/delete/import вместо инкрементальных дельт.
  async reorderPhases(
    orgId: string,
    workspaceId: string,
    input: ReorderPhasesInput,
  ): Promise<WorkspaceResponse> {
    const full = await this.prisma.client.$transaction(async (tx) => {
      const ws = await this.workspaces.findByIdInOrg(workspaceId, orgId, tx);
      if (!ws) throw new ResourceNotFoundError("Workspace not found");

      // Version ПЕРЕД проверкой набора (§4): устаревший version = доска изменилась под
      // клиентом → 409 refetch. Иначе конкурентно добавленная фаза выглядела бы как
      // «неполный набор» (400) и клиент не понял бы, что нужно перечитать.
      if ((await this.workspaces.bumpVersionIf(workspaceId, input.version, tx)) === 0) {
        throw new WorkspaceVersionConflictError();
      }

      // phaseIds обязан быть ровно множеством фаз воркспейса (без дублей, без чужих).
      const current = new Set(ws.phases.map((p) => p.id));
      const given = input.phaseIds;
      const sameSet =
        given.length === current.size &&
        new Set(given).size === given.length &&
        given.every((id) => current.has(id));
      if (!sameSet) throw new InvalidPhaseSetError();

      // Плотные 1..n в присланном порядке. DEFERRABLE-констрейнт терпит промежуточные
      // дубли order — проверка на COMMIT, когда порядок уже целостен.
      for (const [index, id] of given.entries()) {
        await this.phases.setOrder(id, index + 1, tx);
      }

      return this.workspaces.findByIdInOrg(workspaceId, orgId, tx);
    });

    if (!full) throw new ResourceNotFoundError("Workspace not found");
    return toWorkspaceResponse(full, { phases: full.phases.map(toPhaseResponse) });
  }

  async update(orgId: string, id: string, input: UpdateWorkspaceInput): Promise<WorkspaceResponse> {
    if (!(await this.workspaces.findByIdInOrg(id, orgId))) {
      throw new ResourceNotFoundError("Workspace not found");
    }
    await this.workspaces.update(id, {
      name: input.name,
      audience: input.audience,
      settings: input.settings as Prisma.InputJsonValue | undefined,
    });
    const full = await this.workspaces.findByIdInOrg(id, orgId);
    if (!full) throw new ResourceNotFoundError("Workspace not found");
    return toWorkspaceResponse(full, { phases: full.phases.map(toPhaseResponse) });
  }

  async remove(orgId: string, id: string): Promise<void> {
    if (!(await this.workspaces.findByIdInOrg(id, orgId))) {
      throw new ResourceNotFoundError("Workspace not found");
    }
    await this.workspaces.delete(id);
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
