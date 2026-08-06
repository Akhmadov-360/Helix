import { Global, Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import type { Env } from "@helix/config";
import { ENV } from "../config/config.module";

/** Единственная очередь этого среза (notifications.md §1). Webhooks (M5)/embeddings (M4)
 * получат свои имена здесь же, когда придёт их черёд — не отдельным модулем на очередь. */
export const EMAIL_QUEUE = "email";

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
      useFactory: (env: Env) => ({ connection: { url: env.REDIS_URL } }),
    }),
    BullModule.registerQueue({ name: EMAIL_QUEUE }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
