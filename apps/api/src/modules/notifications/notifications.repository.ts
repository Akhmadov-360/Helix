import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";

export interface LeadCreatedContext {
  title: string;
  ownerEmail: string | null;
  assigneeEmails: string[];
  workspaceSettings: unknown;
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
}
