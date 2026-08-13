import { Injectable } from "@nestjs/common";
import { Prisma } from "@helix/db";
import { toPrefixTsQuery } from "../../core/lib/full-text-search";
import { PrismaService } from "../../core/prisma/prisma.service";

export interface KbArticleRow {
  id: string;
  workspaceId: string | null;
  title: string;
  content: unknown;
  tags: string[];
  icon: string | null;
  authorId: string | null;
  createdAt: Date;
  updatedAt: Date;
  author: { name: string } | null;
}

const KB_ARTICLE_SELECT = {
  id: true,
  workspaceId: true,
  title: true,
  content: true,
  tags: true,
  icon: true,
  authorId: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { name: true } },
} satisfies Prisma.KBArticleSelect;

export interface KbArticleFilters {
  workspaceId?: string;
  tag?: string;
  q?: string;
}

@Injectable()
export class KbRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    data: {
      orgId: string;
      workspaceId?: string;
      title: string;
      content?: Prisma.InputJsonValue;
      tags?: string[];
      icon?: string;
      authorId: string | null;
      searchText: string;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<KbArticleRow> {
    return (tx ?? this.prisma.client).kBArticle.create({ data, select: KB_ARTICLE_SELECT });
  }

  findById(id: string, orgId: string): Promise<KbArticleRow | null> {
    return this.prisma.client.kBArticle.findFirst({ where: { id, orgId }, select: KB_ARTICLE_SELECT });
  }

  update(
    id: string,
    data: { title?: string; content?: Prisma.InputJsonValue; tags?: string[]; icon?: string | null; searchText?: string },
  ): Promise<KbArticleRow> {
    return this.prisma.client.kBArticle.update({ where: { id }, data, select: KB_ARTICLE_SELECT });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.client.kBArticle.delete({ where: { id } });
  }

  /**
   * pages-kb.md §7 (пересмотрено по запросу — изначально ILIKE-only, расширено до полнотекстового
   * поиска title+content, как у Pages: CLAUDE.md manual-migration point #7, GIN по
   * to_tsvector(searchText)). `tag` остаётся raw SQL `tags @> ARRAY[...]`, чтобы реально
   * использовать GIN-индекс по тегам (Prisma `tags: { has: tag }` компилируется в `= ANY(tags)`,
   * который этот индекс не использует). `q` — префиксный tsquery (см. toPrefixTsQuery), тот же
   * приём, что pages.repository.ts.
   */
  async search(orgId: string, filters: KbArticleFilters): Promise<KbArticleRow[]> {
    const conditions: Prisma.Sql[] = [Prisma.sql`"orgId" = ${orgId}`];

    if (filters.workspaceId) {
      conditions.push(Prisma.sql`("workspaceId" IS NULL OR "workspaceId" = ${filters.workspaceId})`);
    }
    if (filters.tag) {
      conditions.push(Prisma.sql`"tags" @> ARRAY[${filters.tag}]::text[]`);
    }
    let orderBy = Prisma.sql`"createdAt" DESC`;
    if (filters.q) {
      const tsQuery = toPrefixTsQuery(filters.q);
      if (!tsQuery) return [];
      conditions.push(Prisma.sql`to_tsvector('simple', "searchText") @@ to_tsquery('simple', ${tsQuery})`);
      orderBy = Prisma.sql`ts_rank(to_tsvector('simple', "searchText"), to_tsquery('simple', ${tsQuery})) DESC`;
    }

    return this.prisma.client.$queryRaw<KbArticleRow[]>`
      SELECT a.id, a."workspaceId", a.title, a.content, a.tags, a.icon, a."authorId", a."createdAt", a."updatedAt",
             CASE WHEN u.name IS NOT NULL THEN jsonb_build_object('name', u.name) ELSE NULL END AS author
      FROM "KBArticle" a
      LEFT JOIN "User" u ON u.id = a."authorId"
      WHERE ${Prisma.join(conditions, " AND ")}
      ORDER BY ${orderBy}
    `;
  }
}
