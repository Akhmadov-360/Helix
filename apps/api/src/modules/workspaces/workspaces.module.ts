import { Module } from "@nestjs/common";
import { AuthzModule } from "../../core/authz/authz.module";
import { AuthModule } from "../auth/auth.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { PhasesModule } from "../phases/phases.module";
import { ProjectsModule } from "../projects/projects.module";
import { PhasesController } from "./phases.controller";
import { PhasesService } from "./phases.service";
import { WorkspacesController } from "./workspaces.controller";
import { WorkspacesRepository } from "./workspaces.repository";
import { WorkspacesService } from "./workspaces.service";

// Фазы — часть агрегата воркспейса (создание фазы бампает version доски), поэтому
// PhasesController/Service объявлены здесь, а не в PhasesModule (тот — чистый data-access).
// Так зависимость идёт только workspaces → phases, без цикла модулей.
// OrganizationsModule нужен, чтобы JwtAuthGuard резолвил OrganizationsRepository здесь.
@Module({
  imports: [AuthModule, OrganizationsModule, PhasesModule, ProjectsModule, AuthzModule],
  controllers: [WorkspacesController, PhasesController],
  providers: [WorkspacesService, WorkspacesRepository, PhasesService],
})
export class WorkspacesModule {}
