import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";
import { createTestApp } from "../helpers/create-test-app";

let counter = 0;

async function signUp(app: INestApplication): Promise<{ token: string; orgId: string; userId: string }> {
  const email = `pg${counter++}@example.com`;
  const res = await request(app.getHttpServer())
    .post("/v1/auth/register")
    .send({ email, name: "Page Author", password: "correct horse battery staple" })
    .expect(201);
  const token = res.body.data.accessToken as string;
  const claims = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString());
  return { token, orgId: claims.activeOrgId, userId: claims.sub };
}

interface MailhogMessage {
  To: { Mailbox: string; Domain: string }[];
  Content: { Headers: Record<string, string[]>; Body: string };
}

async function clearMailhog(): Promise<void> {
  await fetch("http://localhost:8025/api/v1/messages", { method: "DELETE" });
}

// MailHog общий на весь тестовый прогон (не чистится TRUNCATE'ом БД, тот же гэп, что Redis-очередь
// в attachments.spec.ts) — соседний тест из beforeEach мог оставить/ещё доставить lead.created
// асинхронно. Матчим по Subject (mention-письмо всегда содержит "mentioned you"), а не по факту
// "инбокс пуст" — иначе тест ложно падает на чужом lead.created, гоняющемся с проверкой (race).
async function findMentionEmail(timeoutMs: number): Promise<MailhogMessage | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch("http://localhost:8025/api/v2/messages");
    const body = (await res.json()) as { items: MailhogMessage[] };
    // По телу, не по Subject-заголовку: Subject содержит кавычки (`"${pageTitle}"`), из-за чего
    // SMTP-клиент кодирует его целиком как RFC 2047 encoded-word (=?UTF-8?Q?...?=) — плоский
    // substring-матч против "mentioned you" по заголовку не сработал бы никогда. Body передаётся
    // как обычный текст (7bit/quoted-printable), совпадение по нему надёжно.
    const match = body.items.find((m) => m.Content.Body.includes("mentioned you"));
    if (match) return match;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

