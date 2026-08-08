import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/create-test-app";

let counter = 0;

async function signUp(app: INestApplication): Promise<string> {
  const email = `pf${counter++}@example.com`;
  const res = await request(app.getHttpServer())
    .post("/v1/auth/register")
    .send({ email, name: "User", password: "correct horse battery staple" })
    .expect(201);
  return res.body.data.accessToken as string;
}

describe("Project.fields — валидация по FieldDefinition[] и required enforcement (custom-fields.md §4/§7)", () => {
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

  const create = (token: string, wsId: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(`/v1/workspaces/${wsId}/projects`)
      .set("Authorization", `Bearer ${token}`)
      .send(body);

  it("required-поле без значения → 400 MISSING_REQUIRED_FIELDS с ключом в details", async () => {
    const token = await signUp(app);
    const wsId = await makeBoard(token);
    const field = await addField(token, wsId, {
      label: { en: "Budget" },
      type: "number",
      required: true,
    }).expect(201);

    const res = await create(token, wsId, { title: "Lead" }).expect(400);
    expect(res.body.error.code).toBe("MISSING_REQUIRED_FIELDS");
    expect(res.body.error.details.keys).toEqual([field.body.data.key]);
  });

  it("все required-поля переданы → 201", async () => {
    const token = await signUp(app);
    const wsId = await makeBoard(token);
    const field = await addField(token, wsId, {
      label: { en: "Budget" },
      type: "number",
      required: true,
    }).expect(201);

    const res = await create(token, wsId, {
      title: "Lead",
      fields: { [field.body.data.key]: 1000 },
    }).expect(201);
    expect(res.body.data.fields[field.body.data.key]).toBe(1000);
  });

  it("select-значение вне options → 400", async () => {
    const token = await signUp(app);
    const wsId = await makeBoard(token);
    const field = await addField(token, wsId, {
      label: { en: "Priority" },
      type: "select",
      options: ["low", "high"],
    }).expect(201);

    await create(token, wsId, { title: "Lead", fields: { [field.body.data.key]: "medium" } }).expect(400);
  });

  it("лишний ключ (не в FieldDefinition[]) отбрасывается, не 400", async () => {
    const token = await signUp(app);
    const wsId = await makeBoard(token);

    const res = await create(token, wsId, { title: "Lead", fields: { ghost: "x" } }).expect(201);
    expect(res.body.data.fields).toEqual({});
  });

  it("PATCH без ключа fields не триггерит required-проверку (title-only патч проходит)", async () => {
    const token = await signUp(app);
    const wsId = await makeBoard(token);

    // Лид создаётся ДО того, как поле стало required — иначе create сам отказал бы (§7).
    const created = await create(token, wsId, { title: "Lead" }).expect(201);
    await addField(token, wsId, { label: { en: "Budget" }, type: "number", required: true }).expect(201);

    const patched = await request(app.getHttpServer())
      .patch(`/v1/projects/${created.body.data.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Renamed" })
      .expect(200);
    expect(patched.body.data.title).toBe("Renamed");
  });

  it("PATCH {fields:{...}} обнуляющий required-значение (null) → 400", async () => {
    const token = await signUp(app);
    const wsId = await makeBoard(token);
    const field = await addField(token, wsId, {
      label: { en: "Budget" },
      type: "number",
      required: true,
    }).expect(201);

    const created = await create(token, wsId, {
      title: "Lead",
      fields: { [field.body.data.key]: 500 },
    }).expect(201);

    await request(app.getHttpServer())
      .patch(`/v1/projects/${created.body.data.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ fields: { [field.body.data.key]: null } })
      .expect(400);
  });

  it("PATCH {fields:{...}} добавляющий другое поле сохраняет уже записанные значения", async () => {
    const token = await signUp(app);
    const wsId = await makeBoard(token);
    const budget = await addField(token, wsId, { label: { en: "Budget" }, type: "number" }).expect(201);
    const note = await addField(token, wsId, { label: { en: "Note" }, type: "text" }).expect(201);

    const created = await create(token, wsId, {
      title: "Lead",
      fields: { [budget.body.data.key]: 100 },
    }).expect(201);

    const patched = await request(app.getHttpServer())
      .patch(`/v1/projects/${created.body.data.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ fields: { [note.body.data.key]: "hi" } })
      .expect(200);

    expect(patched.body.data.fields[budget.body.data.key]).toBe(100);
    expect(patched.body.data.fields[note.body.data.key]).toBe("hi");
  });

  // Регрессия (custom-fields.md §7, decisions.md ADR): PATCH required больше НЕ проверяет
  // весь смёрженный набор — исторический пробел в НЕтронутом required-поле (появилось после
  // создания лида) не должен блокировать несвязанную правку другого поля.
  it("PATCH другого поля не спотыкается о чужой исторический пробел в required-поле", async () => {
    const token = await signUp(app);
    const wsId = await makeBoard(token);
    const note = await addField(token, wsId, { label: { en: "Note" }, type: "text" }).expect(201);
    const created = await create(token, wsId, { title: "Lead" }).expect(201);

    // required появляется ПОСЛЕ создания лида — у лида уже есть исторический пробел.
    const budget = await addField(token, wsId, {
      label: { en: "Budget" },
      type: "number",
      required: true,
    }).expect(201);

    const patched = await request(app.getHttpServer())
      .patch(`/v1/projects/${created.body.data.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ fields: { [note.body.data.key]: "hi" } })
      .expect(200);

    expect(patched.body.data.fields[note.body.data.key]).toBe("hi");
    expect(patched.body.data.fields[budget.body.data.key]).toBeUndefined();
  });
});
