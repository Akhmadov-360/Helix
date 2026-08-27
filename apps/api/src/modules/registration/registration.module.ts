import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PasswordModule } from "../auth/password.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { UsersModule } from "../users/users.module";
import { RegistrationController } from "./registration.controller";
import { RegistrationService } from "./registration.service";

/**
 * Зависимость идёт в ОДНУ сторону: registration → auth. Обратной нет, поэтому
 * цикла модулей не возникает (см. комментарий в RegistrationController).
 */
@Module({
  imports: [UsersModule, OrganizationsModule, PasswordModule, AuthModule, NotificationsModule],
  controllers: [RegistrationController],
  providers: [RegistrationService],
})
export class RegistrationModule {}
