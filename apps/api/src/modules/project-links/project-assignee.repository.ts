import { Injectable } from "@nestjs/common";
import type { Prisma } from "@helix/db";
import { PrismaService } from "../../core/prisma/prisma.service";

// Строка назначения + денорм пользователя для ответа (§ assignee): без второго запроса на фронте.
export interface ProjectAssigneeRow {
  userId: string;
  user: { name: string; email: string };
}

const ASSIGNEE_SELECT = {
  userId: true,
  user: { select: { name: true, email: true } },
} as const;

@Injectable()
export class ProjectAssigneeRepository {
  constructor(private readonly prisma: PrismaService) {}

  listByProject(projectId: string, tx?: Prisma.TransactionClient): Promise<ProjectAssigneeRow[]> {
    return (tx ?? this.prisma.client).projectAssignee.findMany({
      where: { projectId },
      select: ASSIGNEE_SELECT,
      orderBy: { userId: "asc" },
    });
  }

  findAssignee(
    projectId: string,
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<{ userId: string } | null> {
    return (tx ?? this.prisma.client).projectAssignee.findUnique({
      where: { projectId_userId: { projectId, userId } },
      select: { userId: true },
    });
  }

  create(
    projectId: string,
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ProjectAssigneeRow> {
    return (tx ?? this.prisma.client).projectAssignee.create({
      data: { projectId, userId },
      select: ASSIGNEE_SELECT,
    });
  }

  async delete(projectId: string, userId: string, tx?: Prisma.TransactionClient): Promise<void> {
    await (tx ?? this.prisma.client).projectAssignee.delete({
      where: { projectId_userId: { projectId, userId } },
    });
  }
}
