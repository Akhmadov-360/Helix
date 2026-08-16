import type { AiChatProvider, AiEmbeddingProvider, ChatStreamEvent } from "@helix/ai";

// ai-chat.md §10: "реальные ответы реальных LLM-провайдеров... не тестируем — только контракт
// адаптера через mock". EmbeddingChunk.embedding — vector(1536) (CLAUDE.md manual point #8),
// поэтому даже фиктивный эмбеддинг обязан быть строго 1536-мерным, иначе INSERT в raw SQL упадёт
// на несовпадении размерности pgvector-колонки, а не на том, что тест собирался проверить.
const EMBEDDING_DIMENSIONS = 1536;

export class MockEmbeddingProvider implements AiEmbeddingProvider {
  async embed(texts: string[]): Promise<number[][]> {
    // Одинаковый вектор для всех текстов — тесты этого модуля проверяют SQL-фильтр retrieval
    // (orgId/projectId/workspaceId), не семантическое ранжирование: реальная релевантность здесь
    // не наблюдаема без настоящей embedding-модели, а MVP-скоуп её и не требует (§0).
    return texts.map(() => Array<number>(EMBEDDING_DIMENSIONS).fill(0.01));
  }
}

/**
 * Сценарий следующего ответа провайдера — тест выставляет ДО запроса через `script`,
 * `streamChat()` проигрывает его как есть. Тесты в этом файле последовательны
 * (vitest.config.ts: fileParallelism/sequential — тот же режим, что уже используют
 * pages.spec.ts/attachments.spec.ts для общего MailHog), поэтому общий mutable script безопасен.
 */
export class MockChatProvider implements AiChatProvider {
  static script: ChatStreamEvent[] = [{ type: "text_delta", text: "Mock response." }, { type: "done" }];

  async *streamChat(): AsyncIterable<ChatStreamEvent> {
    for (const event of MockChatProvider.script) {
      yield event;
    }
  }
}

export class MockAiProviderService {
  async getChatProvider(): Promise<AiChatProvider> {
    return new MockChatProvider();
  }

  async getEmbeddingProvider(): Promise<AiEmbeddingProvider> {
    return new MockEmbeddingProvider();
  }
}
