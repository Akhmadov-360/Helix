import type { INestApplication } from "@nestjs/common";
import { getQueueToken } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";
import { MAINTENANCE_QUEUE } from "../../src/core/queue/queue.module";
import { ATTACHMENT_CLEANUP_JOB } from "../../src/modules/maintenance/attachment-cleanup-job";
import { createTestApp } from "../helpers/create-test-app";

let counter = 0;

async function signUp(app: INestApplication): Promise<{ token: string; orgId: string; userId: string }> {
  const email = `att${counter++}@example.com`;
  const res = await request(app.getHttpServer())
    .post("/v1/auth/register")
    .send({ email, name: "Att", password: "correct horse battery staple" })
    .expect(201);
  const token = res.body.data.accessToken as string;
  const claims = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString());
  return { token, orgId: claims.activeOrgId, userId: claims.sub };
}

describe("Attachments (files.md) — presigned upload/download на реальном MinIO", () => {
  let app: INestApplication;
  let token: string;
  let userId: string;
  let projectId: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    const u = await signUp(app);
    token = u.token;
    userId = u.userId;
    const ws = (
      await request(app.getHttpServer())
        .post("/v1/workspaces")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Board" })
        .expect(201)
    ).body.data;
    projectId = (
      await request(app.getHttpServer())
        .post(`/v1/workspaces/${ws.id}/projects`)
        .set("Authorization", `Bearer ${token}`)
        .send({ title: "Lead" })
        .expect(201)
    ).body.data.id;
  });

  const createUploadUrl = (pid: string, tok: string, body: object) =>
    request(app.getHttpServer())
      .post(`/v1/projects/${pid}/attachments/upload-url`)
      .set("Authorization", `Bearer ${tok}`)
      .send(body);
  const confirm = (pid: string, aid: string, tok: string) =>
    request(app.getHttpServer())
      .post(`/v1/projects/${pid}/attachments/${aid}/confirm`)
      .set("Authorization", `Bearer ${tok}`)
      .send({});
  const list = (pid: string, tok: string) =>
    request(app.getHttpServer()).get(`/v1/projects/${pid}/attachments`).set("Authorization", `Bearer ${tok}`);
  const downloadUrl = (pid: string, aid: string, tok: string) =>
    request(app.getHttpServer())
      .get(`/v1/projects/${pid}/attachments/${aid}/download-url`)
      .set("Authorization", `Bearer ${tok}`);
  const del = (pid: string, aid: string, tok: string) =>
    request(app.getHttpServer())
      .delete(`/v1/projects/${pid}/attachments/${aid}`)
      .set("Authorization", `Bearer ${tok}`);

  async function uploadRealFile(uploadUrl: string, bytes: Buffer, contentType: string): Promise<void> {
    const res = await fetch(uploadUrl, { method: "PUT", body: bytes, headers: { "Content-Type": contentType } });
    if (!res.ok) throw new Error(`upload failed: ${res.status} ${await res.text()}`);
  }

  it("happy path: upload-url → реальный PUT в MinIO → confirm → появляется в списке", async () => {
    const bytes = Buffer.from("hello attachment");
    const created = await createUploadUrl(projectId, token, {
      filename: "notes.txt",
      mimeType: "text/plain",
      sizeBytes: bytes.length,
    }).expect(201);
    const { attachmentId, uploadUrl, storageKey } = created.body.data;
    expect(storageKey).toContain("notes.txt");

    await uploadRealFile(uploadUrl, bytes, "text/plain");

    const confirmed = await confirm(projectId, attachmentId, token).expect(201);
    expect(confirmed.body.data.filename).toBe("notes.txt");
    expect(confirmed.body.data.scanStatus).toBe("SKIPPED");

    const listed = await list(projectId, token).expect(200);
    expect(listed.body.data).toHaveLength(1);
    expect(listed.body.data[0].id).toBe(attachmentId);
  });

  it("confirm без реальной загрузки → 400, строка не появляется в списке", async () => {
    const created = await createUploadUrl(projectId, token, {
      filename: "ghost.txt",
      mimeType: "text/plain",
      sizeBytes: 10,
    }).expect(201);

    await confirm(projectId, created.body.data.attachmentId, token).expect(400);
    expect((await list(projectId, token).expect(200)).body.data).toHaveLength(0);
  });

  it("повторный confirm — идемпотентный успех, не ошибка", async () => {
    const bytes = Buffer.from("idempotent");
    const created = await createUploadUrl(projectId, token, {
      filename: "idem.txt",
      mimeType: "text/plain",
      sizeBytes: bytes.length,
    }).expect(201);
    await uploadRealFile(created.body.data.uploadUrl, bytes, "text/plain");

    await confirm(projectId, created.body.data.attachmentId, token).expect(201);
    const second = await confirm(projectId, created.body.data.attachmentId, token).expect(201);
    expect(second.body.data.filename).toBe("idem.txt");
  });

  it("download-url выдаётся только на подтверждённое вложение, ведёт на реальный объект", async () => {
    const bytes = Buffer.from("downloadable");
    const created = await createUploadUrl(projectId, token, {
      filename: "dl.txt",
      mimeType: "text/plain",
      sizeBytes: bytes.length,
    }).expect(201);
    await uploadRealFile(created.body.data.uploadUrl, bytes, "text/plain");
    await confirm(projectId, created.body.data.attachmentId, token).expect(201);

    const res = await downloadUrl(projectId, created.body.data.attachmentId, token).expect(200);
    const fileRes = await fetch(res.body.data.downloadUrl);
    expect(fileRes.ok).toBe(true);
    expect(await fileRes.text()).toBe("downloadable");
  });

  it("download-url на неподтверждённое вложение → 404", async () => {
    const created = await createUploadUrl(projectId, token, {
      filename: "pending.txt",
      mimeType: "text/plain",
      sizeBytes: 10,
    }).expect(201);
    await downloadUrl(projectId, created.body.data.attachmentId, token).expect(404);
  });

  it("delete удаляет и объект (download-url перестаёт работать), и строку", async () => {
    const bytes = Buffer.from("to be deleted");
    const created = await createUploadUrl(projectId, token, {
      filename: "del.txt",
      mimeType: "text/plain",
      sizeBytes: bytes.length,
    }).expect(201);
    await uploadRealFile(created.body.data.uploadUrl, bytes, "text/plain");
    await confirm(projectId, created.body.data.attachmentId, token).expect(201);

    await del(projectId, created.body.data.attachmentId, token).expect(200);

    expect((await list(projectId, token).expect(200)).body.data).toHaveLength(0);
    await downloadUrl(projectId, created.body.data.attachmentId, token).expect(404);
  });

  describe("RBAC (files.md §7: Appendix B «Upload files» — O/A/M full, Member △ scope=ORG, Viewer read-only)", () => {
    it("Viewer → 403 на create/delete, 200 на read", async () => {
      await prisma.membership.updateMany({ where: { userId }, data: { role: "VIEWER" } });
      await createUploadUrl(projectId, token, { filename: "x.txt", mimeType: "text/plain", sizeBytes: 10 }).expect(403);
      await list(projectId, token).expect(200);
    });

    it("Member → может create/read/delete (△, scope=ORG)", async () => {
      await prisma.membership.updateMany({ where: { userId }, data: { role: "MEMBER" } });
      const bytes = Buffer.from("member upload");
      const created = await createUploadUrl(projectId, token, {
        filename: "m.txt",
        mimeType: "text/plain",
        sizeBytes: bytes.length,
      }).expect(201);
      await uploadRealFile(created.body.data.uploadUrl, bytes, "text/plain");
      await confirm(projectId, created.body.data.attachmentId, token).expect(201);
      await del(projectId, created.body.data.attachmentId, token).expect(200);
    });
  });

  it("tenant: чужая орга → 404 на все эндпоинты", async () => {
    const stranger = await signUp(app);
    await createUploadUrl(projectId, stranger.token, { filename: "x.txt", mimeType: "text/plain", sizeBytes: 10 }).expect(404);
    await list(projectId, stranger.token).expect(404);
  });

  it("удаление Project enqueue'ит attachment.cleanup с ключами вложений ПОСЛЕ удаления", async () => {
    const bytes = Buffer.from("project cascade");
    const created = await createUploadUrl(projectId, token, {
      filename: "cascade.txt",
      mimeType: "text/plain",
      sizeBytes: bytes.length,
    }).expect(201);
    await uploadRealFile(created.body.data.uploadUrl, bytes, "text/plain");
    await confirm(projectId, created.body.data.attachmentId, token).expect(201);

    await request(app.getHttpServer())
      .delete(`/v1/projects/${projectId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    // Redis-очередь общая между прогонами тестов (не чистится TRUNCATE'ом БД) — match по
    // содержимому (конкретный storageKey ЭТОГО теста), не только по имени джобы, иначе .find()
    // может подобрать чужую completed-джобу, оставшуюся от предыдущего прогона.
    const queue = app.get<Queue>(getQueueToken(MAINTENANCE_QUEUE));
    const jobs = await queue.getJobs(["waiting", "completed", "active"]);
    const cleanupJob = jobs.find(
      (j) => j.name === ATTACHMENT_CLEANUP_JOB && j.data.storageKeys?.includes(created.body.data.storageKey),
    );
    expect(cleanupJob).toBeDefined();
    expect(cleanupJob?.data.storageKeys).toEqual([created.body.data.storageKey]);

    // Строка Attachment уже мертва каскадом БД — недоступна даже до обработки джобы очереди.
    expect(await prisma.attachment.count({ where: { projectId } })).toBe(0);
  });
});
