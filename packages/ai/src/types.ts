// ai-chat.md §5 — provider abstraction. Framework-agnostic по дизайну: apps/api адаптирует эти
// интерфейсы к своим доменным ошибкам/DI, этот пакет ничего не знает про Nest/Prisma.

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

// JSON Schema для аргументов инструмента — вызывающая сторона (apps/api/ai-tools) строит его из
// Zod-схемы каждого инструмента (api-schemas/src/ai-tools.ts), этот пакет формы не диктует.
export interface ToolSchema {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

// ai-chat.md §4/§6 — стрим токенов + отдельное событие на предложенный tool-call (не auto-execute,
// исполнение — на стороне apps/api после explicit confirm, см. §6).
export type ChatStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_call_proposed"; id: string; tool: string; args: Record<string, unknown> }
  | { type: "done" }
  | { type: "error"; message: string };

export interface AiChatProvider {
  streamChat(params: { messages: ChatMessage[]; tools?: ToolSchema[] }): AsyncIterable<ChatStreamEvent>;
}

export interface AiEmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
}

// ADR (decisions.md) — embedding-провайдер выбирается НЕЗАВИСИМО от chat-провайдера (у Anthropic
// нет embeddings endpoint). Имена — то, что хранится в Organization.settings.aiProvider.
export type ChatProviderName = "anthropic" | "openai" | "bedrock";
export type EmbeddingProviderName = "openai" | "bedrock";

// Секреты — приходят из env (apps/api/@helix/config), этот пакет process.env не читает сам:
// держит его тестируемым (провайдер конструируется из явных аргументов, не глобального состояния).
export interface ProviderCredentials {
  anthropicApiKey?: string;
  openAiApiKey?: string;
  awsBedrockRegion?: string;
}
