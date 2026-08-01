import { Module } from "@nestjs/common";
import { JwtModule, type JwtSignOptions } from "@nestjs/jwt";
import type { Env } from "@helix/config";
import { ENV } from "../../core/config/config.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { UsersModule } from "../users/users.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { PasswordModule } from "./password.module";
import { RefreshCookieService } from "./sessions/refresh-cookie.service";
import { RefreshSessionService } from "./sessions/refresh-session.service";
import { RefreshSessionsRepository } from "./sessions/refresh-sessions.repository";
import { TokenService } from "./token.service";
import { OrganizationsController } from "../organizations/organizations.controller";
import { OrganizationsService } from "../organizations/organizations.service";

@Module({
  imports: [
    UsersModule,
    OrganizationsModule,
    PasswordModule,
    // Секрет и TTL берём из валидированного env, а не из process.env напрямую:
    // приложение уже не поднимется с невалидным JWT_SECRET (проверка на старте).
    JwtModule.registerAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        secret: env.JWT_SECRET,
        signOptions: {
          // jsonwebtoken типизирует expiresIn литеральным шаблоном ms ("15m" | "7d" | …),
          // а из env приходит обычная строка — вывести шаблонный тип из рантайм-значения
          // нельзя. Формат проверяет сам jsonwebtoken на старте: неверный уронит выдачу
          // токена сразу, а не тихо.
          expiresIn: env.JWT_EXPIRES_IN as JwtSignOptions["expiresIn"],
        },
      }),
    }),
  ],
  // OrganizationsController — здесь, не в OrganizationsModule (см. её комментарий):
  // избегаем цикла OrganizationsModule↔AuthModule, а AuthModule уже импортирует
  // OrganizationsModule (за OrganizationsRepository) и сам содержит JwtAuthGuard.
  controllers: [AuthController, OrganizationsController],
  providers: [
    AuthService,
    TokenService,
    JwtAuthGuard,
    RefreshSessionService,
    RefreshSessionsRepository,
    RefreshCookieService,
    OrganizationsService,
  ],
  // AuthService нужен RegistrationService'у (§9.1: регистрация просит токены у auth),
  // RefreshCookieService — её контроллеру; JwtAuthGuard — другим модулям (@UseGuards).
  exports: [AuthService, TokenService, RefreshCookieService, JwtAuthGuard],
})
export class AuthModule {}
