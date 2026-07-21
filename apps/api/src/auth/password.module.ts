import { Module } from "@nestjs/common";
import { PasswordService } from "./password.service";

/**
 * Отдельный модуль, а не часть AuthModule: хеширование нужно и регистрации
 * (application-сценарий), и логину (auth). Если бы PasswordService жил в AuthModule,
 * а AuthModule импортировал RegistrationModule ради контроллера — получился бы цикл.
 */
@Module({
  providers: [PasswordService],
  exports: [PasswordService],
})
export class PasswordModule {}
