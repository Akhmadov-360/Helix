import { Module } from "@nestjs/common";
import { AuthzModule } from "../../core/authz/authz.module";
import { ActivityModule } from "../activity/activity.module";
import { AuthModule } from "../auth/auth.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { ProjectsModule } from "../projects/projects.module";
import { UsersModule } from "../users/users.module";
import { AttachmentCleanupProducer } from "./attachment-cleanup.producer";
import { AttachmentsController } from "./attachments.controller";
import { AttachmentsRepository } from "./attachments.repository";
import { AttachmentsService } from "./attachments.service";

// files.md §8 — S3Service приходит из глобального StorageModule (app.module.ts), не импортируется
// здесь явно (тот же приём, что PrismaService — глобальные core-сервисы не требуют re-import).
// ActivityModule/UsersModule — attachment.uploaded/deleted в ленте лида (P4), тот же приём, что
// TasksModule/PagesModule. exports: AttachmentsRepository (MaintenanceModule — §6.1 upload-cleanup) и
// AttachmentCleanupProducer (WorkspacesModule → ProjectsService.remove — §6).
@Module({
  imports: [AuthModule, AuthzModule, OrganizationsModule, ProjectsModule, ActivityModule, UsersModule],
  controllers: [AttachmentsController],
  providers: [AttachmentsService, AttachmentsRepository, AttachmentCleanupProducer],
  exports: [AttachmentsRepository, AttachmentCleanupProducer],
})
export class AttachmentsModule {}
