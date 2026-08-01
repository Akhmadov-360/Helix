import { Injectable } from "@nestjs/common";
import type { PhaseType } from "@helix/db";
import type { Prisma } from "@helix/db";
import type {
  ActivityEventResponse,
  BoardProjectResponse,
  BoardResponse,
  ColumnQuery,
  ColumnResponse,
  CreateProjectInput,
  LocalizedName,
  MoveProjectInput,
  ProjectResponse,
  ProjectStatus,
  UpdateProjectInput,
} from "@helix/api-schemas";
import {
  ResourceNotFoundError,
  StaleNeighborsError,
  WorkspaceHasNoPhasesError,
} from "../../core/errors/domain-error";
import { PrismaService } from "../../core/prisma/prisma.service";
import { ActivityRecorder } from "../activity/activity-recorder";
import { ActivityRepository } from "../activity/activity.repository";
import { toPhaseResponse } from "../phases/phase.mapper";
import { PhasesRepository } from "../phases/phases.repository";
import { toBoardProjectResponse, toProjectResponse } from "../projects/project.mapper";
import { ProjectsRepository } from "../projects/projects.repository";
import { denseRanks, rankBetween } from "../projects/rank";
import { OrganizationsRepository } from "../organizations/organizations.repository";
import { UsersRepository } from "../users/users.repository";
import { assertOrgMember } from "./assert-org-member";
import { WorkspacesRepository } from "./workspaces.repository";

// §4.4/§5: длиннее — триггер рекомпакции (проверяется ДО записи, иначе 500 "value too long").
const RANK_MAX_LENGTH = 32;

