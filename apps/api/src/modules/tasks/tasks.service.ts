import { Injectable } from "@nestjs/common";
import type { CreateTaskInput, TaskResponse, UpdateTaskInput } from "@helix/api-schemas";
import { ResourceNotFoundError } from "../../core/errors/domain-error";
import { OrganizationsRepository } from "../organizations/organizations.repository";
import { ProjectsRepository } from "../projects/projects.repository";
import { assertOrgMember } from "../workspaces/assert-org-member";
import { toTaskResponse } from "./task.mapper";
import { TaskRepository } from "./task.repository";

@Injectable()
export class TasksService {
  constructor(
    private readonly projects: ProjectsRepository,
    private readonly tasks: TaskRepository,
    private readonly orgs: OrganizationsRepository,
  ) {}

  async list(orgId: string, projectId: string): Promise<TaskResponse[]> {
    await this.assertProjectInOrg(orgId, projectId);
    const rows = await this.tasks.listByProject(projectId);
    const now = new Date();
    return rows.map((r) => toTaskResponse(r, now));
  }

  async create(orgId: string, projectId: string, input: CreateTaskInput): Promise<TaskResponse> {
    await this.assertProjectInOrg(orgId, projectId);
    // §3: assigneeId → член ЭТОЙ орги (3-й потребитель assertOrgMember). null/absent — без проверки.
    if (input.assigneeId != null) await assertOrgMember(this.orgs, input.assigneeId, orgId);

    const row = await this.tasks.create({
      orgId,
      projectId,
      title: input.title,
      dueAt: input.dueAt,
      assigneeId: input.assigneeId,
    });
    return toTaskResponse(row);
  }

  // PATCH: title/dueAt/assignee (done — только complete/reopen, §2). null очищает dueAt/assignee.
  async update(orgId: string, taskId: string, input: UpdateTaskInput): Promise<TaskResponse> {
    if (!(await this.tasks.findByIdInOrg(taskId, orgId))) {
      throw new ResourceNotFoundError("Task not found");
    }
    if (input.assigneeId != null) await assertOrgMember(this.orgs, input.assigneeId, orgId);

    const row = await this.tasks.updateFields(taskId, {
      title: input.title,
      dueAt: input.dueAt,
      assigneeId: input.assigneeId,
    });
    return toTaskResponse(row);
  }

  async remove(orgId: string, taskId: string): Promise<void> {
    if (!(await this.tasks.findByIdInOrg(taskId, orgId))) {
      throw new ResourceNotFoundError("Task not found");
    }
    await this.tasks.delete(taskId);
  }

  private async assertProjectInOrg(orgId: string, projectId: string): Promise<void> {
    if (!(await this.projects.findByIdInOrg(projectId, orgId))) {
      throw new ResourceNotFoundError("Project not found");
    }
  }
}
