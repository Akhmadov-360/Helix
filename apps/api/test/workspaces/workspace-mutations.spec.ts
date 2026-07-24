import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, type Role } from "@helix/db";
import { createTestApp } from "../helpers/create-test-app";

let counter = 0;

async function signUpAs(app: INestApplication, role: Role): Promise<string> {
  const email = `wsmut${counter++}@example.com`;
  const res = await request(app.getHttpServer())
    .post("/v1/auth/register")
    .send({ email, name: "User", password: "correct horse battery staple" })
    .expect(201);
  const token = res.body.data.accessToken as string;
  if (role !== "OWNER") {
    await prisma.membership.updateMany({ where: { user: { email } }, data: { role } });
  }
  return token;
}

describe("Workspace PATCH / DELETE", () => {
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
    return res.body.data.id;
  };

  describe("PATCH /v1/workspaces/:id (O/A/M)", () => {
    it("меняет name / audience / settings", async () => {
      const token = await signUpAs(app, "OWNER");
      const id = await makeBoard(token);

      const res = await request(app.getHttpServer())
        .patch(`/v1/workspaces/${id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Renamed", audience: "B2B", settings: { theme: "dark" } })
        .expect(200);

      expect(res.body.data.name).toBe("Renamed");
      expect(res.body.data.audience).toBe("B2B");
      expect(res.body.data.settings).toEqual({ theme: "dark" });
    });

    it("MANAGER может (200)", async () => {
      const token = await signUpAs(app, "MANAGER");
      const id = await makeBoard(token);
      await request(app.getHttpServer())
        .patch(`/v1/workspaces/${id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "M" })
        .expect(200);
    });

    it("MEMBER → 403", async () => {
      const owner = await signUpAs(app, "OWNER");
      const id = await makeBoard(owner);
      await prisma.membership.updateMany({ data: { role: "MEMBER" } });
      await request(app.getHttpServer())
        .patch(`/v1/workspaces/${id}`)
        .set("Authorization", `Bearer ${owner}`)
        .send({ name: "X" })
        .expect(403);
    });

    it("пустое тело → 400", async () => {
      const token = await signUpAs(app, "OWNER");
      const id = await makeBoard(token);
      await request(app.getHttpServer())
        .patch(`/v1/workspaces/${id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(400);
    });

    it("чужая доска → 404", async () => {
      const owner = await signUpAs(app, "OWNER");
      const id = await makeBoard(owner);
      const stranger = await signUpAs(app, "OWNER");
      await request(app.getHttpServer())
        .patch(`/v1/workspaces/${id}`)
        .set("Authorization", `Bearer ${stranger}`)
        .send({ name: "X" })
        .expect(404);
    });
  });

  describe("DELETE /v1/workspaces/:id (только O/A)", () => {
    it("OWNER удаляет — доска и её фазы исчезают", async () => {
      const token = await signUpAs(app, "OWNER");
      const id = await makeBoard(token);

      await request(app.getHttpServer())
        .delete(`/v1/workspaces/${id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/v1/workspaces/${id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(404);
      expect(await prisma.phase.count({ where: { workspaceId: id } })).toBe(0);
    });

    it("ADMIN может (200)", async () => {
      const token = await signUpAs(app, "ADMIN");
      const id = await makeBoard(token);
      await request(app.getHttpServer())
        .delete(`/v1/workspaces/${id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
    });

    it("MANAGER → 403 (delete доски — только O/A)", async () => {
      const owner = await signUpAs(app, "OWNER");
      const id = await makeBoard(owner);
      await prisma.membership.updateMany({ data: { role: "MANAGER" } });
      await request(app.getHttpServer())
        .delete(`/v1/workspaces/${id}`)
        .set("Authorization", `Bearer ${owner}`)
        .expect(403);
    });

    it("чужая доска → 404", async () => {
      const owner = await signUpAs(app, "OWNER");
      const id = await makeBoard(owner);
      const stranger = await signUpAs(app, "OWNER");
      await request(app.getHttpServer())
        .delete(`/v1/workspaces/${id}`)
        .set("Authorization", `Bearer ${stranger}`)
        .expect(404);
    });
  });
});
