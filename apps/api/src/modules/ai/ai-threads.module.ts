import { Module } from "@nestjs/common";
import { AuthzModule } from "../../core/authz/authz.module";
import { ActivityModule } from "../activity/activity.module";
import { AuthModule } from "../auth/auth.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { ProjectsModule } from "../projects/projects.module";
import { TasksModule } from "../tasks/tasks.module";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import { AiChatModule } from "./ai-chat.module";
import { AiThreadsController } from "./ai-threads.controller";
import { AiThreadsRepository } from "./ai-threads.repository";
import { AiThreadsService } from "./ai-threads.service";
import { ToolCallExecutor } from "./tool-call-executor";

// ai-chat.md §4/§8 — query-пайплайн: AiChatModule даёт AiProviderService + EmbeddingChunkRepository
// (те же, что использует ingest-пайплайн, §3), ProjectsModule/ActivityModule — structured injection
// (§2). §6 шаг 3 — ToolCallExecutor исполняет side-effecting tool-call'ы ЧЕРЕЗ существующие
// сервисы, не напрямую в БД: WorkspacesModule (экспортирует ProjectsService — move/update_field) +
// TasksModule (create_task). Нет цикла: ни один из них не импортирует AiThreadsModule обратно.
@Module({
  imports: [AuthModule, AuthzModule, OrganizationsModule, ProjectsModule, ActivityModule, AiChatModule, WorkspacesModule, TasksModule],
  controllers: [AiThreadsController],
  providers: [AiThreadsService, AiThreadsRepository, ToolCallExecutor],
})
export class AiThreadsModule {}
