import { z } from "zod";
import { moveProjectSchema, updateProjectSchema } from "./projects";
import { createTaskSchema } from "./tasks";

// ai-chat.md §6 — ровно 5 инструментов Фазы 1 (FR-AI-3). move_phase/create_task/update_field —
// side-effecting, идут через propose→confirm→execute (Message.toolCalls, status ниже).
// draft_email/summarize_files — read-only (draft НЕ отправляет письмо, summarize ничего не пишет),
// confirm не требуется — выполняются сразу как часть ответа ассистента.
export const AI_TOOL_NAMES = ["move_phase", "create_task", "update_field", "draft_email", "summarize_files"] as const;
export const toolNameSchema = z.enum(AI_TOOL_NAMES);
export type ToolName = z.infer<typeof toolNameSchema>;

// Side-effecting инструменты переиспользуют СУЩЕСТВУЮЩИЕ input-схемы доменов, не изобретаются
// заново (§6) — projectId неявный (берётся из AiThread.scope на confirm-эндпоинте), не часть
// аргументов, которые формирует LLM.
export const movePhaseToolArgsSchema = moveProjectSchema;
export const createTaskToolArgsSchema = createTaskSchema;
export const updateFieldToolArgsSchema = updateProjectSchema;

export const draftEmailToolArgsSchema = z.object({
  to: z.email().optional(),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
});
export type DraftEmailToolArgs = z.infer<typeof draftEmailToolArgsSchema>;

export const summarizeFilesToolArgsSchema = z.object({
  attachmentIds: z.array(z.string().min(1)).min(1).max(20),
});
export type SummarizeFilesToolArgs = z.infer<typeof summarizeFilesToolArgsSchema>;

// PROPOSED — LLM предложил, ждёт confirm. CONFIRMED — юзер нажал, ещё выполняется (переходная,
// на случай если execute когда-нибудь станет async). EXECUTED/REJECTED — терминальные (§6/§10:
// REJECTED и на explicit отказ, и на 409-гонку "состояние успело измениться").
export const toolCallStatusSchema = z.enum(["PROPOSED", "CONFIRMED", "EXECUTED", "REJECTED"]);
export type ToolCallStatus = z.infer<typeof toolCallStatusSchema>;

// args — z.record, не discriminated union по tool: конкретная форма проверяется ОТДЕЛЬНО, схемой
// своего инструмента, в момент confirm (§6 шаг 2 — до CASL-проверки), не на этапе хранения в
// Message.toolCalls (LLM мог прислать невалидные аргументы, это не должно ломать сохранение самого
// сообщения — ошибка валидации всплывает позже, на confirm, где есть кому её показать).
export const toolCallSchema = z.object({
  id: z.string(),
  tool: toolNameSchema,
  args: z.record(z.string(), z.unknown()),
  status: toolCallStatusSchema,
  result: z.unknown().optional(),
});
export type ToolCall = z.infer<typeof toolCallSchema>;
