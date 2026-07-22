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
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    JwtAuthGuard,
    RefreshSessionService,
    RefreshSessionsRepository,
    RefreshCookieService,
  ],
  // AuthService нужен RegistrationService'у (§9.1: регистрация просит токены у auth),
  // RefreshCookieService — её контроллеру, чтобы поставить ту же cookie.
  exports: [AuthService, TokenService, RefreshCookieService],
})
export class AuthModule {}
