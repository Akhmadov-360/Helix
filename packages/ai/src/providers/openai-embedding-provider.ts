import OpenAI from "openai";
import type { AiEmbeddingProvider } from "../types";

// text-embedding-3-small — 1536 измерений, ровно то, что зафиксировано в EmbeddingChunk.embedding
// (vector(1536), schema.prisma). Смена модели на другую размерность требует новой колонки —
// см. ADR в decisions.md, не runtime-параметр.
const DEFAULT_MODEL = "text-embedding-3-small";

export class OpenAiEmbeddingProvider implements AiEmbeddingProvider {
  private readonly client: OpenAI;

  constructor(apiKey: string, private readonly model: string = DEFAULT_MODEL) {
    this.client = new OpenAI({ apiKey });
  }

  // Batched — один вызов на все чанки источника (ai-chat.md §3.2: "не по одному чанку за вызов").
  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const res = await this.client.embeddings.create({ model: this.model, input: texts });
    return res.data.map((d) => d.embedding);
  }
}
