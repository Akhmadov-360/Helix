import { Injectable } from "@nestjs/common";
import type {
  CreatePageCommentInput,
  CreatePageInput,
  PageCommentResponse,
  PageResponse,
  PageVersionResponse,
  UpdatePageInput,
} from "@helix/api-schemas";
import type { Prisma, Role } from "@helix/db";
import { roleRank } from "../../core/authz/role-hierarchy";
import { ForbiddenActionError, ResourceNotFoundError } from "../../core/errors/domain-error";
import { extractPlainText } from "../../core/lib/full-text-search";
import { PrismaService } from "../../core/prisma/prisma.service";
import { ActivityRecorder } from "../activity/activity-recorder";
import { EmbeddingChunkRepository } from "../ai/embedding-chunk.repository";
import { IngestEmbeddingsProducer } from "../ai/ingest-embeddings.producer";
import { MENTION_COMMENT_PREVIEW_LENGTH } from "../notifications/mention-job";
import { NotificationsService } from "../notifications/notifications.service";
import { ProjectsRepository } from "../projects/projects.repository";
import { UsersRepository } from "../users/users.repository";
import { PagesRepository, type PageCommentRow, type PageRow } from "./pages.repository";

// pages-kb.md §8 — не снапшотить чаще, чем раз в N минут (иначе debounced-автосейв на каждой
// правке абзаца плодил бы версию за версией). Явный restore снапшотит текущее состояние в обход
// троттлинга (см. restoreVersion) — это осознанное действие пользователя, не автосейв.
const PAGE_VERSION_THROTTLE_MINUTES = 10;