// §6.1: status — производная от типа фазы (кроме ARCHIVED, который ставит только archive).
function statusForPhaseType(type: PhaseType): ProjectStatus {
  return type; // PhaseType (OPEN|WON|LOST) ⊂ ProjectStatus
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaces: WorkspacesRepository,
    private readonly phases: PhasesRepository,
    private readonly projects: ProjectsRepository,
    private readonly users: UsersRepository,
    private readonly activity: ActivityRecorder,
    private readonly activityLog: ActivityRepository,
    private readonly orgs: OrganizationsRepository,
  ) {}

  async getById(orgId: string, projectId: string): Promise<ProjectResponse> {
    const project = await this.projects.findByIdInOrg(projectId, orgId);
    if (!project) throw new ResourceNotFoundError("Project not found");
    return toProjectResponse(project);
  }

  // PATCH: редактируемые поля. status/phaseId/rank/ownerId не принимаются (отсечены схемой;
  // ownerId — через reassign). Событие project.updated — только на ЗНАЧИМОЕ поле value (§6.3).
  async update(
    orgId: string,
    userId: string,
    projectId: string,
    input: UpdateProjectInput,
  ): Promise<ProjectResponse> {
    const row = await this.prisma.client.$transaction(async (tx) => {
      const before = await this.projects.findByIdInOrg(projectId, orgId, tx);
      if (!before) throw new ResourceNotFoundError("Project not found");

      const updated = await this.projects.updateFields(projectId, input, tx);

      if (input.value !== undefined && Number(before.value ?? NaN) !== input.value) {
        const actor = await this.users.findProfileById(userId);
        await this.activity.record(tx, {
          orgId,
          projectId,
          actorId: userId,
          event: {
            type: "project.updated",
            schemaVersion: 1,
            payload: { changed: ["value"], actorName: actor?.name ?? null },
          },
        });
      }
      return updated;
    });
    return toProjectResponse(row);
  }

  // Reassign владельца (Manager+, матрица «Reassign leads») — первоклассная операция, не PATCH-поле:
  // меняет ответственность и будущий scope (visibility=ASSIGNED, M6). ownerId=null → лид в пул
  // (§6.3, именованное состояние). Событие project.reassigned{from,to names} — только при смене.
  async reassign(
    orgId: string,
    userId: string,
    projectId: string,
    ownerId: string | null,
  ): Promise<ProjectResponse> {
    const row = await this.prisma.client.$transaction(async (tx) => {
      const before = await this.projects.findByIdInOrg(projectId, orgId, tx);
      if (!before) throw new ResourceNotFoundError("Project not found");

      // Новый владелец обязан быть членом ЭТОЙ орги (§6.3) — composite-FK не ловит (owner → User(id),
      // не Membership). Нет членства → 400. null (пул) проверять не нужно.
      if (ownerId !== null) await assertOrgMember(this.orgs, ownerId, orgId, tx);

      const updated = await this.projects.reassignOwner(projectId, ownerId, tx);

      if (before.ownerId !== ownerId) {
        // Снапшот ИМЁН (P2/P3): from — прежний владелец (null = был в пуле), to — новый (null =
        // возвращён в пул), actor — кто переназначил.
        const [actor, fromOwner, toOwner] = await Promise.all([
          this.users.findProfileById(userId),
          before.ownerId ? this.users.findProfileById(before.ownerId) : Promise.resolve(null),
          ownerId ? this.users.findProfileById(ownerId) : Promise.resolve(null),
        ]);
        await this.activity.record(tx, {
          orgId,
          projectId,
          actorId: userId,
          event: {
            type: "project.reassigned",
            schemaVersion: 1,
            payload: {
              fromOwnerName: fromOwner?.name ?? null,
              toOwnerName: toOwner?.name ?? null,
              actorName: actor?.name ?? null,
            },
          },
        });
      }
      return updated;
    });
    return toProjectResponse(row);
  }

  async remove(orgId: string, projectId: string): Promise<void> {
    const project = await this.projects.findByIdInOrg(projectId, orgId);
    if (!project) throw new ResourceNotFoundError("Project not found");
    await this.projects.delete(projectId);
  }

  // Лента проекта (§6). Tenant-скоуп: сначала проверяем проект по орге (404), затем события.
  async getActivity(orgId: string, projectId: string): Promise<ActivityEventResponse[]> {
    const project = await this.projects.findByIdInOrg(projectId, orgId);
    if (!project) throw new ResourceNotFoundError("Project not found");

    const events = await this.activityLog.listByProject(projectId);
    return events.map((e) => ({
      id: e.id,
      type: e.type,
      schemaVersion: e.schemaVersion,
      actorId: e.actorId,
      payload: e.payload,
      createdAt: e.createdAt.toISOString(),
    }));
  }

  // Доска: фазы + первые N карточек каждой (§8). Воркспейс проверяем на принадлежность
  // орге ЗДЕСЬ (404), дальше raw-запрос по workspaceId уже безопасен.
  async getBoard(orgId: string, workspaceId: string, limitPerPhase: number): Promise<BoardResponse> {
    const workspace = await this.workspaces.findByIdInOrg(workspaceId, orgId);
    if (!workspace) throw new ResourceNotFoundError("Workspace not found");

    const rows = await this.projects.boardRows(workspaceId, limitPerPhase);
    const projectIds = rows.map((row) => row.id);
    const [totals, taskCounts, assignees] = await Promise.all([
      this.projects.columnTotals(workspaceId),
      this.projects.taskCountsByProjectIds(projectIds),
      this.projects.assigneesByProjectIds(projectIds),
    ]);

    const byPhase = new Map<string, BoardProjectResponse[]>();
    for (const row of rows) {
      const list = byPhase.get(row.phaseId) ?? [];
      list.push(toBoardProjectResponse(row, taskCounts.get(row.id), assignees.get(row.id)));
      byPhase.set(row.phaseId, list);
    }

    return {
      workspaceId,
      version: workspace.version,
      phases: workspace.phases.map((phase) => {
        const projects = byPhase.get(phase.id) ?? [];
        const total = totals.get(phase.id) ?? 0;
        return {
          ...toPhaseResponse(phase),
          total,
          projects,
          hasMore: total > projects.length,
        };
      }),
    };
  }

  // Смена фазы и/или позиции (§5). Порядок операций жёсткий.
  async move(
    orgId: string,
    userId: string,
    projectId: string,
    input: MoveProjectInput,
  ): Promise<ProjectResponse> {
    const updated = await this.prisma.client.$transaction(async (tx) => {
      // Лок на ЦЕЛЕВУЮ фазу (§4.3) — до чтений, чтобы конкурентный move в неё сериализовался.
      await this.projects.lockPhase(input.toPhaseId, tx);

      const project = await this.projects.findByIdInOrg(projectId, orgId, tx);
      if (!project) throw new ResourceNotFoundError("Project not found");

      const targetPhase = await this.phases.findByIdInOrg(input.toPhaseId, orgId, tx);
      // Целевая фаза обязана быть из того же воркспейса (кросс-доска-move невалиден) → 404.
      if (!targetPhase || targetPhase.workspaceId !== project.workspaceId) {
        throw new ResourceNotFoundError("Target phase not found");
      }

      const neighbors = await this.resolveNeighbors(tx, orgId, input);
      let rank = rankBetween(neighbors.afterRank, neighbors.beforeRank);

      if (rank.length > RANK_MAX_LENGTH) {
        await this.recompactPhase(tx, input.toPhaseId);
        const fresh = await this.resolveNeighbors(tx, orgId, input); // ранги соседей изменились
        rank = rankBetween(fresh.afterRank, fresh.beforeRank);
      }

      // ARCHIVED вне доски — move не воскрешает статус (§6.1); иначе status из типа фазы.
      const status: ProjectStatus =
        project.status === "ARCHIVED" ? "ARCHIVED" : statusForPhaseType(targetPhase.type);
      const phaseChanged = project.phaseId !== targetPhase.id;

      const moved = await this.projects.updatePosition(
        projectId,
        { phaseId: targetPhase.id, rank, status },
        tx,
      );

      // Событие ТОЛЬКО на смену фазы (§6.3): reorder внутри фазы — состояние представления.
      if (phaseChanged) {
        const [fromPhase, actor] = await Promise.all([
          this.phases.findByIdInOrg(project.phaseId, orgId, tx),
          this.users.findProfileById(userId),
        ]);
        await this.activity.record(tx, {
          orgId,
          projectId,
          actorId: userId,
          event: {
            type: "project.moved",
            schemaVersion: 1,
            payload: {
              fromPhaseKey: fromPhase?.key ?? "",
              fromPhaseName: (fromPhase?.name ?? { en: "" }) as unknown as LocalizedName,
              toPhaseKey: targetPhase.key,
              toPhaseName: targetPhase.name as unknown as LocalizedName,
              actorName: actor?.name ?? null,
            },
          },
        });
      }

      return moved;
    });

    return toProjectResponse(updated);
  }

  // Архивация (§7): status → ARCHIVED, карточка физически остаётся в фазе (phaseId NOT NULL),
  // из доски фильтруется (§8). Идемпотентно: повторная архивация не плодит событие.
  async archive(orgId: string, userId: string, projectId: string): Promise<ProjectResponse> {
    const row = await this.prisma.client.$transaction(async (tx) => {
      const project = await this.projects.findByIdInOrg(projectId, orgId, tx);
      if (!project) throw new ResourceNotFoundError("Project not found");
      if (project.status === "ARCHIVED") return project;

      const updated = await this.projects.updateStatus(projectId, "ARCHIVED", tx);
      const actor = await this.users.findProfileById(userId);
      await this.activity.record(tx, {
        orgId,
        projectId,
        actorId: userId,
        event: { type: "project.archived", schemaVersion: 1, payload: { actorName: actor?.name ?? null } },
      });
      return updated;
    });
    return toProjectResponse(row);
  }

  // Восстановление (§7.3): возвращается в свою фазу, но ВСЕГДА с новым рангом наверх —
  // старый мог устареть после рекомпакции. status → тип фазы. Идемпотентно.
  async restore(orgId: string, userId: string, projectId: string): Promise<ProjectResponse> {
    const row = await this.prisma.client.$transaction(async (tx) => {
      const project = await this.projects.findByIdInOrg(projectId, orgId, tx);
      if (!project) throw new ResourceNotFoundError("Project not found");
      if (project.status !== "ARCHIVED") return project;

      await this.projects.lockPhase(project.phaseId, tx); // ранговая операция → лок фазы
      const phase = await this.phases.findByIdInOrg(project.phaseId, orgId, tx);
      if (!phase) throw new ResourceNotFoundError("Phase not found");

      const rank = rankBetween(null, await this.projects.findTopRank(project.phaseId, tx));
      const updated = await this.projects.updatePosition(
        projectId,
        { phaseId: project.phaseId, rank, status: statusForPhaseType(phase.type) },
        tx,
      );
      const actor = await this.users.findProfileById(userId);
      await this.activity.record(tx, {
        orgId,
        projectId,
        actorId: userId,
        event: { type: "project.restored", schemaVersion: 1, payload: { actorName: actor?.name ?? null } },
      });
      return updated;
    });
    return toProjectResponse(row);
  }

  // Соседи задаются по id (§4.1). Нет соседей → наверх (§4.1, консистентно с созданием).
  private async resolveNeighbors(
    tx: Prisma.TransactionClient,
    orgId: string,
    input: MoveProjectInput,
  ): Promise<{ afterRank: string | null; beforeRank: string | null }> {
    if (!input.afterId && !input.beforeId) {
      return { afterRank: null, beforeRank: await this.projects.findTopRank(input.toPhaseId, tx) };
    }
    const after = input.afterId ? await this.loadNeighbor(tx, orgId, input.afterId, input.toPhaseId) : null;
    const before = input.beforeId
      ? await this.loadNeighbor(tx, orgId, input.beforeId, input.toPhaseId)
      : null;

    // after.rank >= before.rank → пара перевёрнута/равна (§4.5). Сравнение строк в JS =
    // байтовое для ASCII = COLLATE "C" в БД.
    if (after && before && after.rank >= before.rank) throw new StaleNeighborsError();

    return { afterRank: after?.rank ?? null, beforeRank: before?.rank ?? null };
  }

  private async loadNeighbor(
    tx: Prisma.TransactionClient,
    orgId: string,
    neighborId: string,
    toPhaseId: string,
  ): Promise<{ rank: string }> {
    const neighbor = await this.projects.findByIdInOrg(neighborId, orgId, tx);
    if (!neighbor) throw new ResourceNotFoundError("Neighbour not found"); // чужой/несуществующий → 404
    if (neighbor.phaseId !== toPhaseId) throw new StaleNeighborsError(); // ушёл в другую фазу → 409
    return { rank: neighbor.rank };
  }

  // §4.4: перенумеровать фазу в плотную сетку (тот же примитив, что у фаз, но по триггеру).
  private async recompactPhase(tx: Prisma.TransactionClient, phaseId: string): Promise<void> {
    const ids = await this.projects.phaseProjectIdsOrdered(phaseId, tx);
    const keys = denseRanks(ids.length);
    for (const [index, { id }] of ids.entries()) {
      await this.projects.setRank(id, keys[index]!, tx);
    }
  }

  // Догрузка колонки keyset-курсором. limit+1 → знаем hasMore без отдельного COUNT.
  async getColumn(orgId: string, phaseId: string, query: ColumnQuery): Promise<ColumnResponse> {
    const phase = await this.phases.findByIdInOrg(phaseId, orgId);
    if (!phase) throw new ResourceNotFoundError("Phase not found");

    const rows = await this.projects.columnPage(
      phaseId,
      query.cursorRank ?? null,
      query.cursorId ?? null,
      query.limit + 1,
    );
    const page = rows.slice(0, query.limit);
    const hasMore = rows.length > query.limit;

    // Та же форма, что у доски (§13.4): страница дозаписывается в board-кэш на фронте.
    const projectIds = page.map((row) => row.id);
    const [taskCounts, assignees] = await Promise.all([
      this.projects.taskCountsByProjectIds(projectIds),
      this.projects.assigneesByProjectIds(projectIds),
    ]);

    return {
      projects: page.map((row) => toBoardProjectResponse(row, taskCounts.get(row.id), assignees.get(row.id))),
      hasMore,
    };
  }

  // Новый лид → первая фаза воркспейса, наверх колонки (§3.3), событие project.created (P4).
  async create(
    orgId: string,
    userId: string,
    workspaceId: string,
    input: CreateProjectInput,
  ): Promise<ProjectResponse> {
    const workspace = await this.workspaces.findByIdInOrg(workspaceId, orgId);
    if (!workspace) throw new ResourceNotFoundError("Workspace not found");

    const firstPhase = workspace.phases[0]; // findByIdInOrg отдаёт фазы orderBy order asc
    if (!firstPhase) throw new WorkspaceHasNoPhasesError();

    const topRank = await this.projects.findTopRank(firstPhase.id);
    const rank = rankBetween(null, topRank); // наверх: перед текущим первым
    const actor = await this.users.findProfileById(userId);

    const created = await this.prisma.client.$transaction(async (tx) => {
      const project = await this.projects.create(
        {
          orgId,
          workspaceId,
          phaseId: firstPhase.id,
          title: input.title,
          rank,
          status: statusForPhaseType(firstPhase.type),
          value: input.value,
          currency: input.currency,
          source: input.source,
          companyId: input.companyId,
          ownerId: input.ownerId,
        },
        tx,
      );
      await this.activity.record(tx, {
        orgId,
        projectId: project.id,
        actorId: userId,
        event: {
          type: "project.created",
          schemaVersion: 1,
          payload: { actorName: actor?.name ?? null },
        },
      });
      return project;
    });

    return toProjectResponse(created);
  }
}
