import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../../core/prisma/prisma.service";

interface HealthStatus {
  status: "ok" | "degraded";
  db: "up" | "down";
}

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOkResponse({ description: "Liveness + DB connectivity" })
  async check(): Promise<HealthStatus> {
    let db: "up" | "down" = "down";
    try {
      await this.prisma.client.$queryRaw`SELECT 1`;
      db = "up";
    } catch {
      db = "down";
    }
    return { status: db === "up" ? "ok" : "degraded", db };
  }
}
