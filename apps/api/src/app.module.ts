import { Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { ConfigModule } from "./core/config/config.module";
import { PrismaModule } from "./core/prisma/prisma.module";
import { AuthModule } from "./modules/auth/auth.module";
import { RegistrationModule } from "./modules/registration/registration.module";
import { WorkspacesModule } from "./modules/workspaces/workspaces.module";
import { CrmModule } from "./modules/crm/crm.module";
import { ProjectLinksModule } from "./modules/project-links/project-links.module";
import { TasksModule } from "./modules/tasks/tasks.module";
import { HealthModule } from "./modules/health/health.module";
import { AllExceptionsFilter } from "./core/filters/all-exceptions.filter";
import { ResponseTransformInterceptor } from "./core/interceptors/response-transform.interceptor";
import { TenantContextInterceptor } from "./core/interceptors/tenant-context.interceptor";

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuthModule,
    RegistrationModule,
    WorkspacesModule,
    CrmModule,
    ProjectLinksModule,
    TasksModule,
    HealthModule,
  ],
  providers: [
    // Глобальные cross-cutting провайдеры через APP_* (DI-friendly).
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Порядок важен: tenant-context ставит ALS до handler'а, response оборачивает после.
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseTransformInterceptor },
  ],
})
export class AppModule {}
