import { Injectable } from "@nestjs/common";
import type {
  CreateKbArticleInput,
  KbArticleResponse,
  ListKbArticlesQuery,
  UpdateKbArticleInput,
} from "@helix/api-schemas";
import type { Prisma } from "@helix/db";
import { extractPlainText } from "../../core/lib/full-text-search";
import { ResourceNotFoundError } from "../../core/errors/domain-error";
import { KbRepository, type KbArticleRow } from "./kb.repository";

@Injectable()
export class KbService {
  constructor(private readonly kb: KbRepository) {}

  async create(orgId: string, actorId: string, dto: CreateKbArticleInput): Promise<KbArticleResponse> {
    const row = await this.kb.create({
      orgId,
      workspaceId: dto.workspaceId,
      title: dto.title,
      content: dto.content as Prisma.InputJsonValue | undefined,
      tags: dto.tags,
      icon: dto.icon,
      authorId: actorId,
      searchText: extractPlainText(dto.title, dto.content ?? {}),
    });
    return toKbArticleResponse(row);
  }

  async list(orgId: string, query: ListKbArticlesQuery): Promise<KbArticleResponse[]> {
    const rows = await this.kb.search(orgId, query);
    return rows.map(toKbArticleResponse);
  }

  async findOne(orgId: string, id: string): Promise<KbArticleResponse> {
    const row = await this.kb.findById(id, orgId);
    if (!row) throw new ResourceNotFoundError("KB article not found");
    return toKbArticleResponse(row);
  }

  async update(orgId: string, id: string, dto: UpdateKbArticleInput): Promise<KbArticleResponse> {
    const existing = await this.kb.findById(id, orgId);
    if (!existing) throw new ResourceNotFoundError("KB article not found");

    // searchText пересчитываем при любом патче title/content — тот же приём, что pages.service.ts
    // update(): частичный PATCH без пересчёта разъехал бы индекс со старым содержимым.
    const needsRecompute = dto.title !== undefined || dto.content !== undefined;
    const row = await this.kb.update(id, {
      title: dto.title,
      content: dto.content as Prisma.InputJsonValue | undefined,
      tags: dto.tags,
      icon: dto.icon,
      searchText: needsRecompute
        ? extractPlainText(dto.title ?? existing.title, dto.content ?? existing.content)
        : undefined,
    });
    return toKbArticleResponse(row);
  }

  async remove(orgId: string, id: string): Promise<void> {
    if (!(await this.kb.findById(id, orgId))) throw new ResourceNotFoundError("KB article not found");
    await this.kb.delete(id);
  }
}

function toKbArticleResponse(row: KbArticleRow): KbArticleResponse {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    title: row.title,
    content: row.content as Record<string, unknown>,
    tags: row.tags,
    icon: row.icon,
    authorName: row.author?.name ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
