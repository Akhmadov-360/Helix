import { Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { ConfigModule } from "./core/config/config.module";
import { PrismaModule } from "./core/prisma/prisma.module";
import { QueueModule } from "./core/queue/queue.module";
import { AuthModule } from "./modules/auth/auth.module";
import { RegistrationModule } from "./modules/registration/registration.module";
import { WorkspacesModule } from "./modules/workspaces/workspaces.module";
import { CrmModule } from "./modules/crm/crm.module";
import { ProjectLinksModule } from "./modules/project-links/project-links.module";
import { TasksModule } from "./modules/tasks/tasks.module";
import { HealthModule } from "./modules/health/health.module";
import { AllExceptionsFilter } from "./core/filters/all-exceptions.filter";
import { ResponseTransformInterceptor } from "./core/interceptors/response-transform.interceptor";

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    QueueModule,
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
    { provide: APP_INTERCEPTOR, useClass: ResponseTransformInterceptor },
  ],
})
export class AppModule {}
