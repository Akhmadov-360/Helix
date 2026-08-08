import { Module } from "@nestjs/common";
import { AuthzModule } from "../../core/authz/authz.module";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { PasswordModule } from "../auth/password.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { UsersModule } from "../users/users.module";
import { InvitesController } from "./invites.controller";
import { InvitesRepository } from "./invites.repository";
import { InvitesService } from "./invites.service";

// AuthModule → AuthService.issueFor (accept сразу логинит, §3) + RefreshCookieService (контроллер).
// OrganizationsModule → addMember/findMembershipRole/findById. UsersModule → findByEmailWithHash/
// create/findProfileById. PasswordModule → хеш пароля (ветка REGISTER). NotificationsModule →
// enqueueOrgInvite. AuditModule → invite.created/accepted/revoked. AuthzModule → PoliciesGuard.
@Module({
  imports: [AuthModule, PasswordModule, OrganizationsModule, UsersModule, NotificationsModule, AuditModule, AuthzModule],
  controllers: [InvitesController],
  providers: [InvitesService, InvitesRepository],
})
export class InvitesModule {}
