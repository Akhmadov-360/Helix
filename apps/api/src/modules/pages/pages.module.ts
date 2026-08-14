import { Module } from "@nestjs/common";
import { AuthzModule } from "../../core/authz/authz.module";
import { ActivityModule } from "../activity/activity.module";
import { AiChatModule } from "../ai/ai-chat.module";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { ProjectsModule } from "../projects/projects.module";
import { UsersModule } from "../users/users.module";
import { PagesController } from "./pages.controller";
import { PagesRepository } from "./pages.repository";
import { PagesService } from "./pages.service";

// pages-kb.md §7 — Page + PageComment вместе, одна агрегатная граница (тот же приём, что
// Membership живёт в organizations.repository.ts, не отдельным модулем). ActivityModule/UsersModule —
// page.created/deleted в ленте лида (P4), тот же приём, что TasksModule для task.created/completed.
// AiChatModule — IngestEmbeddingsProducer/EmbeddingChunkRepository (ai-chat.md §3.1), НЕ воркер
// (см. AiChatModule комментарий про цикл модулей).
@Module({
  imports: [
    AuthModule,
    AuthzModule,
    OrganizationsModule,
    ProjectsModule,
    NotificationsModule,
    ActivityModule,
    UsersModule,
    AiChatModule,
  ],
  controllers: [PagesController],
  providers: [PagesService, PagesRepository],
  exports: [PagesRepository],
})
export class PagesModule {}
