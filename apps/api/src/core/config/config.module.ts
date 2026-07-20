import { Global, Module } from "@nestjs/common";
import { getEnv, type Env } from "@helix/config";

/** DI-токен для валидированного env. Инъекция: `@Inject(ENV) env: Env`. */
export const ENV = Symbol("ENV");

/**
 * Оборачивает @helix/config в Nest-DI. `getEnv()` валидирует process.env и
 * бросает при невалидном (fail-fast). Значение кэшируется в самом пакете —
 * фабрика лишь пробрасывает его в контейнер.
 */
@Global()
@Module({
  providers: [{ provide: ENV, useFactory: (): Env => getEnv() }],
  exports: [ENV],
})
export class ConfigModule {}
