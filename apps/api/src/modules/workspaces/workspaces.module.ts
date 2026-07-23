import { Module } from "@nestjs/common";
import { AuthzModule } from "../../core/authz/authz.module";
import { AuthModule } from "../auth/auth.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { PhasesModule } from "../phases/phases.module";
import { WorkspacesController } from "./workspaces.controller";
import { WorkspacesRepository } from "./workspaces.repository";
import { WorkspacesService } from "./workspaces.service";

// OrganizationsModule нужен, чтобы JwtAuthGuard (используется тут через @UseGuards)
// резолвил свою зависимость OrganizationsRepository в контексте этого модуля.
@Module({
  imports: [AuthModule, OrganizationsModule, PhasesModule, AuthzModule],
  controllers: [WorkspacesController],
  providers: [WorkspacesService, WorkspacesRepository],
})
export class WorkspacesModule {}
