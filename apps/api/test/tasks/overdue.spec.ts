import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/create-test-app";

let counter = 0;

async function signUp(app: INestApplication): Promise<string> {
  const email = `ov${counter++}@example.com`;
  const res = await request(app.getHttpServer())
    .post("/v1/auth/register")
    .send({ email, name: "Ov", password: "correct horse battery staple" })
    .expect(201);
  return res.body.data.accessToken as string;
}

const PAST = new Date(Date.now() - 60_000).toISOString();
const FUTURE = new Date(Date.now() + 60 * 60_000).toISOString();

describe("Task overdue — вычисляемое (§4, unit 4)", () => {
  let app: INestApplication;
  let token: string;
  let projectId: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    token = await signUp(app);
    const ws = (
      await request(app.getHttpServer()).post("/v1/workspaces").set("Authorization", `Bearer ${token}`).send({ name: "B" }).expect(201)
    ).body.data;
    projectId = (
      await request(app.getHttpServer())
        .post(`/v1/workspaces/${ws.id}/projects`)
        .set("Authorization", `Bearer ${token}`)
        .send({ title: "Lead" })
        .expect(201)
    ).body.data.id;
  });

  const create = (body: Record<string, unknown>) =>
    request(app.getHttpServer()).post(`/v1/projects/${projectId}/tasks`).set("Authorization", `Bearer ${token}`).send(body);
  const complete = (tid: string) =>
    request(app.getHttpServer()).post(`/v1/tasks/${tid}/complete`).set("Authorization", `Bearer ${token}`);
  const get = (tid: string) =>
    request(app.getHttpServer()).get(`/v1/projects/${projectId}/tasks`).set("Authorization", `Bearer ${token}`).then((r) => r.body.data.find((t: { id: string }) => t.id === tid));

  it("dueAt в прошлом + done=false → overdue=true", async () => {
    const res = await create({ title: "T", dueAt: PAST }).expect(201);
    expect(res.body.data.overdue).toBe(true);
  });

  it("dueAt в прошлом + done=true → overdue=false (сделан — не просрочен)", async () => {
    const t = (await create({ title: "T", dueAt: PAST }).expect(201)).body.data;
    const res = await complete(t.id).expect(200);
    expect(res.body.data.overdue).toBe(false);
  });

  it("dueAt = null → overdue=false (нет срока)", async () => {
    const res = await create({ title: "T" }).expect(201);
    expect(res.body.data.overdue).toBe(false);
  });

  it("dueAt в будущем → overdue=false", async () => {
    const res = await create({ title: "T", dueAt: FUTURE }).expect(201);
    expect(res.body.data.overdue).toBe(false);
  });

  it("overdue НЕ хранится: два чтения до/после dueAt дают разный overdue без UPDATE (§4)", async () => {
    const dueAt = new Date(Date.now() + 600).toISOString(); // истекает через 600мс
    const t = (await create({ title: "T", dueAt }).expect(201)).body.data;

    const before = await get(t.id);
    expect(before.overdue).toBe(false); // срок ещё не прошёл

    await new Promise((r) => setTimeout(r, 900)); // ждём прохождения dueAt

    const after = await get(t.id);
    expect(after.overdue).toBe(true); // теперь просрочен — только от времени
    expect(after.updatedAt).toBe(before.updatedAt); // БЕЗ записи в БД (производное, не колонка)
  });
});
