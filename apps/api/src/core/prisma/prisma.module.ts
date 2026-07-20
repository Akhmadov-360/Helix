import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

/** Глобальный модуль доступа к БД — PrismaService доступен без повторного импорта. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