describe("Pages + PageComment (pages-kb.md)", () => {
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

  const create = (pid: string, tok: string, body: object) =>
    request(app.getHttpServer())
      .post(`/v1/projects/${pid}/pages`)
      .set("Authorization", `Bearer ${tok}`)
      .send(body);
  const list = (pid: string, tok: string) =>
    request(app.getHttpServer()).get(`/v1/projects/${pid}/pages`).set("Authorization", `Bearer ${tok}`);
  const getOne = (id: string, tok: string) =>
    request(app.getHttpServer()).get(`/v1/pages/${id}`).set("Authorization", `Bearer ${tok}`);
  const update = (id: string, tok: string, body: object) =>
    request(app.getHttpServer()).patch(`/v1/pages/${id}`).set("Authorization", `Bearer ${tok}`).send(body);
  const del = (id: string, tok: string) =>
    request(app.getHttpServer()).delete(`/v1/pages/${id}`).set("Authorization", `Bearer ${tok}`);
  const activity = (pid: string, tok: string) =>
    request(app.getHttpServer()).get(`/v1/projects/${pid}/activity`).set("Authorization", `Bearer ${tok}`);

  describe("Активность лида (P4) — page.created/page.deleted", () => {
    it("create пишет page.created в ленту лида", async () => {
      const created = await create(projectId, token, { title: "Onboarding checklist" }).expect(201);

      const res = await activity(projectId, token).expect(200);
      const event = res.body.data.find((e: { type: string }) => e.type === "page.created");
      expect(event).toBeDefined();
      expect(event.payload.pageId).toBe(created.body.data.id);
      expect(event.payload.pageTitle).toBe("Onboarding checklist");
      expect(event.actorId).toBe(userId);
    });

    it("delete пишет page.deleted в ленту лида", async () => {
      const created = await create(projectId, token, { title: "Temp notes" }).expect(201);
      await del(created.body.data.id, token).expect(200);

      const res = await activity(projectId, token).expect(200);
      const event = res.body.data.find((e: { type: string }) => e.type === "page.deleted");
      expect(event).toBeDefined();
      expect(event.payload.pageTitle).toBe("Temp notes");
    });
  });

  describe("CRUD + tenant scope", () => {
    it("создаёт/читает/обновляет/удаляет страницу проекта", async () => {
      const created = await create(projectId, token, { title: "Kickoff notes", content: { type: "doc" } }).expect(201);
      expect(created.body.data.title).toBe("Kickoff notes");
      expect(created.body.data.projectId).toBe(projectId);

      const listed = await list(projectId, token).expect(200);
      expect(listed.body.data).toHaveLength(1);

      const fetched = await getOne(created.body.data.id, token).expect(200);
      expect(fetched.body.data.content).toEqual({ type: "doc" });

      const updated = await update(created.body.data.id, token, { title: "Renamed" }).expect(200);
      expect(updated.body.data.title).toBe("Renamed");

      await del(created.body.data.id, token).expect(200);
      expect((await list(projectId, token).expect(200)).body.data).toHaveLength(0);
    });

    it("чужая орга → 404 на все эндпоинты", async () => {
      const created = await create(projectId, token, { title: "Secret" }).expect(201);
      const stranger = await signUp(app);

      await create(projectId, stranger.token, { title: "x" }).expect(404);
      await list(projectId, stranger.token).expect(404);
      await getOne(created.body.data.id, stranger.token).expect(404);
      await update(created.body.data.id, stranger.token, { title: "x" }).expect(404);
      await del(created.body.data.id, stranger.token).expect(404);
    });

    it("чужой/несуществующий projectId → 404", async () => {
      await create("does-not-exist", token, { title: "x" }).expect(404);
    });
  });

  describe("Полнотекстовый поиск (§8 доп. — Page.searchText, GIN по to_tsvector)", () => {
    const search = (pid: string, tok: string, q: string) =>
      request(app.getHttpServer())
        .get(`/v1/projects/${pid}/pages`)
        .query({ q })
        .set("Authorization", `Bearer ${tok}`);

    it("находит по совпадению в заголовке", async () => {
      await create(projectId, token, { title: "Onboarding checklist" }).expect(201);
      await create(projectId, token, { title: "Random unrelated page" }).expect(201);

      const res = await search(projectId, token, "onboarding").expect(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].title).toBe("Onboarding checklist");
    });

    it("находит по совпадению внутри content (текст ProseMirror-узлов, не только title)", async () => {
      await create(projectId, token, {
        title: "Meeting notes",
        content: {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Обсудили budget approval process" }] },
          ],
        },
      }).expect(201);
      await create(projectId, token, { title: "Другая страница", content: { type: "doc" } }).expect(201);

      const res = await search(projectId, token, "budget").expect(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].title).toBe("Meeting notes");
    });

    it("обновление content пересчитывает searchText — старый текст больше не находится, новый находится", async () => {
      const created = await create(projectId, token, {
        title: "Doc",
        content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "oldword" }] }] },
      }).expect(201);

      expect((await search(projectId, token, "oldword").expect(200)).body.data).toHaveLength(1);

      await update(created.body.data.id, token, {
        content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "newword" }] }] },
      }).expect(200);

      expect((await search(projectId, token, "oldword").expect(200)).body.data).toHaveLength(0);
      expect((await search(projectId, token, "newword").expect(200)).body.data).toHaveLength(1);
    });

    it("находит по неполному слову (префиксный поиск, не строгое совпадение)", async () => {
      await create(projectId, token, { title: "Тест жирного текста" }).expect(201);
      await create(projectId, token, { title: "Другая страница" }).expect(201);

      const res = await search(projectId, token, "жирн").expect(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].title).toBe("Тест жирного текста");
    });

    it("без совпадений → пустой список, без q → полный список", async () => {
      await create(projectId, token, { title: "Something" }).expect(201);
      expect((await search(projectId, token, "nomatch12345").expect(200)).body.data).toHaveLength(0);
      expect((await list(projectId, token).expect(200)).body.data).toHaveLength(1);
    });

    it("поиск уважает тенант-изоляцию — чужая орга не видит совпадений", async () => {
      await create(projectId, token, { title: "Findable secret" }).expect(201);
      const stranger = await signUp(app);
      await search(projectId, stranger.token, "findable").expect(404);
    });
  });

  describe("RBAC (§4: Manager+ manage, Member △ create/read/update, Viewer read-only)", () => {
    it("Viewer → 403 на create, 200 на read", async () => {
      const created = await create(projectId, token, { title: "Visible" }).expect(201);
      await prisma.membership.updateMany({ where: { userId }, data: { role: "VIEWER" } });

      await create(projectId, token, { title: "x" }).expect(403);
      await getOne(created.body.data.id, token).expect(200);
      await del(created.body.data.id, token).expect(403);
    });

    it("Member → может create/read/update, НЕ может delete", async () => {
      await prisma.membership.updateMany({ where: { userId }, data: { role: "MEMBER" } });
      const created = await create(projectId, token, { title: "Draft" }).expect(201);
      await update(created.body.data.id, token, { title: "Edited" }).expect(200);
      await del(created.body.data.id, token).expect(403);
    });

    it("Manager → может всё, включая delete", async () => {
      await prisma.membership.updateMany({ where: { userId }, data: { role: "MANAGER" } });
      const created = await create(projectId, token, { title: "Managed" }).expect(201);
      await del(created.body.data.id, token).expect(200);
    });
  });

  describe("Content size limit (§5) — UTF-8, не UTF-16 code units", () => {
    it("контент на кириллице сверх лимита в РЕАЛЬНЫХ байтах → 400", async () => {
      // Кириллица: 1 code unit (UTF-16), 2 байта (UTF-8) — .length занизил бы размер вдвое.
      // ~140_000 кириллических символов = ~280KB UTF-8, выше лимита 256KB, но .length (140_000)
      // сам по себе ниже лимита — баг из §5 врезки проявился бы именно на этом объёме.
      const bigCyrillic = "ц".repeat(140_000);
      await create(projectId, token, { title: "Big", content: { type: "doc", text: bigCyrillic } }).expect(400);
    });

    it("небольшой ASCII-контент — под лимитом, 201 (контрольная проверка)", async () => {
      const small = "a".repeat(1000);
      await create(projectId, token, { title: "Small", content: { type: "doc", text: small } }).expect(201);
    });
  });

  describe("Comments + @mention (§2) — закрывает M2-гэп", () => {
    it("создаёт комментарий; упомянутый получает письмо (реальный MailHog)", async () => {
      const page = await create(projectId, token, { title: "Discuss" }).expect(201);
      const claims = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString());
      const mentioned = await prisma.user.create({
        data: { email: `mentioned${counter++}@example.com`, name: "Mentioned Person", passwordHash: "x" },
      });
      await prisma.membership.create({ data: { orgId: claims.activeOrgId, userId: mentioned.id, role: "MEMBER" } });

      const comment = await request(app.getHttpServer())
        .post(`/v1/pages/${page.body.data.id}/comments`)
        .set("Authorization", `Bearer ${token}`)
        .send({ body: "@Mentioned check this out", mentionedUserIds: [mentioned.id] })
        .expect(201);
      expect(comment.body.data.body).toBe("@Mentioned check this out");

      // Матчим по Subject ("mentioned you"), не по items[0] инбокса — MailHog общий на прогон
      // (не чистится TRUNCATE'ом), в инбоксе может быть ЕЩЁ и lead.created от beforeEach (тот же
      // гэп, что общая Redis-очередь в attachments.spec.ts).
      const msg = await findMentionEmail(5000);
      expect(msg).not.toBeNull();
      expect(msg?.To[0]?.Mailbox).toBe(mentioned.email.split("@")[0]);
      expect(msg?.Content.Body).toContain("check this out");
    });

    it("self-mention не создаёт письмо", async () => {
      // Чистим инбокс от возможного leftover mention-письма СОСЕДНЕГО теста (MailHog общий на
      // прогон, тесты последовательны — fileParallelism: false в vitest.config.ts гарантирует,
      // что в этот момент больше никто в него не пишет). Матч ниже всё равно контент-специфичен
      // ("mentioned you"), так что даже позже долетевший lead.created ЭТОГО теста не даст ложный
      // срабатывания, если бы clear здесь и не понадобился.
      await clearMailhog();
      const page = await create(projectId, token, { title: "Solo" }).expect(201);
      await request(app.getHttpServer())
        .post(`/v1/pages/${page.body.data.id}/comments`)
        .set("Authorization", `Bearer ${token}`)
        .send({ body: "note to self", mentionedUserIds: [userId] })
        .expect(201);

      expect(await findMentionEmail(1500)).toBeNull();
    });

    it("список комментариев возвращает созданные по порядку", async () => {
      const page = await create(projectId, token, { title: "Thread" }).expect(201);
      await request(app.getHttpServer())
        .post(`/v1/pages/${page.body.data.id}/comments`)
        .set("Authorization", `Bearer ${token}`)
        .send({ body: "first" })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/v1/pages/${page.body.data.id}/comments`)
        .set("Authorization", `Bearer ${token}`)
        .send({ body: "second" })
        .expect(201);

      const listed = await request(app.getHttpServer())
        .get(`/v1/pages/${page.body.data.id}/comments`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(listed.body.data.map((c: { body: string }) => c.body)).toEqual(["first", "second"]);
    });

    it("удаление: автор может удалить свой; посторонний Member — нет; Manager — может любой", async () => {
      const page = await create(projectId, token, { title: "Mod" }).expect(201);
      const comment = await request(app.getHttpServer())
        .post(`/v1/pages/${page.body.data.id}/comments`)
        .set("Authorization", `Bearer ${token}`)
        .send({ body: "mine" })
        .expect(201);

      // Автор удаляет своё — 200.
      const ownComment = await request(app.getHttpServer())
        .post(`/v1/pages/${page.body.data.id}/comments`)
        .set("Authorization", `Bearer ${token}`)
        .send({ body: "to delete by author" })
        .expect(201);
      await request(app.getHttpServer())
        .delete(`/v1/pages/${page.body.data.id}/comments/${ownComment.body.data.id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      // Посторонний Member (та же орга, есть право читать Page, но не автор) — 403 на чужой комментарий.
      // switch-org минтит токен с activeOrgId ЭТОЙ орги (JWT-claim статичен на выпуск — прямая
      // membership-вставка в БД токен постороннего не меняет, см. jwt-auth.guard.ts).
      const claims = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString());
      const stranger = await signUp(app);
      await prisma.membership.create({ data: { orgId: claims.activeOrgId, userId: stranger.userId, role: "MEMBER" } });
      const switched = await request(app.getHttpServer())
        .post("/v1/auth/switch-org")
        .set("Authorization", `Bearer ${stranger.token}`)
        .send({ orgId: claims.activeOrgId })
        .expect(200);
      await request(app.getHttpServer())
        .delete(`/v1/pages/${page.body.data.id}/comments/${comment.body.data.id}`)
        .set("Authorization", `Bearer ${switched.body.data.accessToken}`)
        .expect(403);

      // Manager (актор, повысив свою же роль) удаляет чужой комментарий — 200.
      await prisma.membership.updateMany({ where: { userId }, data: { role: "MANAGER" } });
      await request(app.getHttpServer())
        .delete(`/v1/pages/${page.body.data.id}/comments/${comment.body.data.id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
    });
  });

  describe("Embed-ссылка на удалённый Attachment (§6) — не блокируется, не каскадится", () => {
    it("удаление Attachment, на который ссылается content, проходит без побочных эффектов на Page", async () => {
      const attachmentBytes = Buffer.from("embedded file");
      const uploadRes = await request(app.getHttpServer())
        .post(`/v1/projects/${projectId}/attachments/upload-url`)
        .set("Authorization", `Bearer ${token}`)
        .send({ filename: "embed.txt", mimeType: "text/plain", sizeBytes: attachmentBytes.length })
        .expect(201);
      await fetch(uploadRes.body.data.uploadUrl, { method: "PUT", body: attachmentBytes, headers: { "Content-Type": "text/plain" } });
      await request(app.getHttpServer())
        .post(`/v1/projects/${projectId}/attachments/${uploadRes.body.data.attachmentId}/confirm`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(201);

      const page = await create(projectId, token, {
        title: "Has embed",
        content: { type: "doc", content: [{ type: "attachmentEmbed", attrs: { attachmentId: uploadRes.body.data.attachmentId } }] },
      }).expect(201);

      await request(app.getHttpServer())
        .delete(`/v1/projects/${projectId}/attachments/${uploadRes.body.data.attachmentId}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      const reread = await getOne(page.body.data.id, token).expect(200);
      expect(reread.body.data.content).toEqual(page.body.data.content); // не изменился, не удалён
    });
  });
});
