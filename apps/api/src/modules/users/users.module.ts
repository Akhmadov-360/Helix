import { Module } from "@nestjs/common";
import { UsersRepository } from "./users.repository";

/**
 * User — доменная сущность из schema.prisma, а не артефакт auth. Auth её потребляет,
 * но не владеет: дальше к ней придут assignees/members/профиль.
 */
@Module({
  providers: [UsersRepository],
  exports: [UsersRepository],
})
export class UsersModule {}
