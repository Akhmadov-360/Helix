import Anthropic from "@anthropic-ai/sdk";
import type { AiChatProvider, ChatMessage, ChatStreamEvent, ToolSchema } from "../types";

const DEFAULT_MODEL = "claude-sonnet-5";
const MAX_TOKENS = 4096;

// ai-chat.md §4/§5 — маппинг сырых Anthropic-стрим-событий (Messages API streaming protocol) в
// наш провайдер-независимый ChatStreamEvent. Не используем SDK-шные .on()-хелперы верхнего уровня
// (MessageStream) — итерация по сырым событиям (`for await` по самому stream) документирована
// стабильнее между версиями SDK и не зависит от накопительной логики хелпера, которую мы всё
// равно повторяем сами для tool_use (input_json_delta накапливается вручную, см. ниже).
export class AnthropicChatProvider implements AiChatProvider {
  private readonly client: Anthropic;

  constructor(apiKey: string, private readonly model: string = DEFAULT_MODEL) {
    this.client = new Anthropic({ apiKey });
  }

  async *streamChat({
    messages,
    tools,
  }: {
    messages: ChatMessage[];
    tools?: ToolSchema[];
  }): AsyncIterable<ChatStreamEvent> {
    // Anthropic system prompt — отдельный параметр, не роль внутри messages[].
    const system = messages.find((m) => m.role === "system")?.content;
    const conversation = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: MAX_TOKENS,
      system,
      messages: conversation,
      tools: tools?.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema as Anthropic.Tool["input_schema"] })),
    });

    // Активный tool_use-блок накапливает частичный JSON построчно (input_json_delta) до
    // content_block_stop — Anthropic передаёт аргументы инструмента чанками, не одним куском.
    let activeToolCall: { id: string; name: string; partialJson: string } | null = null;

    try {
      for await (const event of stream) {
        if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
          activeToolCall = { id: event.content_block.id, name: event.content_block.name, partialJson: "" };
        } else if (event.type === "content_block_delta") {
          if (event.delta.type === "text_delta") {
            yield { type: "text_delta", text: event.delta.text };
          } else if (event.delta.type === "input_json_delta" && activeToolCall) {
            activeToolCall.partialJson += event.delta.partial_json;
          }
        } else if (event.type === "content_block_stop" && activeToolCall) {
          const args = activeToolCall.partialJson ? (JSON.parse(activeToolCall.partialJson) as Record<string, unknown>) : {};
          yield { type: "tool_call_proposed", id: activeToolCall.id, tool: activeToolCall.name, args };
          activeToolCall = null;
        }
      }
      yield { type: "done" };
    } catch (error) {
      yield { type: "error", message: error instanceof Error ? error.message : "Unknown provider error" };
    }
  }
}
