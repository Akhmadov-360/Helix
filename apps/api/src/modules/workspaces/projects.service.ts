import { Injectable } from "@nestjs/common";
import type { PhaseType } from "@helix/db";
import type { CreateProjectInput, ProjectResponse, ProjectStatus } from "@helix/api-schemas";
import { ResourceNotFoundError, WorkspaceHasNoPhasesError } from "../../core/errors/domain-error";
import { PrismaService } from "../../core/prisma/prisma.service";
import { ActivityRecorder } from "../activity/activity-recorder";
import { toProjectResponse } from "../projects/project.mapper";
import { ProjectsRepository } from "../projects/projects.repository";
import { rankBetween } from "../projects/rank";
import { UsersRepository } from "../users/users.repository";
import { WorkspacesRepository } from "./workspaces.repository";

// §6.1: status — производная от типа фазы (кроме ARCHIVED, который ставит только archive).
function statusForPhaseType(type: PhaseType): ProjectStatus {
  return type; // PhaseType (OPEN|WON|LOST) ⊂ ProjectStatus
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaces: WorkspacesRepository,
    private readonly projects: ProjectsRepository,
    private readonly users: UsersRepository,
    private readonly activity: ActivityRecorder,
  ) {}

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
