import { Module } from "@nestjs/common";
import { AuthzModule } from "../../core/authz/authz.module";
import { ActivityModule } from "../activity/activity.module";
import { AuthModule } from "../auth/auth.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { ProjectsModule } from "../projects/projects.module";
import { UsersModule } from "../users/users.module";
import { ProjectTasksController } from "./project-tasks.controller";
import { TaskRepository } from "./task.repository";
import { TasksController } from "./tasks.controller";
import { TasksService } from "./tasks.service";

// Чеклист сделки. ProjectsModule → ProjectsRepository (проект в орге), OrganizationsModule →
// assertOrgMember (assigneeId), ActivityModule → события task.created/completed (шаг 3),
// UsersModule → снапшот имён в payload (шаг 3), Auth/Authz → guard'ы.
@Module({
  imports: [
    AuthModule,
    OrganizationsModule,
    AuthzModule,
    ProjectsModule,
    ActivityModule,
    UsersModule,
  ],
  controllers: [ProjectTasksController, TasksController],
  providers: [TasksService, TaskRepository],
})
export class TasksModule {}
