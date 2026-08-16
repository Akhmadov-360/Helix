import { describe, expect, it, vi } from "vitest";
import { AttachmentTooLargeError, AttachmentUploadNotConfirmedError, ResourceNotFoundError } from "../../src/core/errors/domain-error";
import type { PrismaService } from "../../src/core/prisma/prisma.service";
import type { S3Service } from "../../src/core/storage/s3.service";
import type { ActivityRecorder } from "../../src/modules/activity/activity-recorder";
import type { EmbeddingChunkRepository } from "../../src/modules/ai/embedding-chunk.repository";
import type { IngestEmbeddingsProducer } from "../../src/modules/ai/ingest-embeddings.producer";
import { AttachmentsService } from "../../src/modules/attachments/attachments.service";
import type { AttachmentsRepository, AttachmentRow } from "../../src/modules/attachments/attachments.repository";
import type { ProjectsRepository } from "../../src/modules/projects/projects.repository";
import type { UsersRepository } from "../../src/modules/users/users.repository";

// files.md §3/§4: реальный размер объекта — единственная настоящая граница (presigned PUT не
// ограничивает размер в подписи). Тест на 50MB реальной загрузки был бы медленным и не нужен —
// эта проверка целиком в логике confirm(), мокаем S3.headObject вместо реальной большой загрузки.
function makeRow(overrides?: Partial<AttachmentRow>): AttachmentRow {
  return {
    id: "att1",
    filename: "a.pdf",
    mimeType: "application/pdf",
    sizeBytes: 100,
    storageKey: "org1/proj1/att1/a.pdf",
    scanStatus: "SKIPPED",
    confirmedAt: null,
    createdAt: new Date(),
    uploadedById: null,
    uploadedBy: null,
    ...overrides,
  };
}

describe("AttachmentsService.confirm — реальный размер как единственная граница (files.md §3/§4)", () => {
  function makeService(overrides?: {
    findById?: ReturnType<typeof vi.fn>;
    confirm?: ReturnType<typeof vi.fn>;
    headObject?: ReturnType<typeof vi.fn>;
    deleteObject?: ReturnType<typeof vi.fn>;
  }) {
    const attachments = {
      findById: overrides?.findById ?? vi.fn().mockResolvedValue(makeRow()),
      confirm: overrides?.confirm ?? vi.fn().mockResolvedValue(1),
    };
    const s3 = {
      headObject: overrides?.headObject ?? vi.fn().mockResolvedValue({ sizeBytes: 100 }),
      deleteObject: overrides?.deleteObject ?? vi.fn().mockResolvedValue(undefined),
    };
    // $transaction зовёт callback с фиктивным tx — моки репозитория/activity его игнорируют,
    // как и реальные (tx?: Prisma.TransactionClient — опциональный параметр).
    const prisma = { client: { $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn({})) } };
    const activity = { record: vi.fn().mockResolvedValue(undefined) };
    const users = { findProfileById: vi.fn().mockResolvedValue(null) };
    const ingest = { enqueue: vi.fn().mockResolvedValue(undefined) };
    const embeddingChunks = { deleteBySource: vi.fn().mockResolvedValue(undefined) };
    const service = new AttachmentsService(
      prisma as unknown as PrismaService,
      attachments as unknown as AttachmentsRepository,
      {} as unknown as ProjectsRepository,
      s3 as unknown as S3Service,
      activity as unknown as ActivityRecorder,
      users as unknown as UsersRepository,
      ingest as unknown as IngestEmbeddingsProducer,
      embeddingChunks as unknown as EmbeddingChunkRepository,
    );
    return { service, attachments, s3, ingest, embeddingChunks };
  }

  it("объект не найден в S3 → AttachmentUploadNotConfirmedError, confirm() репозитория не вызывается", async () => {
    const { service, attachments } = makeService({ headObject: vi.fn().mockResolvedValue(null) });

    await expect(service.confirm("org1", "proj1", "att1")).rejects.toThrow(AttachmentUploadNotConfirmedError);
    expect(attachments.confirm).not.toHaveBeenCalled();
  });

  it("реальный размер больше лимита → AttachmentTooLargeError, объект удалён, строка НЕ подтверждена", async () => {
    const { service, attachments, s3 } = makeService({
      headObject: vi.fn().mockResolvedValue({ sizeBytes: 51 * 1024 * 1024 }),
    });

    await expect(service.confirm("org1", "proj1", "att1")).rejects.toThrow(AttachmentTooLargeError);
    expect(s3.deleteObject).toHaveBeenCalledWith("org1/proj1/att1/a.pdf");
    expect(attachments.confirm).not.toHaveBeenCalled();
  });

  it("повторный confirm на уже подтверждённую строку — идемпотентный успех, S3 не трогается повторно", async () => {
    const { service, attachments, s3 } = makeService({
      findById: vi.fn().mockResolvedValue(makeRow({ confirmedAt: new Date() })),
    });

    const result = await service.confirm("org1", "proj1", "att1");

    expect(result.id).toBe("att1");
    expect(s3.headObject).not.toHaveBeenCalled();
    expect(attachments.confirm).not.toHaveBeenCalled();
  });

  it("чужая орга/проект → ResourceNotFoundError", async () => {
    const { service } = makeService({ findById: vi.fn().mockResolvedValue(null) });

    await expect(service.confirm("org1", "proj1", "att1")).rejects.toThrow(ResourceNotFoundError);
  });
});
