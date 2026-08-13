import { Injectable } from "@nestjs/common";
import type { Prisma } from "@helix/db";
import { toPrefixTsQuery } from "../../core/lib/full-text-search";
import { PrismaService } from "../../core/prisma/prisma.service";

export interface PageRow {
  id: string;
  projectId: string;
  title: string;
  content: unknown;
  createdAt: Date;
  updatedAt: Date;
}

const PAGE_SELECT = {
  id: true,
  projectId: true,
  title: true,
  content: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PageSelect;

export interface PageVersionRow {
  id: string;
  pageId: string;
  title: string;
  content: unknown;
  createdAt: Date;
}

const PAGE_VERSION_SELECT = {
  id: true,
  pageId: true,
  title: true,
  content: true,
  createdAt: true,
} satisfies Prisma.PageVersionSelect;

const PAGE_VERSION_LIST_SELECT = {
  id: true,
  pageId: true,
  title: true,
  createdAt: true,
} satisfies Prisma.PageVersionSelect;

export interface PageCommentRow {
  id: string;
  pageId: string;
  authorId: string | null;
  body: string;
  createdAt: Date;
  author: { name: string } | null;
}

const PAGE_COMMENT_SELECT = {
  id: true,
  pageId: true,
  authorId: true,
  body: true,
  createdAt: true,
  author: { select: { name: true } },
} satisfies Prisma.PageCommentSelect;

@Injectable()
export class PagesRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    data: { orgId: string; projectId: string; title: string; content?: Prisma.InputJsonValue; searchText: string },
    tx?: Prisma.TransactionClient,
  ): Promise<PageRow> {
    return (tx ?? this.prisma.client).page.create({ data, select: PAGE_SELECT });
  }

  // orgId — единственный фильтр тенанта: composite-FK backbone гарантирует Page.orgId ==
  // Project.orgId, так что projectId в пути не нужен для этого поиска (§7: GET /v1/pages/:id).
  findById(id: string, orgId: string): Promise<PageRow | null> {
    return this.prisma.client.page.findFirst({ where: { id, orgId }, select: PAGE_SELECT });
  }

  listByProject(projectId: string, orgId: string): Promise<PageRow[]> {
    return this.prisma.client.page.findMany({
      where: { projectId, orgId },
      select: PAGE_SELECT,
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Полнотекстовый поиск по title+content (CLAUDE.md manual-migration point #6 — функциональный
   * GIN по to_tsvector(searchText), Prisma-фильтр `contains` его не использует — тот же класс
   * решения, что kb.repository.ts §7 (tags @>): raw SQL, чтобы реально попасть в индекс, а не в
   * последовательный скан. Префиксный tsquery (":*"), не plainto_tsquery — 'simple'-словарь не
   * стеммирует, так что "жирн" не находил бы "жирного" при поиске по мере набора (жалоба на
   * "слишком строгий поиск"); токены собираются вручную и экранируются от ts_query-спецсимволов
   * (не SQL-инъекция, весь запрос параметризован через Prisma.sql).
   */
  searchByProject(projectId: string, orgId: string, q: string): Promise<PageRow[]> {
    const tsQuery = toPrefixTsQuery(q);
    if (!tsQuery) return Promise.resolve([]);
    return this.prisma.client.$queryRaw<PageRow[]>`
      SELECT id, "projectId", title, content, "createdAt", "updatedAt"
      FROM "Page"
      WHERE "projectId" = ${projectId} AND "orgId" = ${orgId}
        AND to_tsvector('simple', "searchText") @@ to_tsquery('simple', ${tsQuery})
      ORDER BY ts_rank(to_tsvector('simple', "searchText"), to_tsquery('simple', ${tsQuery})) DESC
    `;
  }

  update(
    id: string,
    data: { title?: string; content?: Prisma.InputJsonValue; searchText?: string },
    tx?: Prisma.TransactionClient,
  ): Promise<PageRow> {
    return (tx ?? this.prisma.client).page.update({ where: { id }, data, select: PAGE_SELECT });
  }

  // Сериализует конкурентные update()/restoreVersion() на ОДНОЙ странице (code review: без этого
  // check-then-act в maybeSnapshotVersion — findLatestVersionCreatedAt + createVersion — гонка:
  // два PATCH могли пройти проверку троттлинга ДО того, как любой из них вставил строку, и оба
  // создать снапшот в одном окне). FOR UPDATE держит лок до конца охватывающей транзакции — второй
  // конкурентный вызов блокируется на этом SELECT, а не проходит throttle-проверку параллельно.
  async lockForUpdate(id: string, tx: Prisma.TransactionClient): Promise<void> {
    await tx.$queryRaw`SELECT id FROM "Page" WHERE id = ${id} FOR UPDATE`;
  }

  async delete(id: string, tx?: Prisma.TransactionClient): Promise<void> {
    await (tx ?? this.prisma.client).page.delete({ where: { id } });
  }

  createVersion(
    data: { pageId: string; title: string; content: Prisma.InputJsonValue },
    tx?: Prisma.TransactionClient,
  ): Promise<PageVersionRow> {
    return (tx ?? this.prisma.client).pageVersion.create({ data, select: PAGE_VERSION_SELECT });
  }

  listVersions(pageId: string): Promise<Omit<PageVersionRow, "content">[]> {
    return this.prisma.client.pageVersion.findMany({
      where: { pageId },
      select: PAGE_VERSION_LIST_SELECT,
      orderBy: { createdAt: "desc" },
    });
  }

  findVersionById(id: string, pageId: string): Promise<PageVersionRow | null> {
    return this.prisma.client.pageVersion.findFirst({ where: { id, pageId }, select: PAGE_VERSION_SELECT });
  }

  // Троттлинг снапшотов (§8) — только момент последнего, не вся история.
  async findLatestVersionCreatedAt(pageId: string, tx?: Prisma.TransactionClient): Promise<Date | null> {
    const latest = await (tx ?? this.prisma.client).pageVersion.findFirst({
      where: { pageId },
      select: { createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    return latest?.createdAt ?? null;
  }

  createComment(data: { pageId: string; authorId: string; body: string }): Promise<PageCommentRow> {
    return this.prisma.client.pageComment.create({ data, select: PAGE_COMMENT_SELECT });
  }

  listComments(pageId: string): Promise<PageCommentRow[]> {
    return this.prisma.client.pageComment.findMany({
      where: { pageId },
      select: PAGE_COMMENT_SELECT,
      orderBy: { createdAt: "asc" },
    });
  }

  findCommentById(id: string): Promise<{ id: string; pageId: string; authorId: string | null } | null> {
    return this.prisma.client.pageComment.findUnique({
      where: { id },
      select: { id: true, pageId: true, authorId: true },
    });
  }

  async deleteComment(id: string): Promise<void> {
    await this.prisma.client.pageComment.delete({ where: { id } });
  }

  // §2 — mentionedUserIds резолвятся к email/name ЗДЕСЬ, отфильтрованные по orgId: тенант-защита
  // от рассылки письма по чужому userId, попавшему в mentionedUserIds по ошибке/подделке запроса.
  async findOrgMembersByIds(
    orgId: string,
    userIds: string[],
  ): Promise<{ id: string; name: string; email: string }[]> {
    if (userIds.length === 0) return [];
    const memberships = await this.prisma.client.membership.findMany({
      where: { orgId, userId: { in: userIds } },
      select: { user: { select: { id: true, name: true, email: true } } },
    });
    return memberships.map((m) => m.user);
  }
}
