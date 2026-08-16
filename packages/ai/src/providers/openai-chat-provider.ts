import OpenAI from "openai";
import type { AiChatProvider, ChatMessage, ChatStreamEvent, ToolSchema } from "../types";

const DEFAULT_MODEL = "gpt-4o";

interface PendingToolCall {
  id: string;
  name: string;
  argsJson: string;
}

// ai-chat.md §4/§5 — тот же ChatStreamEvent-контракт, что AnthropicChatProvider, другой сырой
// протокол под капотом. OpenAI шлёт tool-call аргументы чанками ПО ИНДЕКСУ (не по id — id
// приходит только в первом чанке конкретного вызова), поддержка нескольких параллельных tool
// calls в одном ответе — по индексу в Map, не по одному активному вызову (в отличие от Anthropic,
// где content-блоки последовательны).
export class OpenAiChatProvider implements AiChatProvider {
  private readonly client: OpenAI;

  constructor(apiKey: string, private readonly model: string = DEFAULT_MODEL) {
    this.client = new OpenAI({ apiKey });
  }

  async *streamChat({
    messages,
    tools,
  }: {
    messages: ChatMessage[];
    tools?: ToolSchema[];
  }): AsyncIterable<ChatStreamEvent> {
    const pendingByIndex = new Map<number, PendingToolCall>();

    try {
      const stream = await this.client.chat.completions.create({
        model: this.model,
        stream: true,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        tools: tools?.map((t) => ({
          type: "function",
          function: { name: t.name, description: t.description, parameters: t.inputSchema },
        })),
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) yield { type: "text_delta", text: delta.content };

        for (const toolCallDelta of delta?.tool_calls ?? []) {
          const existing = pendingByIndex.get(toolCallDelta.index);
          if (!existing) {
            pendingByIndex.set(toolCallDelta.index, {
              id: toolCallDelta.id ?? "",
              name: toolCallDelta.function?.name ?? "",
              argsJson: toolCallDelta.function?.arguments ?? "",
            });
          } else {
            existing.argsJson += toolCallDelta.function?.arguments ?? "";
          }
        }

        if (chunk.choices[0]?.finish_reason) break;
      }

      for (const call of pendingByIndex.values()) {
        const args = call.argsJson ? (JSON.parse(call.argsJson) as Record<string, unknown>) : {};
        yield { type: "tool_call_proposed", id: call.id, tool: call.name, args };
      }
      yield { type: "done" };
    } catch (error) {
      yield { type: "error", message: error instanceof Error ? error.message : "Unknown provider error" };
    }
  }
}
