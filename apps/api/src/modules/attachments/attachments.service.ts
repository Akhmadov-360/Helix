import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import {
  MAX_ATTACHMENT_SIZE_BYTES,
  type AttachmentResponse,
  type CreateUploadUrlInput,
  type UpdateAttachmentInput,
  type UploadUrlResponse,
} from "@helix/api-schemas";
import {
  AttachmentTooLargeError,
  AttachmentUploadNotConfirmedError,
  ResourceNotFoundError,
} from "../../core/errors/domain-error";
import { S3Service } from "../../core/storage/s3.service";
import { ProjectsRepository } from "../projects/projects.repository";
import { AttachmentsRepository, type AttachmentRow } from "./attachments.repository";

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly attachments: AttachmentsRepository,
    private readonly projects: ProjectsRepository,
    private readonly s3: S3Service,
  ) {}

  /** files.md §3, шаг 1. */
  async createUploadUrl(
    orgId: string,
    projectId: string,
    actorId: string,
    dto: CreateUploadUrlInput,
  ): Promise<UploadUrlResponse> {
    await this.assertProjectInOrg(orgId, projectId);

    const attachmentId = randomUUID();
    const storageKey = buildStorageKey(orgId, projectId, attachmentId, dto.filename);

    await this.attachments.create({
      id: attachmentId,
      orgId,
      projectId,
      storageKey,
      filename: dto.filename,
      mimeType: dto.mimeType,
      sizeBytes: dto.sizeBytes,
      uploadedById: actorId,
    });

    const uploadUrl = await this.s3.getPresignedPutUrl(storageKey, dto.mimeType);
    return { attachmentId, uploadUrl, storageKey };
  }

  /**
   * files.md §3, шаг 3. Реальный размер — единственная настоящая граница (§3/§4 врезка,
   * presigned PUT не ограничивает размер в подписи). Повторный вызов на уже подтверждённую
   * строку — идемпотентный успех, не ошибка.
   */
  async confirm(orgId: string, projectId: string, attachmentId: string): Promise<AttachmentResponse> {
    const row = await this.attachments.findById(attachmentId, orgId, projectId);
    if (!row) throw new ResourceNotFoundError("Attachment not found");

    if (row.confirmedAt) return toAttachmentResponse(row);

    const head = await this.s3.headObject(row.storageKey);
    if (!head) throw new AttachmentUploadNotConfirmedError();

    if (head.sizeBytes > MAX_ATTACHMENT_SIZE_BYTES) {
      await this.s3.deleteObject(row.storageKey);
      throw new AttachmentTooLargeError();
    }

    await this.attachments.confirm(attachmentId);
    return toAttachmentResponse({ ...row, confirmedAt: new Date() });
  }

  async list(orgId: string, projectId: string): Promise<AttachmentResponse[]> {
    await this.assertProjectInOrg(orgId, projectId);
    const rows = await this.attachments.listByProject(projectId, orgId);
    return rows.map(toAttachmentResponse);
  }

  /** files.md §5 — presigned GET, короткий TTL, единственный путь прочитать объект. */
  async getDownloadUrl(
    orgId: string,
    projectId: string,
    attachmentId: string,
    disposition: "inline" | "attachment" = "attachment",
  ): Promise<{ downloadUrl: string }> {
    const row = await this.findConfirmed(orgId, projectId, attachmentId);
    const downloadUrl = await this.s3.getPresignedGetUrl(row.storageKey, row.filename, disposition);
    return { downloadUrl };
  }

  /** files.md §7 (пересмотрено) — только filename, S3-объект не трогается. */
  async update(orgId: string, projectId: string, attachmentId: string, dto: UpdateAttachmentInput): Promise<AttachmentResponse> {
    const row = await this.attachments.findById(attachmentId, orgId, projectId);
    if (!row) throw new ResourceNotFoundError("Attachment not found");

    const updated = await this.attachments.update(attachmentId, { filename: dto.filename });
    return toAttachmentResponse(updated);
  }

  /** files.md §6 — удаление одного вложения, синхронно (объект + строка). */
  async delete(orgId: string, projectId: string, attachmentId: string): Promise<void> {
    const row = await this.attachments.findById(attachmentId, orgId, projectId);
    if (!row) throw new ResourceNotFoundError("Attachment not found");

    await this.s3.deleteObject(row.storageKey);
    await this.attachments.delete(attachmentId);
  }

  private async findConfirmed(orgId: string, projectId: string, attachmentId: string): Promise<AttachmentRow> {
    const row = await this.attachments.findById(attachmentId, orgId, projectId);
    if (!row || !row.confirmedAt) throw new ResourceNotFoundError("Attachment not found");
    return row;
  }

  private async assertProjectInOrg(orgId: string, projectId: string): Promise<void> {
    if (!(await this.projects.findByIdInOrg(projectId, orgId))) {
      throw new ResourceNotFoundError("Project not found");
    }
  }
}

/** files.md §2 — orgId первым сегментом: изоляция на уровне ключа, не только БД-фильтра, потому
 *  что presigned URL работает напрямую против S3, в обход API. */
function buildStorageKey(orgId: string, projectId: string, attachmentId: string, filename: string): string {
  return `${orgId}/${projectId}/${attachmentId}/${encodeURIComponent(filename)}`;
}

function toAttachmentResponse(row: AttachmentRow): AttachmentResponse {
  return {
    id: row.id,
    filename: row.filename,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    scanStatus: row.scanStatus,
    uploadedByName: row.uploadedBy?.name ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
