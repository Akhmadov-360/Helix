import type { Prisma } from "@helix/db";
import type { BoardProjectResponse, ProjectResponse, ProjectStatus } from "@helix/api-schemas";

export interface ProjectRow {
  id: string;
  workspaceId: string;
  phaseId: string;
  title: string;
  status: ProjectStatus;
  value: Prisma.Decimal | null;
  currency: string | null;
  source: string | null;
  companyId: string | null;
  ownerId: string | null;
  rank: string;
  createdAt: Date;
  updatedAt: Date;
}

export function toProjectResponse(p: ProjectRow): ProjectResponse {
  return {
    id: p.id,
    workspaceId: p.workspaceId,
    phaseId: p.phaseId,
    title: p.title,
    status: p.status,
    // Decimal(14,2) ≤ ~10^14 < 2^53 → number без потери точности (см. api-schemas).
    value: p.value === null ? null : Number(p.value),
    currency: p.currency,
    source: p.source,
    companyId: p.companyId,
    ownerId: p.ownerId,
    rank: p.rank,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export function toBoardProjectResponse(
  p: ProjectRow,
  taskCounts: { done: number; total: number } | undefined,
  assignees: Array<{ userId: string; name: string }> | undefined,
  contacts: Array<{ id: string; name: string }> | undefined,
): BoardProjectResponse {
  return {
    ...toProjectResponse(p),
    doneTasksCount: taskCounts?.done ?? 0,
    totalTasksCount: taskCounts?.total ?? 0,
    assignees: assignees ?? [],
    contacts: contacts ?? [],
  };
}
