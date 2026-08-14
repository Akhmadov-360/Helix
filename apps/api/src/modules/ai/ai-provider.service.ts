import { Inject, Injectable } from "@nestjs/common";
import {
  createChatProvider,
  createEmbeddingProvider,
  ProviderNotConfiguredError,
  ProviderNotImplementedError,
  type AiChatProvider,
  type AiEmbeddingProvider,
  type ChatProviderName,
  type EmbeddingProviderName,
} from "@helix/ai";
import type { OrganizationSettings } from "@helix/api-schemas";
import type { Env } from "@helix/config";
import { AiProviderNotConfiguredError, AiProviderNotImplementedError } from "../../core/errors/domain-error";
import { ENV } from "../../core/config/config.module";
import { OrganizationsRepository } from "../organizations/organizations.repository";

// ai-chat.md §5/§12 — секреты живут в env (деплой-уровень), КАКОЙ провайдер обслуживает организацию —
// в Organization.settings.aiProvider (per-org). Этот сервис — единственное место, где они
// соединяются; ни ingest-worker, ни query-пайплайн (§4/§78) не читают env/settings напрямую.
@Injectable()
export class AiProviderService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly organizations: OrganizationsRepository,
  ) {}

  async getChatProvider(orgId: string): Promise<AiChatProvider> {
    const settings = await this.readAiSettings(orgId);
    const name = (settings.provider ?? "anthropic") as ChatProviderName;
    try {
      return createChatProvider(name, this.credentials());
    } catch (error) {
      throw this.toDomainError(error, name);
    }
  }

  async getEmbeddingProvider(orgId: string): Promise<AiEmbeddingProvider> {
    const settings = await this.readAiSettings(orgId);
    // ADR (decisions.md) — embeddingProvider независим от provider (chat); "openai" — дефолт, не
    // "тот же, что chat", т.к. anthropic вообще не валиден здесь (embeddingProviderSchema это
    // и так гарантирует на уровне Zod, но settings могли быть сохранены до тайтенинга схемы).
    const name = (settings.embeddingProvider ?? "openai") as EmbeddingProviderName;
    try {
      return createEmbeddingProvider(name, this.credentials());
    } catch (error) {
      throw this.toDomainError(error, name);
    }
  }

  private async readAiSettings(orgId: string): Promise<NonNullable<OrganizationSettings["aiProvider"]>> {
    const org = await this.organizations.findSettings(orgId);
    const settings = (org?.settings ?? {}) as OrganizationSettings;
    return settings.aiProvider ?? {};
  }

  private credentials() {
    return {
      anthropicApiKey: this.env.ANTHROPIC_API_KEY,
      openAiApiKey: this.env.OPENAI_API_KEY,
      awsBedrockRegion: this.env.AWS_BEDROCK_REGION,
    };
  }

  private toDomainError(error: unknown, provider: string): Error {
    // code review: было общее сообщение на оба случая — админ, выбравший Bedrock, чинил бы
    // несуществующую проблему с API-ключом. Разные code → разные экраны/действия (§12).
    if (error instanceof ProviderNotConfiguredError) return new AiProviderNotConfiguredError(provider);
    if (error instanceof ProviderNotImplementedError) return new AiProviderNotImplementedError(provider);
    return error instanceof Error ? error : new Error(String(error));
  }
}
