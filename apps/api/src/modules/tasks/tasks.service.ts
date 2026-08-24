import { Injectable } from "@nestjs/common";
import type { Prisma } from "@helix/db";
import type { CreateTaskInput, TaskResponse, UpdateTaskInput } from "@helix/api-schemas";
import { ResourceNotFoundError } from "../../core/errors/domain-error";
import { PrismaService } from "../../core/prisma/prisma.service";
import { ActivityRecorder } from "../activity/activity-recorder";
import { NotificationsService } from "../notifications/notifications.service";
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
    private readonly notifications: NotificationsService,
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
        {
          orgId,
          projectId,
          title: input.title,
          dueAt: input.dueAt,
          assigneeId: input.assigneeId,
          priority: input.priority,
        },
        tx,
      );
      await this.recordTaskEvent(tx, "task.created", orgId, userId, created);
      return created;
    });
    // Письмо назначенному ПОСЛЕ коммита (P4-порядок): не роняем create если Redis лёг.
    // Self-assign не спамим — юзер сам себе назначил, письмо не нужно.
    if (row.assigneeId && row.assigneeId !== userId) {
      await this.notifications.enqueueTaskAssigned({
        orgId,
        taskId: row.id,
        assigneeId: row.assigneeId,
        actorId: userId,
      });
    }
    return toTaskResponse(row);
  }

  // PATCH: title/dueAt/assignee/priority (done — только complete/reopen, §2). null очищает
  // dueAt/assignee (не priority — там NONE вместо null). При СМЕНЕ assignee на нового не-actor
  // юзера шлём task.assigned письмо (одна карточка = один get-assignment сигнал).
  async update(
    orgId: string,
    actorId: string,
    taskId: string,
    input: UpdateTaskInput,
  ): Promise<TaskResponse> {
    const existing = await this.tasks.findByIdInOrg(taskId, orgId);
    if (!existing) throw new ResourceNotFoundError("Task not found");
    if (input.assigneeId != null) await assertOrgMember(this.orgs, input.assigneeId, orgId);

    const row = await this.tasks.updateFields(taskId, {
      title: input.title,
      dueAt: input.dueAt,
      assigneeId: input.assigneeId,
      priority: input.priority,
    });

    // Триггер письма — только при СМЕНЕ на нового не-actor'а. Скрытые no-op'ы:
    // - assigneeId === undefined в input → поле не тронуто → пропустить;
    // - assigneeId === null (снятие) → пропустить;
    // - assigneeId === existing.assigneeId (тот же) → пропустить (Idempotency жёстче jobId'а);
    // - assigneeId === actorId (self-assign) → пропустить (как в create).
    const changedAssignee =
      input.assigneeId !== undefined &&
      input.assigneeId !== null &&
      input.assigneeId !== existing.assigneeId &&
      input.assigneeId !== actorId;
    if (changedAssignee) {
      await this.notifications.enqueueTaskAssigned({
        orgId,
        taskId: row.id,
        assigneeId: input.assigneeId!,
        actorId,
      });
    }

    return toTaskResponse(row);
  }

  async remove(orgId: string, taskId: string): Promise<void> {
    if (!(await this.tasks.findByIdInOrg(taskId, orgId))) {
      throw new ResourceNotFoundError("Task not found");
    }
    await this.tasks.delete(taskId); // §5: delete события НЕ пишет (изменение чеклиста, не веха лида)
  }

  // §5: complete ИДЕМПОТЕНТЕН. Fast-path (уже done → no-op без tx) ловит последовательный
  // двойной клик; атомарный CAS false→true внутри tx ловит ИСТИННУЮ гонку — событие пишет только
  // победитель (won), поэтому два параллельных complete дают одно task.completed, а не два (P4).
  async complete(orgId: string, userId: string, taskId: string): Promise<TaskResponse> {
    const existing = await this.tasks.findByIdInOrg(taskId, orgId);
    if (!existing) throw new ResourceNotFoundError("Task not found");
    if (existing.done) return toTaskResponse(existing);

    const row = await this.prisma.client.$transaction(async (tx) => {
      const won = (await this.tasks.setDoneIf(taskId, false, true, tx)) === 1;
      const fresh = await this.tasks.findByIdInOrg(taskId, orgId, tx);
      if (!fresh) throw new Error("task vanished within its own transaction");
      if (won) await this.recordTaskEvent(tx, "task.completed", orgId, userId, fresh);
      return fresh;
    });
    return toTaskResponse(row);
  }

  // §5: reopen идемпотентен и НЕ пишет событие (отмена вехи не несёт новой бизнес-информации; полный
  // трек — AuditLog M6). Тот же атомарный CAS ради консистентности с complete — здесь гонка безобидна
  // (нет события), но примитив единый: не «прочитать-потом-записать».
  async reopen(orgId: string, taskId: string): Promise<TaskResponse> {
    const existing = await this.tasks.findByIdInOrg(taskId, orgId);
    if (!existing) throw new ResourceNotFoundError("Task not found");
    if (!existing.done) return toTaskResponse(existing);

    await this.tasks.setDoneIf(taskId, true, false);
    const fresh = await this.tasks.findByIdInOrg(taskId, orgId);
    if (!fresh) throw new ResourceNotFoundError("Task not found");
    return toTaskResponse(fresh);
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
