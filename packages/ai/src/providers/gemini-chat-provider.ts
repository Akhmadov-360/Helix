import { GoogleGenAI, type FunctionCall, type Part } from "@google/genai";
import type { AiChatProvider, ChatMessage, ChatStreamEvent, ToolSchema } from "../types";

// gemini-3.6-flash — бесплатный tier в Google AI Studio, 1M-контекст. Идёт как chat-провайдер
// под тем же контрактом, что Anthropic/OpenAI — маппинг: Google называет ассистентскую роль
// "model" (не "assistant"), а system prompt подаётся отдельным полем config.systemInstruction,
// а не сообщением в contents[]. NB: gemini-2.0-flash был deprecated Google'ом (404 на живом
// запросе, 2026-08-19) — если снова упадёт с 404 про "no longer available", обновить название
// модели тут (Google меняет их каждые несколько месяцев).
const DEFAULT_MODEL = "gemini-3.6-flash";

export class GeminiChatProvider implements AiChatProvider {
  private readonly client: GoogleGenAI;

  constructor(apiKey: string, private readonly model: string = DEFAULT_MODEL) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async *streamChat({
    messages,
    tools,
  }: {
    messages: ChatMessage[];
    tools?: ToolSchema[];
  }): AsyncIterable<ChatStreamEvent> {
    const systemInstruction = messages.find((m) => m.role === "system")?.content;
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }] as Part[],
      }));

    try {
      const stream = await this.client.models.generateContentStream({
        model: this.model,
        contents,
        config: {
          ...(systemInstruction ? { systemInstruction } : {}),
          ...(tools && tools.length > 0
            ? {
                tools: [
                  {
                    functionDeclarations: tools.map((t) => ({
                      name: t.name,
                      description: t.description,
                      // Google принимает JSON Schema напрямую в parametersJsonSchema — тот же формат,
                      // что мы уже строим из Zod для Anthropic/OpenAI, не нужен отдельный конвертер.
                      parametersJsonSchema: t.inputSchema,
                    })),
                  },
                ],
              }
            : {}),
        },
      });

      for await (const chunk of stream) {
        const text = chunk.text;
        if (text) yield { type: "text_delta", text };

        // Gemini возвращает готовые function calls целиком в одном chunk (не по частям, как OpenAI/
        // Anthropic input_json_delta) — id генерируем сами, у Google его нет в ответе, apps/api
        // использует его только как ключ для последующего confirm/reject (ai-chat.md §6).
        const calls: FunctionCall[] | undefined = chunk.functionCalls;
        if (calls) {
          for (const call of calls) {
            yield {
              type: "tool_call_proposed",
              id: call.id ?? `gemini-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
              tool: call.name ?? "",
              args: (call.args ?? {}) as Record<string, unknown>,
            };
          }
        }
      }
      yield { type: "done" };
    } catch (error) {
      yield { type: "error", message: error instanceof Error ? error.message : "Unknown provider error" };
    }
  }
}
