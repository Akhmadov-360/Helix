import { Inject, Injectable } from "@nestjs/common";
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Env } from "@helix/config";
import { ENV } from "../config/config.module";

const UPLOAD_URL_TTL_SECONDS = 5 * 60; // files.md §3 — только на сам upload
const DOWNLOAD_URL_TTL_SECONDS = 5 * 60; // files.md §5 — "short-lived" (FR-FILE-2)

/**
 * Один клиент на MinIO и настоящий AWS S3 (files.md §9) — это один и тот же `@aws-sdk/client-s3`
 * API, разница только в конструкторе. S3_ENDPOINT задан → MinIO (dev, docker-compose.dev.yml,
 * путь-стиль + явные креды); не задан → настоящий AWS S3 (prod, default credential provider
 * chain — IAM role, тот же принцип, что уже применён к SES в `ses-mailer.service.ts`).
 */
@Injectable()
export class S3Service {
  private readonly client: S3Client;
  readonly bucket: string;

  constructor(@Inject(ENV) env: Env) {
    this.client = new S3Client({
      region: env.S3_REGION,
      ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT, forcePathStyle: true, credentials: requireMinioCredentials(env) } : {}),
    });
    this.bucket = env.S3_BUCKET;
  }

  /** files.md §3 — TTL короткий, только на сам upload; размер НЕ ограничивается подписью (см. §3
   *  врезка — это не presigned POST policy), проверяется отдельно на confirm через headObject. */
  getPresignedPutUrl(key: string, contentType: string): Promise<string> {
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType });
    return getSignedUrl(this.client, command, { expiresIn: UPLOAD_URL_TTL_SECONDS });
  }

  /** files.md §5 — короткоживущий (FR-FILE-2), единственный путь прочитать объект. */
  getPresignedGetUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: DOWNLOAD_URL_TTL_SECONDS });
  }

  /** files.md §3 — confirm: существует ли объект и какой у него реальный размер. null = не найден. */
  async headObject(key: string): Promise<{ sizeBytes: number } | null> {
    try {
      const result = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { sizeBytes: result.ContentLength ?? 0 };
    } catch (err) {
      if (isNotFoundError(err)) return null;
      throw err;
    }
  }

  /** files.md §6 — удаление одного вложения, синхронно. */
  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  /** files.md §6 — batch-удаление при каскаде Project (до 1000 ключей за вызов, лимит самого S3 API). */
  async deleteObjects(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.client.send(
      new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: { Objects: keys.map((key) => ({ Key: key })) },
      }),
    );
  }
}

// code-review: было `env.S3_ACCESS_KEY!`/`env.S3_SECRET_KEY!` — non-null assertion молча
// пропускала undefined в конструктор клиента при S3_ENDPOINT без кредов, и ошибка всплыла бы
// НАМНОГО позже, невнятным auth-фейлом первого реального S3-запроса, а не при старте. Тот же
// fail-fast принцип, что JWT_SECRET.
function requireMinioCredentials(env: Env): { accessKeyId: string; secretAccessKey: string } {
  if (!env.S3_ACCESS_KEY || !env.S3_SECRET_KEY) {
    throw new Error("S3_ENDPOINT is set (MinIO/S3-compatible mode) but S3_ACCESS_KEY/S3_SECRET_KEY are missing");
  }
  return { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY };
}

function isNotFoundError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    ("name" in err ? (err as { name?: string }).name === "NotFound" : false)
  );
}
