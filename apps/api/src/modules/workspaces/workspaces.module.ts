import { Module } from "@nestjs/common";
import { AuthzModule } from "../../core/authz/authz.module";
import { ActivityModule } from "../activity/activity.module";
import { AiChatModule } from "../ai/ai-chat.module";
import { AttachmentsModule } from "../attachments/attachments.module";
import { AuthModule } from "../auth/auth.module";
import { BlueprintsModule } from "../blueprints/blueprints.module";
import { FieldsModule } from "../fields/fields.module";
import { KbModule } from "../kb/kb.module";
import { PagesModule } from "../pages/pages.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { PhasesModule } from "../phases/phases.module";
import { ProjectsModule } from "../projects/projects.module";
import { UsersModule } from "../users/users.module";
import { FieldsController } from "./fields.controller";
import { FieldsService } from "./fields.service";
import { PhasesController } from "./phases.controller";
import { PhasesService } from "./phases.service";
import { ProjectsController } from "./projects.controller";
import { ProjectsService } from "./projects.service";
import { WorkspacesController } from "./workspaces.controller";
import { WorkspacesRepository } from "./workspaces.repository";
import { WorkspacesService } from "./workspaces.service";

// Агрегат доски: workspaces + phases + fields + projects. Sub-resource контроллеры/сервисы
// объявлены здесь, репозитории — в своих leaf-модулях (phases/fields/projects), поэтому
// зависимости идут в одну сторону (workspaces → phases/fields/projects), без цикла модулей.
// OrganizationsModule — чтобы JwtAuthGuard резолвил OrganizationsRepository здесь.
@Module({
  imports: [
    AuthModule,
    BlueprintsModule,
    OrganizationsModule,
    PhasesModule,
    FieldsModule,
    ProjectsModule,
    UsersModule,
    ActivityModule,
    AuthzModule,
    NotificationsModule,
    AttachmentsModule,
    KbModule,
    PagesModule,
    AiChatModule,
  ],
  controllers: [WorkspacesController, PhasesController, FieldsController, ProjectsController],
  providers: [WorkspacesService, WorkspacesRepository, PhasesService, FieldsService, ProjectsService],
})
export class WorkspacesModule {}
