import type { AiMessageResponse, AiThreadResponse, Citation, ToolCall } from "@helix/api-schemas";
import type { AiThreadRow, MessageRow } from "./ai-threads.repository";

export function toAiThreadResponse(row: AiThreadRow): AiThreadResponse {
  return {
    id: row.id,
    orgId: row.orgId,
    scope: row.scope,
    projectId: row.projectId,
    workspaceId: row.workspaceId,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toAiMessageResponse(row: MessageRow): AiMessageResponse {
  return {
    id: row.id,
    threadId: row.threadId,
    role: row.role,
    content: row.content,
    citations: (row.citations as Citation[] | null) ?? null,
    toolCalls: (row.toolCalls as ToolCall[] | null) ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
