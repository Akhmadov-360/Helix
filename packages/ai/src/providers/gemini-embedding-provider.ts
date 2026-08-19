import { GoogleGenAI } from "@google/genai";
import type { AiEmbeddingProvider } from "../types";

// gemini-embedding-001 — Matryoshka Representation Learning: модель родно на 3072 dimensions, но
// можно запросить усечённый вектор через outputDimensionality без потери семантической близости
// на разумных N (первая половина измерений несёт основную информацию, обучено так специально).
// Берём 1536 ровно потому, что EmbeddingChunk.embedding = vector(1536) (schema.prisma, зафиксирован
// под OpenAI text-embedding-3-small в оригинальном M4-заходе) — это позволяет добавить Google-
// провайдера БЕЗ миграции колонки и переиндексации всех Pages/KB/Attachments.
const DEFAULT_MODEL = "gemini-embedding-001";
const OUTPUT_DIMENSIONALITY = 1536;

export class GeminiEmbeddingProvider implements AiEmbeddingProvider {
  private readonly client: GoogleGenAI;

  constructor(apiKey: string, private readonly model: string = DEFAULT_MODEL) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const res = await this.client.models.embedContent({
      model: this.model,
      contents: texts,
      config: { outputDimensionality: OUTPUT_DIMENSIONALITY },
    });
    // .embeddings — массив в порядке contents; .values — сам вектор. Если Google вернул что-то
    // без values (защита от невалидного ответа), падаем громко, а не молча пишем undefined в БД.
    return (res.embeddings ?? []).map((e, i) => {
      if (!e.values) throw new Error(`Gemini embedding[${i}] missing values`);
      return e.values;
    });
  }
}
