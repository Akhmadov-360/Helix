import { Injectable } from "@nestjs/common";
import type { Prisma } from "@helix/db";
import { PrismaService } from "../../core/prisma/prisma.service";

export interface ActivityEventRow {
  id: string;
  type: string;
  schemaVersion: number;
  actorId: string | null;
  payload: Prisma.JsonValue;
  createdAt: Date;
}

const EVENT_SELECT = {
  id: true,
  type: true,
  schemaVersion: true,
  actorId: true,
  payload: true,
  createdAt: true,
} as const;

@Injectable()
export class ActivityRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Лента проекта: новые сверху (индекс [projectId, createdAt desc]). Tenant-скоуп —
  // вызывающий сначала проверяет проект по орге (§10).
  listByProject(projectId: string): Promise<ActivityEventRow[]> {
    return this.prisma.client.activityEvent.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      select: EVENT_SELECT,
    });
  }
}
