import { AnthropicChatProvider } from "./providers/anthropic-chat-provider";
import { GeminiChatProvider } from "./providers/gemini-chat-provider";
import { GeminiEmbeddingProvider } from "./providers/gemini-embedding-provider";
import { OpenAiChatProvider } from "./providers/openai-chat-provider";
import { OpenAiEmbeddingProvider } from "./providers/openai-embedding-provider";
import type {
  AiChatProvider,
  AiEmbeddingProvider,
  ChatProviderName,
  EmbeddingProviderName,
  ProviderCredentials,
} from "./types";

// ai-chat.md §12 — "orgId без сконфигурированного aiProvider → 422", не тихий fallback. apps/api
// ловит эту ошибку по типу (не по строке сообщения) и маппит в свой домен-специфичный error.
export class ProviderNotConfiguredError extends Error {
  constructor(public readonly provider: string) {
    super(`AI provider "${provider}" has no credentials configured`);
    this.name = "ProviderNotConfiguredError";
  }
}

// Bedrock — ai-chat.md §11 Фаза 1: "можно вторым", осознанно не реализован в этом заходе.
// Явная ошибка, не молчаливое падение через switch-default.
export class ProviderNotImplementedError extends Error {
  constructor(public readonly provider: string) {
    super(`AI provider "${provider}" is not implemented yet`);
    this.name = "ProviderNotImplementedError";
  }
}

export function createChatProvider(name: ChatProviderName, creds: ProviderCredentials, model?: string): AiChatProvider {
  switch (name) {
    case "anthropic":
      if (!creds.anthropicApiKey) throw new ProviderNotConfiguredError("anthropic");
      return new AnthropicChatProvider(creds.anthropicApiKey, model);
    case "openai":
      if (!creds.openAiApiKey) throw new ProviderNotConfiguredError("openai");
      return new OpenAiChatProvider(creds.openAiApiKey, model);
    case "gemini":
      if (!creds.googleAiApiKey) throw new ProviderNotConfiguredError("gemini");
      return new GeminiChatProvider(creds.googleAiApiKey, model);
    case "bedrock":
      throw new ProviderNotImplementedError("bedrock");
  }
}

export function createEmbeddingProvider(name: EmbeddingProviderName, creds: ProviderCredentials, model?: string): AiEmbeddingProvider {
  switch (name) {
    case "openai":
      if (!creds.openAiApiKey) throw new ProviderNotConfiguredError("openai");
      return new OpenAiEmbeddingProvider(creds.openAiApiKey, model);
    case "gemini":
      if (!creds.googleAiApiKey) throw new ProviderNotConfiguredError("gemini");
      return new GeminiEmbeddingProvider(creds.googleAiApiKey, model);
    case "bedrock":
      throw new ProviderNotImplementedError("bedrock");
  }
}
