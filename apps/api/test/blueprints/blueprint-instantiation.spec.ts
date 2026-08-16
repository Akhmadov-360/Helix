import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, type Prisma } from "@helix/db";
import { createTestApp } from "../helpers/create-test-app";

let counter = 0;

async function signUp(app: INestApplication): Promise<{ token: string; orgId: string }> {
  const email = `bpinst${counter++}@example.com`;
  const res = await request(app.getHttpServer())
    .post("/v1/auth/register")
    .send({ email, name: "Founder", password: "correct horse battery staple" })
    .expect(201);
  const token = res.body.data.accessToken as string;
  const orgId = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString()).activeOrgId;
  return { token, orgId };
}

// Блюпринты в этом файле — фиксированно audience "B2B" (не предмет теста): CompanyRequiredError
// на create (projects.md) требует companyId, здесь просто заводим компанию под фикстуру.
async function makeCompany(app: INestApplication, token: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post("/v1/companies")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Acme Corp" })
    .expect(201);
  return res.body.data.company.id;
}

/** Прямая вставка — API создания блюпринта (save-as-blueprint) не принимает pageTemplates/kbSeed
 *  на вход (blueprints.md §0: они валидны в definition, но ничем их туда не кладёт кроме теста). */
async function insertBlueprintWithTemplates(
  orgId: string,
  pageTemplates: unknown[],
  kbSeed: unknown[],
): Promise<string> {
  const bp = await prisma.blueprint.create({
    data: {
      orgId,
      audience: "B2B",
      name: "Instantiation fixture",
      definition: {
        phases: [{ key: "lead", name: { en: "Lead" }, type: "OPEN", order: 1 }],
        projectFields: [],
        pageTemplates,
        kbSeed,
      } as Prisma.InputJsonValue,
    },
  });
  return bp.id;
}

describe("Blueprint instantiation — pageTemplates/kbSeed (pages-kb.md §3)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("kbSeed непустой → ровно N KBArticle с workspaceId нового воркспейса", async () => {
    const { token, orgId } = await signUp(app);
    const blueprintId = await insertBlueprintWithTemplates(
      orgId,
      [],
      [
        { title: "Getting Started", contentJson: { type: "doc" } },
        { title: "FAQ" },
      ],
    );

    const ws = await request(app.getHttpServer())
      .post("/v1/workspaces")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "From blueprint", blueprintId })
      .expect(201);

    const articles = await prisma.kBArticle.findMany({ where: { workspaceId: ws.body.data.id } });
    expect(articles).toHaveLength(2);
    expect(articles.map((a) => a.title).sort()).toEqual(["FAQ", "Getting Started"]);
    expect(articles.every((a) => a.workspaceId === ws.body.data.id)).toBe(true);
  });

  it("pageTemplates непустой → ровно N Page на КАЖДЫЙ новый Project в этом воркспейсе", async () => {
    const { token, orgId } = await signUp(app);
    const blueprintId = await insertBlueprintWithTemplates(
      orgId,
      [{ title: "Kickoff checklist", contentJson: { type: "doc" } }, { title: "Contract template" }],
      [],
    );

    const ws = await request(app.getHttpServer())
      .post("/v1/workspaces")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "From blueprint", blueprintId })
      .expect(201);

    const companyId = await makeCompany(app, token);
    const project = await request(app.getHttpServer())
      .post(`/v1/workspaces/${ws.body.data.id}/projects`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "New lead", companyId })
      .expect(201);

    const pages = await prisma.page.findMany({ where: { projectId: project.body.data.id } });
    expect(pages).toHaveLength(2);
    expect(pages.map((p) => p.title).sort()).toEqual(["Contract template", "Kickoff checklist"]);

    // Второй проект в том же воркспейсе — тоже получает свою копию (на каждый Project, не один раз).
    const project2 = await request(app.getHttpServer())
      .post(`/v1/workspaces/${ws.body.data.id}/projects`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Another lead", companyId })
      .expect(201);
    const pages2 = await prisma.page.findMany({ where: { projectId: project2.body.data.id } });
    expect(pages2).toHaveLength(2);
  });

  it("блюпринт без pageTemplates/kbSeed → ничего не создаётся, без ошибок", async () => {
    const { token, orgId } = await signUp(app);
    const blueprintId = await insertBlueprintWithTemplates(orgId, [], []);

    const ws = await request(app.getHttpServer())
      .post("/v1/workspaces")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Empty templates", blueprintId })
      .expect(201);
    expect(await prisma.kBArticle.count({ where: { workspaceId: ws.body.data.id } })).toBe(0);

    const companyId = await makeCompany(app, token);
    const project = await request(app.getHttpServer())
      .post(`/v1/workspaces/${ws.body.data.id}/projects`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Lead", companyId })
      .expect(201);
    expect(await prisma.page.count({ where: { projectId: project.body.data.id } })).toBe(0);
  });

  it("невалидный элемент (без title) пропускается, не блокирует создание", async () => {
    const { token, orgId } = await signUp(app);
    const blueprintId = await insertBlueprintWithTemplates(
      orgId,
      [],
      [{ title: "Valid" }, { notATitle: "broken" }, "just a string"],
    );

    const ws = await request(app.getHttpServer())
      .post("/v1/workspaces")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Partial garbage", blueprintId })
      .expect(201);

    const articles = await prisma.kBArticle.findMany({ where: { workspaceId: ws.body.data.id } });
    expect(articles).toHaveLength(1);
    expect(articles[0]?.title).toBe("Valid");
  });
});
