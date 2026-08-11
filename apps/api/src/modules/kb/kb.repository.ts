import { Injectable } from "@nestjs/common";
import { Prisma } from "@helix/db";
import { PrismaService } from "../../core/prisma/prisma.service";

export interface KbArticleRow {
  id: string;
  workspaceId: string | null;
  title: string;
  content: unknown;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

const KB_ARTICLE_SELECT = {
  id: true,
  workspaceId: true,
  title: true,
  content: true,
  tags: true,
  createdAt: true,
  updatedAt: true,
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
    data: { title?: string; content?: Prisma.InputJsonValue; tags?: string[] },
  ): Promise<KbArticleRow> {
    return this.prisma.client.kBArticle.update({ where: { id }, data, select: KB_ARTICLE_SELECT });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.client.kBArticle.delete({ where: { id } });
  }

  /**
   * pages-kb.md §7 — raw SQL, не Prisma-фильтры: `tag` должен компилироваться в `tags @>
   * ARRAY[...]`, чтобы реально использовать GIN-индекс (§1/§10 — тест проверяет EXPLAIN).
   * Prisma-эквивалент `tags: { has: tag }` компилируется в `= ANY(tags)`, который GIN
   * (array_ops, поддерживает `@>`/`<@`/`&&`) не использует — тот же класс решения, что
   * boardRows/columnPage в projects.repository.ts (ORM не выражает нужный оператор).
   */
  async search(orgId: string, filters: KbArticleFilters): Promise<KbArticleRow[]> {
    const conditions: Prisma.Sql[] = [Prisma.sql`"orgId" = ${orgId}`];

    if (filters.workspaceId) {
      conditions.push(Prisma.sql`("workspaceId" IS NULL OR "workspaceId" = ${filters.workspaceId})`);
    }
    if (filters.tag) {
      conditions.push(Prisma.sql`"tags" @> ARRAY[${filters.tag}]::text[]`);
    }
    if (filters.q) {
      conditions.push(Prisma.sql`"title" ILIKE ${`%${filters.q}%`}`);
    }

    return this.prisma.client.$queryRaw<KbArticleRow[]>`
      SELECT id, "workspaceId", title, content, tags, "createdAt", "updatedAt"
      FROM "KBArticle"
      WHERE ${Prisma.join(conditions, " AND ")}
      ORDER BY "createdAt" DESC
    `;
  }
}
