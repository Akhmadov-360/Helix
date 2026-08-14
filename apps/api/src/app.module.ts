import { Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { ConfigModule } from "./core/config/config.module";
import { PrismaModule } from "./core/prisma/prisma.module";
import { QueueModule } from "./core/queue/queue.module";
import { StorageModule } from "./core/storage/storage.module";
import { AuthModule } from "./modules/auth/auth.module";
import { BlueprintsModule } from "./modules/blueprints/blueprints.module";
import { RegistrationModule } from "./modules/registration/registration.module";
import { WorkspacesModule } from "./modules/workspaces/workspaces.module";
import { CrmModule } from "./modules/crm/crm.module";
import { ProjectLinksModule } from "./modules/project-links/project-links.module";
import { TasksModule } from "./modules/tasks/tasks.module";
import { HealthModule } from "./modules/health/health.module";
import { MaintenanceModule } from "./modules/maintenance/maintenance.module";
import { InvitesModule } from "./modules/invites/invites.module";
import { AttachmentsModule } from "./modules/attachments/attachments.module";
import { PagesModule } from "./modules/pages/pages.module";
import { KbModule } from "./modules/kb/kb.module";
import { IngestEmbeddingsModule } from "./modules/ai/ingest-embeddings.module";
import { AllExceptionsFilter } from "./core/filters/all-exceptions.filter";
import { ResponseTransformInterceptor } from "./core/interceptors/response-transform.interceptor";

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    QueueModule,
    StorageModule,
    AuthModule,
    BlueprintsModule,
    RegistrationModule,
    WorkspacesModule,
    CrmModule,
    ProjectLinksModule,
    TasksModule,
    HealthModule,
    MaintenanceModule,
    InvitesModule,
    AttachmentsModule,
    PagesModule,
    KbModule,
    IngestEmbeddingsModule,
  ],
  providers: [
    // Глобальные cross-cutting провайдеры через APP_* (DI-friendly).
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseTransformInterceptor },
  ],
})
export class AppModule {}
