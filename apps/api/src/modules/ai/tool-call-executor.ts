import { Injectable } from "@nestjs/common";
import {
  createTaskToolArgsSchema,
  movePhaseToolArgsSchema,
  updateFieldToolArgsSchema,
  type ToolName,
} from "@helix/api-schemas";
import { TasksService } from "../tasks/tasks.service";
import { ProjectsService } from "../workspaces/projects.service";

/**
 * ai-chat.md §6 шаг 3 — "Выполнить ЧЕРЕЗ существующий сервис (ProjectsService.move/TasksService.create/…),
 * не напрямую в БД" — тот же слой, что REST API, поэтому те же инварианты/ActivityEvent-запись
 * автоматически (P4), без дублирующего "ai.tool_executed"-события поверх.
 *
 * Аргументы каждого tool-call ре-валидируются здесь СВОЕЙ Zod-схемой (не доверяем тому, что LLM
 * прислал что-то, совпадающее с формой, которую видела buildToolSchemas() — та лишь подсказка
 * модели, не гарантия) — тот же принцип, что §6 явно фиксирует про args в api-schemas/ai-tools.ts.
 */
@Injectable()
export class ToolCallExecutor {
  constructor(
    private readonly projects: ProjectsService,
    private readonly tasks: TasksService,
  ) {}

  async execute(tool: ToolName, orgId: string, projectId: string, actorId: string, args: unknown): Promise<unknown> {
    switch (tool) {
      case "move_phase": {
        const input = movePhaseToolArgsSchema.parse(args);
        return this.projects.move(orgId, actorId, projectId, input);
      }
      case "update_field": {
        const input = updateFieldToolArgsSchema.parse(args);
        return this.projects.update(orgId, actorId, projectId, input);
      }
      case "create_task": {
        const input = createTaskToolArgsSchema.parse(args);
        return this.tasks.create(orgId, actorId, projectId, input);
      }
      case "draft_email":
      case "summarize_files":
        // tool-schema.ts TOOL_POLICY[tool] === null — read-only, никогда не доходят сюда
        // (streamChat помечает их EXECUTED сразу, confirm-эндпоинт их не обрабатывает).
        throw new Error(`Tool "${tool}" is read-only and does not go through the executor`);
    }
  }
}
