import { Module } from "@nestjs/common";
import { AuthzModule } from "../../core/authz/authz.module";
import { AuthModule } from "../auth/auth.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { CompaniesController } from "./companies.controller";
import { CompaniesRepository } from "./companies.repository";
import { CompaniesService } from "./companies.service";
import { ContactsController } from "./contacts.controller";
import { ContactsRepository } from "./contacts.repository";
import { ContactsService } from "./contacts.service";
import { AuditRecorder } from "./audit.recorder";

// CRM: справочник контактов и компаний (org-scoped). AuthModule → JwtAuthGuard,
// OrganizationsModule → его зависимость (резолв роли), AuthzModule → PoliciesGuard.
@Module({
  imports: [AuthModule, OrganizationsModule, AuthzModule],
  controllers: [CompaniesController, ContactsController],
  providers: [
    CompaniesService,
    CompaniesRepository,
    ContactsService,
    ContactsRepository,
    AuditRecorder,
  ],
  // ProjectLinksModule (срез связей) читает контакт по id + mergedIntoId при привязке к сделке.
  exports: [ContactsRepository],
})
export class CrmModule {}
