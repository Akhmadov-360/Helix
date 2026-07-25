import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/create-test-app";

let counter = 0;

async function signUp(app: INestApplication): Promise<{ token: string }> {
  const email = `act${counter++}@example.com`;
  const res = await request(app.getHttpServer())
    .post("/v1/auth/register")
    .send({ email, name: "Act", password: "correct horse battery staple" })
    .expect(201);
  return { token: res.body.data.accessToken as string };
}

describe("GET /projects/:id/activity (§6, unit 11)", () => {
  let app: INestApplication;
  let token: string;
  let wsId: string;
  let phaseIds: string[];

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    const u = await signUp(app);
    token = u.token;
    const res = await request(app.getHttpServer())
      .post("/v1/workspaces")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Board" })
      .expect(201);
    wsId = res.body.data.id;
    phaseIds = res.body.data.phases.map((p: { id: string }) => p.id);
  });

  const createProject = () =>
    request(app.getHttpServer())
      .post(`/v1/workspaces/${wsId}/projects`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Lead" });
  const move = (id: string, toPhaseId: string) =>
    request(app.getHttpServer())
      .post(`/v1/projects/${id}/move`)
      .set("Authorization", `Bearer ${token}`)
      .send({ toPhaseId });
  const patch = (id: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).patch(`/v1/projects/${id}`).set("Authorization", `Bearer ${token}`).send(body);
  const activity = (id: string) =>
    request(app.getHttpServer()).get(`/v1/projects/${id}/activity`).set("Authorization", `Bearer ${token}`);

  it("created → лента содержит project.created", async () => {
    const p = (await createProject().expect(201)).body.data;
    const res = await activity(p.id).expect(200);
    const types = res.body.data.map((e: { type: string }) => e.type);
    expect(types).toContain("project.created");
  });

  it("новые события сверху (createdAt desc)", async () => {
    const p = (await createProject().expect(201)).body.data;
    await move(p.id, phaseIds[1]!).expect(200); // project.moved
    await patch(p.id, { value: 500 }).expect(200); // project.updated

    const res = await activity(p.id).expect(200);
    const types = res.body.data.map((e: { type: string }) => e.type);
    expect(types).toEqual(["project.updated", "project.moved", "project.created"]);
  });

  it("payload события отдаётся как есть (снапшот)", async () => {
    const p = (await createProject().expect(201)).body.data;
    await patch(p.id, { value: 500 }).expect(200);

    const res = await activity(p.id).expect(200);
    const updated = res.body.data.find((e: { type: string }) => e.type === "project.updated");
    expect(updated.payload.changed).toEqual(["value"]);
    expect(updated.schemaVersion).toBe(1);
    expect(typeof updated.createdAt).toBe("string");
  });

  it("несуществующий проект → 404", async () => {
    await activity("00000000-0000-0000-0000-000000000000").expect(404);
  });

  it("чужой проект → 404 (tenant-скоуп)", async () => {
    const p = (await createProject().expect(201)).body.data;
    const stranger = await signUp(app);
    await request(app.getHttpServer())
      .get(`/v1/projects/${p.id}/activity`)
      .set("Authorization", `Bearer ${stranger.token}`)
      .expect(404);
  });
});
