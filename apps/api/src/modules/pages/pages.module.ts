import { Module } from "@nestjs/common";
import { AuthzModule } from "../../core/authz/authz.module";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { ProjectsModule } from "../projects/projects.module";
import { PagesController } from "./pages.controller";
import { PagesRepository } from "./pages.repository";
import { PagesService } from "./pages.service";

// pages-kb.md §7 — Page + PageComment вместе, одна агрегатная граница (тот же приём, что
// Membership живёт в organizations.repository.ts, не отдельным модулем).
@Module({
  imports: [AuthModule, AuthzModule, OrganizationsModule, ProjectsModule, NotificationsModule],
  controllers: [PagesController],
  providers: [PagesService, PagesRepository],
  exports: [PagesRepository],
})
export class PagesModule {}
