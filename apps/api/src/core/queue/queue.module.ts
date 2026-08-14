import { Global, Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import type { Env } from "@helix/config";
import { ENV } from "../config/config.module";

/** Единственная очередь этого среза (notifications.md §1). Webhooks (M5)/embeddings (M4)
 * получат свои имена здесь же, когда придёт их черёд — не отдельным модулем на очередь. */
export const EMAIL_QUEUE = "email";

/** Repeatable/cron-джобы обслуживания (RefreshSession cleanup — первый потребитель). Отдельно от
 * EMAIL_QUEUE: это не письма, смешивать в дашборде очередей/метриках вводит в заблуждение. */
export const MAINTENANCE_QUEUE = "maintenance";

/** ai-chat.md §3.3 (ADR, decisions.md) — событийная (не cron), дорогая (внешний вызов
 * embedding-провайдера) джоба на каждый save Page/KBArticle/Attachment. Отдельно от
 * MAINTENANCE_QUEUE: другая природа нагрузки — не должна конкурировать за воркер с дешёвыми
 * периодическими cleanup-джобами и тормозить их. */
export const INGEST_EMBEDDINGS_QUEUE = "ingest-embeddings";

/**
 * BullMQ-подключение (Redis) — по аналогии с PrismaModule/ConfigModule: глобальный, поднимается
 * один раз, потребители инжектят `@InjectQueue(EMAIL_QUEUE)` без повторного импорта этого модуля.
 * Пока только регистрирует очередь — продюсер (NotificationsService) и консьюмер (EmailWorker)
 * заводятся отдельным срезом (notifications.md §9, шаг 5).
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        // BullMQ blocking commands (BRPOPLPUSH и т.п.) требуют этого явно — иначе ioredis
        // обрывает долгоживущее blocking-соединение по retry-лимиту, и Worker падает/зависает.
        // Задокументированное требование BullMQ, не наша прихоть.
        connection: { url: env.REDIS_URL, maxRetriesPerRequest: null },
      }),
    }),
    BullModule.registerQueue({ name: EMAIL_QUEUE }),
    BullModule.registerQueue({ name: MAINTENANCE_QUEUE }),
    BullModule.registerQueue({ name: INGEST_EMBEDDINGS_QUEUE }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
