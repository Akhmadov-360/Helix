import { Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { ConfigModule } from "./core/config/config.module";
import { PrismaModule } from "./core/prisma/prisma.module";
import { HealthModule } from "./health/health.module";
import { AllExceptionsFilter } from "./core/filters/all-exceptions.filter";
import { ResponseTransformInterceptor } from "./core/interceptors/response-transform.interceptor";
import { TenantContextInterceptor } from "./core/interceptors/tenant-context.interceptor";

@Module({
  imports: [ConfigModule, PrismaModule, HealthModule],
  providers: [
    // Глобальные cross-cutting провайдеры через APP_* (DI-friendly).
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Порядок важен: tenant-context ставит ALS до handler'а, response оборачивает после.
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseTransformInterceptor },
  ],
})
export class AppModule {}
