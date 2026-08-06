import { Module } from "@nestjs/common";
import { AuthzModule } from "../../core/authz/authz.module";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { CompaniesController } from "./companies.controller";
import { CompaniesRepository } from "./companies.repository";
import { CompaniesService } from "./companies.service";
import { ContactsController } from "./contacts.controller";
import { ContactsRepository } from "./contacts.repository";
import { ContactsService } from "./contacts.service";

// CRM: справочник контактов и компаний (org-scoped). AuthModule → JwtAuthGuard,
// OrganizationsModule → его зависимость (резолв роли), AuthzModule → PoliciesGuard,
// AuditModule → AuditRecorder (contact.merged).
@Module({
  imports: [AuthModule, OrganizationsModule, AuthzModule, AuditModule],
  controllers: [CompaniesController, ContactsController],
  providers: [CompaniesService, CompaniesRepository, ContactsService, ContactsRepository],
  // ProjectLinksModule (срез связей) читает контакт по id + mergedIntoId при привязке к сделке.
  exports: [ContactsRepository],
})
export class CrmModule {}
