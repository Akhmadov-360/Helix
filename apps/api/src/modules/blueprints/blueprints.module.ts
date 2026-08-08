import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AuthzModule } from "../../core/authz/authz.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { BlueprintsController } from "./blueprints.controller";
import { BlueprintsRepository } from "./blueprints.repository";
import { BlueprintsService } from "./blueprints.service";

// BlueprintsRepository экспортируется отдельно: WorkspacesModule импортирует этот модуль только
// за ним (инстанцирование, §3) — не за BlueprintsService/контроллером.
// OrganizationsModule — тот же приём, что workspaces.module.ts: JwtAuthGuard резолвит
// OrganizationsRepository здесь же, иначе DI не находит его в этом модуле.
@Module({
  imports: [AuthModule, AuthzModule, OrganizationsModule],
  controllers: [BlueprintsController],
  providers: [BlueprintsService, BlueprintsRepository],
  exports: [BlueprintsRepository],
})
export class BlueprintsModule {}
