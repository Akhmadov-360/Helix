import { Module } from "@nestjs/common";
import { AuthzModule } from "../../core/authz/authz.module";
import { AuthModule } from "../auth/auth.module";
import { CrmModule } from "../crm/crm.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { ProjectsModule } from "../projects/projects.module";
import { ProjectContactRepository } from "./project-contact.repository";
import { ProjectContactsController } from "./project-contacts.controller";
import { ProjectContactsService } from "./project-contacts.service";

// Связи лида: контакты сделки (Member+) и co-workers (Manager+, шаг 4). Project-scoped.
// ProjectsModule → ProjectsRepository (проект в орге), CrmModule → ContactsRepository (контакт +
// mergedIntoId), Auth/Organizations/Authz → guard'ы.
@Module({
  imports: [AuthModule, OrganizationsModule, AuthzModule, ProjectsModule, CrmModule],
  controllers: [ProjectContactsController],
  providers: [ProjectContactsService, ProjectContactRepository],
})
export class ProjectLinksModule {}
