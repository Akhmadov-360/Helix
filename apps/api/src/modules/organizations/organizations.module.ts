import { Module } from "@nestjs/common";
import { OrganizationsRepository } from "./organizations.repository";

// Остаётся leaf-модулем (только Prisma-зависимость): AuthModule импортирует его для
// OrganizationsRepository (роль/дефолтная орга). Контроллер сюда НЕ кладём — иначе цикл
// OrganizationsModule → AuthModule (за JwtAuthGuard) → OrganizationsModule. Ростер-эндпоинт
// живёт в AuthModule (см. её комментарий) — тот же приём, что WorkspacesModule хостит
// Phases/Projects-контроллеры ради своих зависимостей.
@Module({
  providers: [OrganizationsRepository],
  exports: [OrganizationsRepository],
})
export class OrganizationsModule {}
