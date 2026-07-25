import { Module } from "@nestjs/common";
import { AuthzModule } from "../../core/authz/authz.module";
import { AuthModule } from "../auth/auth.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { CompaniesController } from "./companies.controller";
import { CompaniesRepository } from "./companies.repository";
import { CompaniesService } from "./companies.service";

// CRM: справочник контактов и компаний (org-scoped). AuthModule → JwtAuthGuard,
// OrganizationsModule → его зависимость (резолв роли), AuthzModule → PoliciesGuard.
@Module({
  imports: [AuthModule, OrganizationsModule, AuthzModule],
  controllers: [CompaniesController],
  providers: [CompaniesService, CompaniesRepository],
})
export class CrmModule {}
