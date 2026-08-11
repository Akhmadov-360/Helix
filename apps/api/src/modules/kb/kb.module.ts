import { Module } from "@nestjs/common";
import { AuthzModule } from "../../core/authz/authz.module";
import { AuthModule } from "../auth/auth.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { KbController } from "./kb.controller";
import { KbRepository } from "./kb.repository";
import { KbService } from "./kb.service";

// pages-kb.md §7. exports: KbRepository — WorkspacesModule (createFromBlueprint → kbSeed, §3).
@Module({
  imports: [AuthModule, AuthzModule, OrganizationsModule],
  controllers: [KbController],
  providers: [KbService, KbRepository],
  exports: [KbRepository],
})
export class KbModule {}
