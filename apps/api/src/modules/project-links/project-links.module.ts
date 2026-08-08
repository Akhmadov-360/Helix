import { Module } from "@nestjs/common";
import { AuthzModule } from "../../core/authz/authz.module";
import { AuthModule } from "../auth/auth.module";
import { CrmModule } from "../crm/crm.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { ProjectsModule } from "../projects/projects.module";
import { ProjectAssigneeRepository } from "./project-assignee.repository";
import { ProjectAssigneesController } from "./project-assignees.controller";
import { ProjectAssigneesService } from "./project-assignees.service";
import { ProjectContactRepository } from "./project-contact.repository";
import { ProjectContactsController } from "./project-contacts.controller";
import { ProjectContactsService } from "./project-contacts.service";

// Связи лида: контакты сделки (Member+) и co-workers (Manager+). Project-scoped.
// ProjectsModule → ProjectsRepository (проект в орге), CrmModule → ContactsRepository (контакт +
// mergedIntoId), OrganizationsModule → membership-guard (assertOrgMember), Auth/Authz → guard'ы,
// NotificationsModule → письмо назначенному co-worker'у (FR-NOTIF-2).
@Module({
  imports: [AuthModule, OrganizationsModule, AuthzModule, ProjectsModule, CrmModule, NotificationsModule],
  controllers: [ProjectContactsController, ProjectAssigneesController],
  providers: [
    ProjectContactsService,
    ProjectContactRepository,
    ProjectAssigneesService,
    ProjectAssigneeRepository,
  ],
})
export class ProjectLinksModule {}
