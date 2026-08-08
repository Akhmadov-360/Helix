import { Injectable } from "@nestjs/common";
import type { ProjectAssigneeResponse } from "@helix/api-schemas";
import { AssigneeAlreadyExistsError, ResourceNotFoundError } from "../../core/errors/domain-error";
import { NotificationsService } from "../notifications/notifications.service";
import { OrganizationsRepository } from "../organizations/organizations.repository";
import { ProjectsRepository } from "../projects/projects.repository";
import { assertOrgMember } from "../workspaces/assert-org-member";
import { ProjectAssigneeRepository, type ProjectAssigneeRow } from "./project-assignee.repository";

@Injectable()
export class ProjectAssigneesService {
  constructor(
    private readonly projects: ProjectsRepository,
    private readonly assignees: ProjectAssigneeRepository,
    private readonly orgs: OrganizationsRepository,
    private readonly notifications: NotificationsService,
  ) {}

  async list(orgId: string, projectId: string): Promise<ProjectAssigneeResponse[]> {
    await this.assertProjectInOrg(orgId, projectId);
    const rows = await this.assignees.listByProject(projectId);
    return rows.map(toProjectAssigneeResponse);
  }

  // Назначить co-worker (Manager+). Тот же membership-guard, что reassign owner (§6.3): назначаемый —
  // член ЭТОЙ орги (иначе 400). owner ⊥ assignee — назначение НЕ трогает ownerId (§6.3).
  async assign(orgId: string, projectId: string, userId: string): Promise<ProjectAssigneeResponse> {
    await this.assertProjectInOrg(orgId, projectId);
    await assertOrgMember(this.orgs, userId, orgId);
    if (await this.assignees.findAssignee(projectId, userId)) {
      throw new AssigneeAlreadyExistsError();
    }
    const row = await this.assignees.create(projectId, userId);
    // FR-NOTIF-2: письмо после записи (create() не в транзакции) — тот же остаточный риск, что lead.created.
    await this.notifications.enqueueAssignment({ orgId, projectId, userId });
    return toProjectAssigneeResponse(row);
  }

  async unassign(orgId: string, projectId: string, userId: string): Promise<void> {
    await this.assertProjectInOrg(orgId, projectId);
    if (!(await this.assignees.findAssignee(projectId, userId))) {
      throw new ResourceNotFoundError("User is not assigned to this project");
    }
    await this.assignees.delete(projectId, userId);
  }

  private async assertProjectInOrg(orgId: string, projectId: string): Promise<void> {
    if (!(await this.projects.findByIdInOrg(projectId, orgId))) {
      throw new ResourceNotFoundError("Project not found");
    }
  }
}

function toProjectAssigneeResponse(row: ProjectAssigneeRow): ProjectAssigneeResponse {
  return { userId: row.userId, name: row.user.name, email: row.user.email };
}
