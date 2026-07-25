import { Module } from "@nestjs/common";
import { AuthzModule } from "../../core/authz/authz.module";
import { ActivityModule } from "../activity/activity.module";
import { AuthModule } from "../auth/auth.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { PhasesModule } from "../phases/phases.module";
import { ProjectsModule } from "../projects/projects.module";
import { UsersModule } from "../users/users.module";
import { PhasesController } from "./phases.controller";
import { PhasesService } from "./phases.service";
import { ProjectsController } from "./projects.controller";
import { ProjectsService } from "./projects.service";
import { WorkspacesController } from "./workspaces.controller";
import { WorkspacesRepository } from "./workspaces.repository";
import { WorkspacesService } from "./workspaces.service";

// Агрегат доски: workspaces + phases + projects. Sub-resource контроллеры/сервисы объявлены
// здесь, репозитории — в своих leaf-модулях (phases/projects), поэтому зависимости идут
// в одну сторону (workspaces → phases/projects), без цикла модулей.
// OrganizationsModule — чтобы JwtAuthGuard резолвил OrganizationsRepository здесь.
@Module({
  imports: [
    AuthModule,
    OrganizationsModule,
    PhasesModule,
    ProjectsModule,
    UsersModule,
    ActivityModule,
    AuthzModule,
  ],
  controllers: [WorkspacesController, PhasesController, ProjectsController],
  providers: [WorkspacesService, WorkspacesRepository, PhasesService, ProjectsService],
})
export class WorkspacesModule {}
