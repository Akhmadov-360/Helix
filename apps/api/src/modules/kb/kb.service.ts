import { Injectable } from "@nestjs/common";
import type {
  CreateKbArticleInput,
  KbArticleResponse,
  ListKbArticlesQuery,
  UpdateKbArticleInput,
} from "@helix/api-schemas";
import type { Prisma } from "@helix/db";
import { ResourceNotFoundError } from "../../core/errors/domain-error";
import { KbRepository, type KbArticleRow } from "./kb.repository";

@Injectable()
export class KbService {
  constructor(private readonly kb: KbRepository) {}

  async create(orgId: string, dto: CreateKbArticleInput): Promise<KbArticleResponse> {
    const row = await this.kb.create({
      orgId,
      workspaceId: dto.workspaceId,
      title: dto.title,
      content: dto.content as Prisma.InputJsonValue | undefined,
      tags: dto.tags,
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
    if (!(await this.kb.findById(id, orgId))) throw new ResourceNotFoundError("KB article not found");
    const row = await this.kb.update(id, {
      title: dto.title,
      content: dto.content as Prisma.InputJsonValue | undefined,
      tags: dto.tags,
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
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
