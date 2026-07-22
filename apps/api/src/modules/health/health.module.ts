import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";

/** PrismaService приходит из глобального PrismaModule — импорт не нужен. */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