@Injectable()
export class PagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pages: PagesRepository,
    private readonly projects: ProjectsRepository,
    private readonly notifications: NotificationsService,
    private readonly users: UsersRepository,
    private readonly activity: ActivityRecorder,
    private readonly ingest: IngestEmbeddingsProducer,
    private readonly embeddingChunks: EmbeddingChunkRepository,
  ) {}

  // page.created — веха (создан новый документ), не автосейв контента (§6.3-принцип: "структурное"
  // событие, не каждое изменение) — атомарно со вставкой (P4).
  async create(orgId: string, projectId: string, actorId: string, dto: CreatePageInput): Promise<PageResponse> {
    if (!(await this.projects.findByIdInOrg(projectId, orgId))) {
      throw new ResourceNotFoundError("Project not found");
    }
    const row = await this.prisma.client.$transaction(async (tx) => {
      const created = await this.pages.create(
        {
          orgId,
          projectId,
          title: dto.title,
          content: dto.content as Prisma.InputJsonValue | undefined,
          searchText: extractPlainText(dto.title, dto.content ?? {}),
        },
        tx,
      );
      const actor = await this.users.findProfileById(actorId, tx);
      await this.activity.record(tx, {
        orgId,
        projectId,
        actorId,
        event: {
          type: "page.created",
          schemaVersion: 1,
          payload: { pageId: created.id, pageTitle: created.title, actorName: actor?.name ?? null },
        },
      });
      return created;
    });
    // ai-chat.md §3.1 — enqueue ПОСЛЕ коммита (P4), не внутри транзакции: сайд-эффект, не факт-состояние.
    await this.ingest.enqueue({ orgId, sourceType: "PAGE", sourceId: row.id, projectId: row.projectId, workspaceId: null });
    return toPageResponse(row);
  }

  async list(orgId: string, projectId: string, q?: string): Promise<PageResponse[]> {
    if (!(await this.projects.findByIdInOrg(projectId, orgId))) {
      throw new ResourceNotFoundError("Project not found");
    }
    const rows = q?.trim()
      ? await this.pages.searchByProject(projectId, orgId, q.trim())
      : await this.pages.listByProject(projectId, orgId);
    return rows.map(toPageResponse);
  }

  async findOne(orgId: string, id: string): Promise<PageResponse> {
    const row = await this.pages.findById(id, orgId);
    if (!row) throw new ResourceNotFoundError("Page not found");
    return toPageResponse(row);
  }

  async update(orgId: string, id: string, dto: UpdatePageInput): Promise<PageResponse> {
    const existing = await this.pages.findById(id, orgId);
    if (!existing) throw new ResourceNotFoundError("Page not found");

    // searchText пересчитываем при любом патче title/content (частичный PATCH — если поле не
    // пришло, берём текущее значение строки, не даём индексу разъехаться со старым содержимым).
    const needsRecompute = dto.title !== undefined || dto.content !== undefined;

    const row = await this.prisma.client.$transaction(async (tx) => {
      // code review: без лока конкурентные PATCH на одной Page могли оба пройти throttle-проверку
      // ДО того, как любой вставил снапшот (check-then-act race) — FOR UPDATE сериализует их.
      await this.pages.lockForUpdate(id, tx);
      if (needsRecompute) await this.maybeSnapshotVersion(existing, tx);
      return this.pages.update(
        id,
        {
          title: dto.title,
          content: dto.content as Prisma.InputJsonValue | undefined,
          searchText: needsRecompute
            ? extractPlainText(dto.title ?? existing.title, dto.content ?? existing.content)
            : undefined,
        },
        tx,
      );
    });
    if (needsRecompute) {
      await this.ingest.enqueue({ orgId, sourceType: "PAGE", sourceId: row.id, projectId: row.projectId, workspaceId: null });
    }
    return toPageResponse(row);
  }

  // §8 — снапшот состояния ДО перезаписи, только если с последнего снапшота этой Page прошло
  // больше PAGE_VERSION_THROTTLE_MINUTES (или снапшотов ещё не было). Троттлинг молчаливый — без
  // отдельного UI-индикатора "версия сохранена": подтверждение того, что снапшот случился, даёт
  // сама панель истории (список с относительным временем), не отдельная плашка поверх автосейва.
  // Вызывающий код обязан держать lockForUpdate(existing.id, tx) до этого вызова (см. update()/
  // restoreVersion()) — иначе check-then-act ниже не защищён от гонки.
  private async maybeSnapshotVersion(existing: PageRow, tx: Prisma.TransactionClient): Promise<void> {
    const lastSnapshotAt = await this.pages.findLatestVersionCreatedAt(existing.id, tx);
    const cutoff = new Date(Date.now() - PAGE_VERSION_THROTTLE_MINUTES * 60_000);
    if (lastSnapshotAt && lastSnapshotAt > cutoff) return;
    await this.pages.createVersion(
      {
        pageId: existing.id,
        title: existing.title,
        content: existing.content as Prisma.InputJsonValue,
      },
      tx,
    );
  }

  async listVersions(orgId: string, id: string): Promise<PageVersionResponse[]> {
    if (!(await this.pages.findById(id, orgId))) throw new ResourceNotFoundError("Page not found");
    const rows = await this.pages.listVersions(id);
    return rows.map((row) => ({ id: row.id, pageId: row.pageId, title: row.title, createdAt: row.createdAt.toISOString() }));
  }

  // §8 — restore не разрушительный: текущее состояние снапшотится ПЕРЕД перезаписью, в обход
  // троттлинга (явное действие пользователя) — можно откатить сам откат через ту же историю.
  // lockForUpdate (code review) — та же защита от гонки, что update(): без неё конкурентный PATCH
  // мог бы прочитать/перезаписать content между snapshot-чтением и update() ниже.
  async restoreVersion(orgId: string, id: string, versionId: string): Promise<PageResponse> {
    const existing = await this.pages.findById(id, orgId);
    if (!existing) throw new ResourceNotFoundError("Page not found");
    const version = await this.pages.findVersionById(versionId, id);
    if (!version) throw new ResourceNotFoundError("Page version not found");

    const row = await this.prisma.client.$transaction(async (tx) => {
      await this.pages.lockForUpdate(id, tx);
      await this.pages.createVersion(
        {
          pageId: existing.id,
          title: existing.title,
          content: existing.content as Prisma.InputJsonValue,
        },
        tx,
      );
      return this.pages.update(
        id,
        {
          title: version.title,
          content: version.content as Prisma.InputJsonValue,
          searchText: extractPlainText(version.title, version.content),
        },
        tx,
      );
    });
    await this.ingest.enqueue({ orgId, sourceType: "PAGE", sourceId: row.id, projectId: row.projectId, workspaceId: null });
    return toPageResponse(row);
  }

  async remove(orgId: string, id: string, actorId: string): Promise<void> {
    const existing = await this.pages.findById(id, orgId);
    if (!existing) throw new ResourceNotFoundError("Page not found");

    await this.prisma.client.$transaction(async (tx) => {
      await this.pages.delete(id, tx);
      // ai-chat.md §1.1 (P2 намеренно не применяется к EmbeddingChunk) — чанки не FK-каскадятся
      // от Page, чистим явно, иначе retrieval продолжит находить контент удалённой страницы.
      await this.embeddingChunks.deleteBySource("PAGE", id, tx);
      const actor = await this.users.findProfileById(actorId, tx);
      await this.activity.record(tx, {
        orgId,
        projectId: existing.projectId,
        actorId,
        event: {
          type: "page.deleted",
          schemaVersion: 1,
          payload: { pageId: existing.id, pageTitle: existing.title, actorName: actor?.name ?? null },
        },
      });
    });
  }

  /** pages-kb.md §2 — mentionedUserIds уже резолвлены фронтом в id, бэкенд текст не парсит. */
  async addComment(
    orgId: string,
    pageId: string,
    actorId: string,
    dto: CreatePageCommentInput,
  ): Promise<PageCommentResponse> {
    const page = await this.pages.findById(pageId, orgId);
    if (!page) throw new ResourceNotFoundError("Page not found");

    const comment = await this.pages.createComment({ pageId, authorId: actorId, body: dto.body });

    await this.notifyMentions(orgId, page, actorId, dto);

    return toPageCommentResponse(comment);
  }

  async listComments(orgId: string, pageId: string): Promise<PageCommentResponse[]> {
    if (!(await this.pages.findById(pageId, orgId))) throw new ResourceNotFoundError("Page not found");
    const rows = await this.pages.listComments(pageId);
    return rows.map(toPageCommentResponse);
  }

  /** §4 — не CASL-грант: автор всегда может удалить свой комментарий, иначе только Manager+. */
  async deleteComment(orgId: string, pageId: string, commentId: string, actorId: string, actorRole: Role): Promise<void> {
    if (!(await this.pages.findById(pageId, orgId))) throw new ResourceNotFoundError("Page not found");

    const comment = await this.pages.findCommentById(commentId);
    if (!comment || comment.pageId !== pageId) throw new ResourceNotFoundError("Comment not found");

    const isAuthor = comment.authorId === actorId;
    const isManagerPlus = roleRank(actorRole) >= roleRank("MANAGER");
    if (!isAuthor && !isManagerPlus) throw new ForbiddenActionError();

    await this.pages.deleteComment(commentId);
  }

  /** §2 — self-mention не шлёт письмо; чужой/несуществующий id тихо пропускается (тенант-защита). */
  private async notifyMentions(
    orgId: string,
    page: PageRow,
    actorId: string,
    dto: CreatePageCommentInput,
  ): Promise<void> {
    const mentionedIds = [...new Set(dto.mentionedUserIds ?? [])].filter((id) => id !== actorId);
    if (mentionedIds.length === 0) return;

    const members = await this.pages.findOrgMembersByIds(orgId, [...mentionedIds, actorId]);
    const byId = new Map(members.map((m) => [m.id, m]));
    const actorName = byId.get(actorId)?.name ?? "Someone";
    const preview =
      dto.body.length > MENTION_COMMENT_PREVIEW_LENGTH
        ? `${dto.body.slice(0, MENTION_COMMENT_PREVIEW_LENGTH)}…`
        : dto.body;

    // code-review: было последовательным await в цикле — до 50 упоминаний (лимит схемы) блокировали
    // бы ответ POST /comments 50 Redis round-trip'ами подряд. enqueueMention сама глотает свою
    // ошибку (try/catch внутри), поэтому параллелить безопасно — семантика не меняется.
    await Promise.all(
      mentionedIds
        .map((id) => byId.get(id))
        .filter((mentioned): mentioned is { id: string; name: string; email: string } => Boolean(mentioned))
        .map((mentioned) =>
          this.notifications.enqueueMention({
            mentionedUserEmail: mentioned.email,
            mentionedUserName: mentioned.name,
            actorName,
            pageId: page.id,
            pageTitle: page.title,
            projectId: page.projectId,
            commentBody: preview,
          }),
        ),
    );
  }
}

function toPageResponse(row: PageRow): PageResponse {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    content: row.content as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toPageCommentResponse(row: PageCommentRow): PageCommentResponse {
  return {
    id: row.id,
    pageId: row.pageId,
    authorId: row.authorId,
    authorName: row.author?.name ?? null,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  };
}
