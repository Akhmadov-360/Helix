import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";
import { createTestApp } from "../helpers/create-test-app";

let counter = 0;

async function signUp(app: INestApplication): Promise<string> {
  const email = `field${counter++}@example.com`;
  const res = await request(app.getHttpServer())
    .post("/v1/auth/register")
    .send({ email, name: "User", password: "correct horse battery staple" })
    .expect(201);
  return res.body.data.accessToken as string;
}

describe("Custom Fields (FieldDefinition CRUD)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const makeBoard = async (token: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post("/v1/workspaces")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Board" })
      .expect(201);
    return res.body.data.id as string;
  };

  const addField = (token: string, wsId: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(`/v1/workspaces/${wsId}/fields`)
      .set("Authorization", `Bearer ${token}`)
      .send(body);

  const listFields = (token: string, wsId: string) =>
    request(app.getHttpServer())
      .get(`/v1/workspaces/${wsId}/fields`)
      .set("Authorization", `Bearer ${token}`);

  describe("POST /v1/workspaces/:id/fields", () => {
    it("создаёт поле, генерит key из label (переиспользует алгоритм Phase)", async () => {
      const token = await signUp(app);
      const wsId = await makeBoard(token);

      const res = await addField(token, wsId, { label: { en: "Deal Size" }, type: "number" }).expect(201);
      expect(res.body.data.key).toBe("deal-size");
      expect(res.body.data.type).toBe("number");
      expect(res.body.data.required).toBe(false);
    });

    it("коллизия key → суффикс -2", async () => {
      const token = await signUp(app);
      const wsId = await makeBoard(token);

      const a = await addField(token, wsId, { label: { en: "Budget" }, type: "text" }).expect(201);
      const b = await addField(token, wsId, { label: { en: "Budget" }, type: "text" }).expect(201);
      expect(a.body.data.key).toBe("budget");
      expect(b.body.data.key).toBe("budget-2");
    });

    it("select без options → 400", async () => {
      const token = await signUp(app);
      const wsId = await makeBoard(token);
      await addField(token, wsId, { label: { en: "Priority" }, type: "select" }).expect(400);
    });

    it("select с options → 201", async () => {
      const token = await signUp(app);
      const wsId = await makeBoard(token);
      const res = await addField(token, wsId, {
        label: { en: "Priority" },
        type: "select",
        options: ["low", "high"],
      }).expect(201);
      expect(res.body.data.options).toEqual(["low", "high"]);
    });

    it("GET отдаёт поля в порядке создания", async () => {
      const token = await signUp(app);
      const wsId = await makeBoard(token);
      await addField(token, wsId, { label: { en: "A" }, type: "text" }).expect(201);
      await addField(token, wsId, { label: { en: "B" }, type: "text" }).expect(201);

      const res = await listFields(token, wsId).expect(200);
      expect(res.body.data.map((f: { key: string }) => f.key)).toEqual(["a", "b"]);
    });

    it("MEMBER → 403", async () => {
      const token = await signUp(app);
      const wsId = await makeBoard(token);
      await prisma.membership.updateMany({ data: { role: "MEMBER" } });
      await addField(token, wsId, { label: { en: "X" }, type: "text" }).expect(403);
    });

    it("MEMBER всё же видит GET (read — «все» роли)", async () => {
      const token = await signUp(app);
      const wsId = await makeBoard(token);
      await prisma.membership.updateMany({ data: { role: "MEMBER" } });
      await listFields(token, wsId).expect(200);
    });

    it("чужая доска → 404", async () => {
      const owner = await signUp(app);
      const wsId = await makeBoard(owner);
      const stranger = await signUp(app);
      await addField(stranger, wsId, { label: { en: "X" }, type: "text" }).expect(404);
    });
  });

  describe("PATCH /v1/fields/:id — смена типа (§5)", () => {
    const firstFieldId = async (token: string, wsId: string): Promise<string> => {
      const res = await listFields(token, wsId).expect(200);
      return res.body.data[0].id;
    };

    it("разрешённый переход number→text → 200", async () => {
      const token = await signUp(app);
      const wsId = await makeBoard(token);
      await addField(token, wsId, { label: { en: "Size" }, type: "number" }).expect(201);
      const id = await firstFieldId(token, wsId);

      const res = await request(app.getHttpServer())
        .patch(`/v1/fields/${id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ type: "text" })
        .expect(200);
      expect(res.body.data.type).toBe("text");
    });

    it("запрещённый переход text→number → 400 INCOMPATIBLE_FIELD_TYPE_CHANGE", async () => {
      const token = await signUp(app);
      const wsId = await makeBoard(token);
      await addField(token, wsId, { label: { en: "Note" }, type: "text" }).expect(201);
      const id = await firstFieldId(token, wsId);

      const res = await request(app.getHttpServer())
        .patch(`/v1/fields/${id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ type: "number" })
        .expect(400);
      expect(res.body.error.code).toBe("INCOMPATIBLE_FIELD_TYPE_CHANGE");
    });

    it("запрещённый переход select→multiselect → 400", async () => {
      const token = await signUp(app);
      const wsId = await makeBoard(token);
      await addField(token, wsId, { label: { en: "Tag" }, type: "select", options: ["a", "b"] }).expect(201);
      const id = await firstFieldId(token, wsId);

      // options обязателен для multiselect на уровне Zod (§2) — передаём его, чтобы дойти
      // до сервисной проверки allow-list (§5), а не упасть раньше на VALIDATION_ERROR.
      const res = await request(app.getHttpServer())
        .patch(`/v1/fields/${id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ type: "multiselect", options: ["a", "b"] })
        .expect(400);
      expect(res.body.error.code).toBe("INCOMPATIBLE_FIELD_TYPE_CHANGE");
    });

    it("key неизменен (в теле игнорируется — схема его не принимает)", async () => {
      const token = await signUp(app);
      const wsId = await makeBoard(token);
      await addField(token, wsId, { label: { en: "Stable" }, type: "text" }).expect(201);
      const id = await firstFieldId(token, wsId);

      const res = await request(app.getHttpServer())
        .patch(`/v1/fields/${id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ label: { en: "Renamed" } })
        .expect(200);
      expect(res.body.data.key).toBe("stable");
      expect(res.body.data.label).toEqual({ en: "Renamed" });
    });
  });

  describe("DELETE /v1/fields/:id — не трогает значения лидов (§6)", () => {
    it("удаляет поле; лид с уже записанным значением не падает при чтении", async () => {
      const token = await signUp(app);
      const wsId = await makeBoard(token);
      const field = await addField(token, wsId, { label: { en: "Note" }, type: "text" }).expect(201);
      const key = field.body.data.key as string;

      const project = await request(app.getHttpServer())
        .post(`/v1/workspaces/${wsId}/projects`)
        .set("Authorization", `Bearer ${token}`)
        .send({ title: "Lead", fields: { [key]: "hello" } })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/v1/fields/${field.body.data.id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      const fields = await listFields(token, wsId).expect(200);
      expect(fields.body.data).toHaveLength(0);

      const res = await request(app.getHttpServer())
        .get(`/v1/projects/${project.body.data.id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(res.body.data.fields[key]).toBe("hello"); // безвредный сирота в JSON
    });
  });
});
