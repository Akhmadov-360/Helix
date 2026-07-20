import {
  Injectable,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
} from "@nestjs/common";
import { prisma, type PrismaClient } from "@helix/db";

/**
 * Обёртка над singleton-клиентом из @helix/db (не создаём новый — один пул на
 * процесс, одна точка для tenant-middleware в M1). Управляет жизненным циклом
 * соединения через lifecycle-хуки Nest.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  /** Прямой доступ к Prisma Client. Репозитории (M1+) ходят через него. */
  readonly client: PrismaClient = prisma;

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
    this.logger.log("Prisma connected");
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
