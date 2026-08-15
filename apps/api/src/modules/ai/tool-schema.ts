import { z } from "zod";
import {
  AI_TOOL_NAMES,
  createTaskToolArgsSchema,
  draftEmailToolArgsSchema,
  movePhaseToolArgsSchema,
  summarizeFilesToolArgsSchema,
  updateFieldToolArgsSchema,
  type ToolName,
} from "@helix/api-schemas";
import type { AppAction, AppSubject } from "../../core/authz/app-ability";
import { defineAbilityForRole } from "../../core/authz/app-ability";
import type { Role } from "@helix/db";
import type { ToolSchema } from "@helix/ai";

// ai-chat.md §6 — Zod-схема аргументов каждого инструмента переиспользует существующие
// input-схемы доменов; здесь только описание для LLM и JSON Schema для передачи провайдеру.
const TOOL_ARG_SCHEMAS: Record<ToolName, z.ZodTypeAny> = {
  move_phase: movePhaseToolArgsSchema,
  create_task: createTaskToolArgsSchema,
  update_field: updateFieldToolArgsSchema,
  draft_email: draftEmailToolArgsSchema,
  summarize_files: summarizeFilesToolArgsSchema,
};

const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
  move_phase: "Move the current project to a different pipeline phase.",
  create_task: "Create a checklist task on the current project.",
  update_field: "Update editable project fields (title, value, currency, source, custom fields).",
  draft_email: "Draft an email (subject + body) related to this project. Does not send it.",
  summarize_files: "Summarize the content of one or more attached files on this project.",
};

/**
 * ai-chat.md §6 — какой CASL-грант confirm-эндпоинт обязан перепроверить на АКТОРЕ для каждого
 * side-effecting инструмента (переиспользует существующие капабилити доменов, не заводит новый
 * субъект "AiTool" — тот же принцип, что §6 формулирует явно). `null` — read-only инструмент:
 * confirm не нужен вовсе (§6: "выполняются сразу, как ответ, а не как proposed-action"), поэтому
 * здесь единственный источник истины и для §6.1 (advisory-подсказки модели), и для execute-диспетчера
 * (tool-call-executor.ts), и для того, какие инструменты streamChat() метит EXECUTED сразу.
 */
export const TOOL_POLICY: Record<ToolName, { action: AppAction; subject: AppSubject } | null> = {
  move_phase: { action: "update", subject: "Project" },
  update_field: { action: "update", subject: "Project" },
  create_task: { action: "create", subject: "Task" },
  draft_email: null,
  summarize_files: null,
};

export const READ_ONLY_TOOL_NAMES: ToolName[] = AI_TOOL_NAMES.filter((name) => TOOL_POLICY[name] === null);

// unrepresentable: "any" — некоторые input-схемы переиспользуют z.coerce.date()
// (createTaskSchema.dueAt), которое JSON Schema не выражает 1:1; деградация до "any" для этого
// одного поля лучше, чем падение всей сборки схем (провайдеру всё равно нужна только форма для
// подсказки модели, не строгая валидация — та происходит отдельно на confirm, §6 шаг 2).
export function buildToolSchemas(): ToolSchema[] {
  return AI_TOOL_NAMES.map((name) => ({
    name,
    description: TOOL_DESCRIPTIONS[name],
    inputSchema: z.toJSONSchema(TOOL_ARG_SCHEMAS[name], { unrepresentable: "any" }) as Record<string, unknown>,
  }));
}

// ai-chat.md §6.1 — advisory-слой: сообщает модели, какие side-effecting инструменты актёр
// заведомо не сможет подтвердить, ДО вызова LLM, чтобы не тратить ход пользователя на
// предложение, обречённое на 403 (§6 шаг 2 всё равно перепроверяет CASL — это не замена).
export function buildToolPermissionNotes(actorRole: Role): string {
  const ability = defineAbilityForRole(actorRole);
  const notes: string[] = [];
  for (const name of AI_TOOL_NAMES) {
    const policy = TOOL_POLICY[name];
    if (policy && !ability.can(policy.action, policy.subject)) {
      notes.push(`${name} — requires ${policy.action} ${policy.subject} permission`);
    }
  }
  if (notes.length === 0) return "";
  return `The current user cannot confirm the following actions (do not propose them — explain who can instead): ${notes.join("; ")}.`;
}
