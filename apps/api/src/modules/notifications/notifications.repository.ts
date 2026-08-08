import { Injectable } from "@nestjs/common";
import type { LocalizedName } from "@helix/api-schemas";
import type { PhaseType } from "@helix/db";
import { PrismaService } from "../../core/prisma/prisma.service";

export interface LeadCreatedContext {
  title: string;
  ownerEmail: string | null;
  assigneeEmails: string[];
  workspaceSettings: unknown;
}

export interface AssignmentContext {
  projectTitle: string;
  assigneeEmail: string | null;
}

export interface PhaseChangedContext {
  projectTitle: string;
  ownerId: string | null;
  ownerEmail: string | null;
  assignees: { userId: string; email: string }[];
  fromPhaseName: LocalizedName | null;
  toPhaseName: LocalizedName;
  toPhaseType: PhaseType;
}

@Injectable()
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Один рефетч на всё, что нужно EmailWorker'у (§3-4): свежие owner/assignees на момент
   * ОБРАБОТКИ job, не на момент enqueue (retry может растянуть это на минуты). `orgId` в WHERE —
   * defensive re-check тенанта (§3): чужой projectId по ошибке → null, не чужие данные в письме.
   */
  async findLeadCreatedContext(orgId: string, projectId: string): Promise<LeadCreatedContext | null> {
    const project = await this.prisma.client.project.findFirst({
      where: { id: projectId, orgId },
      select: {
        title: true,
        owner: { select: { email: true } },
        assignees: { select: { user: { select: { email: true } } } },
        workspace: { select: { settings: true } },
      },
    });
    if (!project) return null;

    return {
      title: project.title,
      ownerEmail: project.owner?.email ?? null,
      assigneeEmails: project.assignees.map((a) => a.user.email),
      workspaceSettings: project.workspace.settings,
    };
  }

  /** §3-паттерн: рефетч на момент обработки job, `orgId` в WHERE — тот же defensive re-check тенанта. */
  async findAssignmentContext(orgId: string, projectId: string, userId: string): Promise<AssignmentContext | null> {
    const project = await this.prisma.client.project.findFirst({
      where: { id: projectId, orgId },
      select: { title: true },
    });
    if (!project) return null;

    const user = await this.prisma.client.user.findUnique({ where: { id: userId }, select: { email: true } });
    return { projectTitle: project.title, assigneeEmail: user?.email ?? null };
  }

  async findPhaseChangedContext(
    orgId: string,
    projectId: string,
    fromPhaseId: string,
    toPhaseId: string,
  ): Promise<PhaseChangedContext | null> {
    const [project, fromPhase, toPhase] = await Promise.all([
      this.prisma.client.project.findFirst({
        where: { id: projectId, orgId },
        select: {
          title: true,
          ownerId: true,
          owner: { select: { email: true } },
          assignees: { select: { userId: true, user: { select: { email: true } } } },
        },
      }),
      this.prisma.client.phase.findUnique({ where: { id: fromPhaseId }, select: { name: true } }),
      this.prisma.client.phase.findUnique({ where: { id: toPhaseId }, select: { name: true, type: true } }),
    ]);
    if (!project || !toPhase) return null;

    return {
      projectTitle: project.title,
      ownerId: project.ownerId,
      ownerEmail: project.owner?.email ?? null,
      assignees: project.assignees.map((a) => ({ userId: a.userId, email: a.user.email })),
      fromPhaseName: (fromPhase?.name ?? null) as LocalizedName | null,
      toPhaseName: toPhase.name as unknown as LocalizedName,
      toPhaseType: toPhase.type,
    };
  }
}
