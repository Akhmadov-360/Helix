import { Injectable } from "@nestjs/common";
import type { Prisma } from "@helix/db";
import type { CreateTaskInput, TaskResponse, UpdateTaskInput } from "@helix/api-schemas";
import { ResourceNotFoundError } from "../../core/errors/domain-error";
import { PrismaService } from "../../core/prisma/prisma.service";
import { ActivityRecorder } from "../activity/activity-recorder";
import { OrganizationsRepository } from "../organizations/organizations.repository";
import { ProjectsRepository } from "../projects/projects.repository";
import { UsersRepository } from "../users/users.repository";
import { assertOrgMember } from "../workspaces/assert-org-member";
import { toTaskResponse, type TaskRow } from "./task.mapper";
import { TaskRepository } from "./task.repository";

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsRepository,
    private readonly tasks: TaskRepository,
    private readonly orgs: OrganizationsRepository,
    private readonly users: UsersRepository,
    private readonly activity: ActivityRecorder,
  ) {}

  async list(orgId: string, projectId: string): Promise<TaskResponse[]> {
    await this.assertProjectInOrg(orgId, projectId);
    const rows = await this.tasks.listByProject(projectId);
    const now = new Date();
    return rows.map((r) => toTaskResponse(r, now));
  }

  // Создание пишет task.created в ленту (§5) атомарно с вставкой (P4).
  async create(
    orgId: string,
    userId: string,
    projectId: string,
    input: CreateTaskInput,
  ): Promise<TaskResponse> {
    await this.assertProjectInOrg(orgId, projectId);
    // §3: assigneeId → член ЭТОЙ орги (3-й потребитель assertOrgMember). null/absent — без проверки.
    if (input.assigneeId != null) await assertOrgMember(this.orgs, input.assigneeId, orgId);

    const row = await this.prisma.client.$transaction(async (tx) => {
      const created = await this.tasks.create(
        { orgId, projectId, title: input.title, dueAt: input.dueAt, assigneeId: input.assigneeId },
        tx,
      );
      await this.recordTaskEvent(tx, "task.created", orgId, userId, created);
      return created;
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
    await this.tasks.delete(taskId); // §5: delete события НЕ пишет (изменение чеклиста, не веха лида)
  }

  // §5: complete ИДЕМПОТЕНТЕН — уже done → no-op, 200, БЕЗ нового события (защита от двойного клика/
  // retry: иначе дубль вехи в ленте). Событие task.completed атомарно с done=true (P4).
  async complete(orgId: string, userId: string, taskId: string): Promise<TaskResponse> {
    const task = await this.tasks.findByIdInOrg(taskId, orgId);
    if (!task) throw new ResourceNotFoundError("Task not found");
    if (task.done) return toTaskResponse(task); // уже завершён → no-op

    const row = await this.prisma.client.$transaction(async (tx) => {
      const updated = await this.tasks.setDone(taskId, true, tx);
      await this.recordTaskEvent(tx, "task.completed", orgId, userId, updated);
      return updated;
    });
    return toTaskResponse(row);
  }

  // §5: reopen идемпотентен (уже open → no-op) и НЕ пишет событие — отмена вехи не несёт новой
  // бизнес-информации о лиде (полный трек — AuditLog-территория M6, не лента сделки).
  async reopen(orgId: string, taskId: string): Promise<TaskResponse> {
    const task = await this.tasks.findByIdInOrg(taskId, orgId);
    if (!task) throw new ResourceNotFoundError("Task not found");
    if (!task.done) return toTaskResponse(task); // уже открыт → no-op
    return toTaskResponse(await this.tasks.setDone(taskId, false));
  }

  private async assertProjectInOrg(orgId: string, projectId: string): Promise<void> {
    if (!(await this.projects.findByIdInOrg(projectId, orgId))) {
      throw new ResourceNotFoundError("Project not found");
    }
  }

  // Снапшот P2/P3 в ленту: имена (актор + исполнитель), не живые FK. taskId в payload — для
  // «перейти к задаче» позже без миграции. Событие привязано к projectId таска.
  private async recordTaskEvent(
    tx: Prisma.TransactionClient,
    type: "task.created" | "task.completed",
    orgId: string,
    userId: string,
    task: TaskRow,
  ): Promise<void> {
    const [actor, assignee] = await Promise.all([
      this.users.findProfileById(userId),
      task.assigneeId ? this.users.findProfileById(task.assigneeId) : Promise.resolve(null),
    ]);
    await this.activity.record(tx, {
      orgId,
      projectId: task.projectId,
      actorId: userId,
      event: {
        type,
        schemaVersion: 1,
        payload: {
          taskId: task.id,
          taskTitle: task.title,
          assigneeName: assignee?.name ?? null,
          actorName: actor?.name ?? null,
        },
      },
    });
  }
}
