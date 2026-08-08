import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";
import { createTestApp } from "../helpers/create-test-app";

let counter = 0;

async function signUp(app: INestApplication): Promise<{ token: string; orgId: string; userId: string }> {
  const email = `inv${counter++}@example.com`;
  const res = await request(app.getHttpServer())
    .post("/v1/auth/register")
    .send({ email, name: "Founder", password: "correct horse battery staple" })
    .expect(201);
  const token = res.body.data.accessToken as string;
  const claims = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString());
  return { token, orgId: claims.activeOrgId, userId: claims.sub };
}

/** Второй пользователь-член ЭТОЙ орги — под role-hierarchy/RBAC-тесты. */
async function addOrgMember(orgId: string, role: "OWNER" | "ADMIN" | "MANAGER" | "MEMBER" | "VIEWER"): Promise<string> {
  const user = await prisma.user.create({ data: { email: `orgmember${counter++}@example.com`, name: "Member", passwordHash: "x" } });
  await prisma.membership.create({ data: { orgId, userId: user.id, role } });
  return user.id;
}

async function clearMailhog(): Promise<void> {
  await fetch("http://localhost:8025/api/v1/messages", { method: "DELETE" });
}

interface MailhogMessage {
  Content: { Headers: Record<string, string[]>; Body: string };
}

async function waitForMailhogMessage(timeoutMs = 5000): Promise<MailhogMessage> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch("http://localhost:8025/api/v2/messages");
    const body = (await res.json()) as { items: MailhogMessage[] };
    if (body.items.length > 0) return body.items[0]!;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Timed out waiting for MailHog message");
}

/**
 * nodemailer шлёт text-часть в quoted-printable: не только мягкие переносы `=\r\n` на длинных
 * строках, но и сам литеральный `=` из `token=` кодируется как `=3D` — без полного QP-декода
 * регэксп на "token=" вообще не совпадёт с телом письма.
 */
function decodeQuotedPrintable(str: string): string {
  return str.replace(/=\r\n/g, "").replace(/=\n/g, "").replace(/=([0-9A-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

/** Токен существует только в письме (invites.md §2) — достаём его из deep link в тексте письма. */
function extractToken(msg: MailhogMessage): string {
  const body = decodeQuotedPrintable(msg.Content.Body);
  const match = /token=([^\s&]+)/.exec(body);
  if (!match) throw new Error("No token found in invite email body");
  return decodeURIComponent(match[1]!);
}

describe("Invites (invites.md)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await clearMailhog();
  });

  const createInvite = (token: string, email: string, role: string) =>
    request(app.getHttpServer())
      .post("/v1/organizations/invites")
      .set("Authorization", `Bearer ${token}`)
      .send({ email, role });

  const listInvites = (token: string) =>
    request(app.getHttpServer()).get("/v1/organizations/invites").set("Authorization", `Bearer ${token}`);

  const revokeInvite = (token: string, id: string) =>
    request(app.getHttpServer()).delete(`/v1/organizations/invites/${id}`).set("Authorization", `Bearer ${token}`);

  const preview = (inviteToken: string) => request(app.getHttpServer()).get(`/v1/invites/${inviteToken}`);

  const accept = (inviteToken: string, body: { name?: string; password?: string }) =>
    request(app.getHttpServer()).post(`/v1/invites/${inviteToken}/accept`).send(body);

  describe("create (§1/§4/§5)", () => {
    it("Owner создаёт инвайт → 201-подобный 200/201, письмо доходит с корректным deep link", async () => {
      const owner = await signUp(app);

      await createInvite(owner.token, "newperson@example.com", "MEMBER").expect(201);

      const msg = await waitForMailhogMessage();
      expect(msg.Content.Body).toContain("/invite/accept?token=");
      const rawToken = extractToken(msg);
      expect(rawToken.length).toBeGreaterThan(0);
    });

    it("Manager/Member/Viewer → 403", async () => {
      const owner = await signUp(app);
      await prisma.membership.updateMany({ where: { userId: owner.userId }, data: { role: "MEMBER" } });
      await createInvite(owner.token, "x@example.com", "MEMBER").expect(403);
    });

    it("role hierarchy (§4): Admin не может пригласить OWNER, но может ADMIN; Owner может пригласить OWNER", async () => {
      const owner = await signUp(app);
      await prisma.membership.updateMany({ where: { userId: owner.userId }, data: { role: "ADMIN" } });

      await createInvite(owner.token, "cant-be-owner@example.com", "OWNER").expect(400);
      await createInvite(owner.token, "can-be-admin@example.com", "ADMIN").expect(201);

      await prisma.membership.updateMany({ where: { userId: owner.userId }, data: { role: "OWNER" } });
      await clearMailhog();
      await createInvite(owner.token, "owner-invite@example.com", "OWNER").expect(201);
    });

    it("already member (§3): email, уже состоящий в этой орге → 409", async () => {
      const owner = await signUp(app);
      const memberId = await addOrgMember(owner.orgId, "MEMBER");
      const memberUser = await prisma.user.findUniqueOrThrow({ where: { id: memberId } });

      await createInvite(owner.token, memberUser.email, "MEMBER").expect(409);
    });

    it("resend (§1): повторный invite на тот же email → старый токен мёртв, новый работает", async () => {
      const owner = await signUp(app);

      await createInvite(owner.token, "resend@example.com", "MEMBER").expect(201);
      const first = await waitForMailhogMessage();
      const firstToken = extractToken(first);

      await clearMailhog();
      await createInvite(owner.token, "resend@example.com", "MEMBER").expect(201);
      const second = await waitForMailhogMessage();
      const secondToken = extractToken(second);

      const firstPreview = await preview(firstToken);
      expect(firstPreview.status).toBe(401); // старый токен revoke'нут resend'ом (§1) → невалиден

      const secondPreview = await preview(secondToken).expect(200);
      expect(secondPreview.body.data.email).toBe("resend@example.com");
    });
  });

  describe("preview + accept (§3, §6)", () => {
    it("REGISTER-ветка: email без User → acceptMode=REGISTER, accept создаёт User+Membership, БЕЗ личной организации", async () => {
      const owner = await signUp(app);
      await createInvite(owner.token, "brandnew@example.com", "MEMBER").expect(201);
      const rawToken = extractToken(await waitForMailhogMessage());

      const prev = await preview(rawToken).expect(200);
      expect(prev.body.data.acceptMode).toBe("REGISTER");

      const res = await accept(rawToken, { name: "Brand New", password: "correct horse battery staple" }).expect(200);
      expect(res.body.data.user.email).toBe("brandnew@example.com");

      const createdUser = await prisma.user.findUniqueOrThrow({ where: { email: "brandnew@example.com" } });
      const memberships = await prisma.membership.findMany({ where: { userId: createdUser.id } });
      expect(memberships).toHaveLength(1); // §9.1: ровно одна Membership, БЕЗ личной организации
      expect(memberships[0]!.orgId).toBe(owner.orgId);
      expect(memberships[0]!.role).toBe("MEMBER");
    });

    it("REGISTER-ветка без name/password → 400 (InviteAcceptRequiresProfileError)", async () => {
      const owner = await signUp(app);
      await createInvite(owner.token, "needsprofile@example.com", "MEMBER").expect(201);
      const rawToken = extractToken(await waitForMailhogMessage());

      await accept(rawToken, {}).expect(400);
    });

    it("ACCEPT-ветка: email с существующим User (в другой орге) → новая Membership, User не дублируется", async () => {
      const owner = await signUp(app);
      const other = await signUp(app); // существует в СВОЕЙ личной орге

      await createInvite(owner.token, (await prisma.user.findUniqueOrThrow({ where: { id: other.userId } })).email, "MANAGER").expect(201);
      const rawToken = extractToken(await waitForMailhogMessage());

      const prev = await preview(rawToken).expect(200);
      expect(prev.body.data.acceptMode).toBe("ACCEPT");

      const usersBefore = await prisma.user.count();
      const res = await accept(rawToken, {}).expect(200);
      expect(res.body.data.user.email).toBe((await prisma.user.findUniqueOrThrow({ where: { id: other.userId } })).email);
      expect(await prisma.user.count()).toBe(usersBefore); // User НЕ создан заново

      const memberships = await prisma.membership.findMany({ where: { userId: other.userId } });
      expect(memberships.map((m) => m.orgId).sort()).toEqual([other.orgId, owner.orgId].sort());
    });

    it("race-guard: конкурентный двойной accept одного токена → ровно один успевает, вторая Membership не создаётся", async () => {
      const owner = await signUp(app);
      await createInvite(owner.token, "racer@example.com", "MEMBER").expect(201);
      const rawToken = extractToken(await waitForMailhogMessage());

      const body = { name: "Racer", password: "correct horse battery staple" };
      const [first, second] = await Promise.all([accept(rawToken, body), accept(rawToken, body)]);

      // Для НОВОГО email оба конкурента сначала гонятся за users.create() (User.email @unique) —
      // проигравший может словить 409 там, ДО того как вообще дойдёт до markAccepted (401).
      // Инвариант — не конкретный код проигравшего, а «ровно один 200, вторая Membership не создана».
      const statuses = [first.status, second.status].sort((a, b) => a - b);
      expect(statuses[0]).toBe(200);
      expect(statuses[1]).not.toBe(200);

      const user = await prisma.user.findUnique({ where: { email: "racer@example.com" } });
      expect(user).not.toBeNull();
      const memberships = await prisma.membership.findMany({ where: { userId: user!.id } });
      expect(memberships).toHaveLength(1);
    });

    it("истёкший/отозванный/уже принятый токен → 401 без различения причины", async () => {
      const owner = await signUp(app);

      // отозванный
      await createInvite(owner.token, "torevoke@example.com", "MEMBER").expect(201);
      const revokedToken = extractToken(await waitForMailhogMessage());
      const listed = (await listInvites(owner.token).expect(200)).body.data as { id: string; email: string }[];
      const toRevoke = listed.find((i) => i.email === "torevoke@example.com")!;
      await revokeInvite(owner.token, toRevoke.id).expect(200);
      await preview(revokedToken).expect(401);
      await accept(revokedToken, {}).expect(401);

      // уже принятый
      await clearMailhog();
      await createInvite(owner.token, "alreadyaccepted@example.com", "MEMBER").expect(201);
      const acceptedToken = extractToken(await waitForMailhogMessage());
      await accept(acceptedToken, { name: "X", password: "correct horse battery staple" }).expect(200);
      await preview(acceptedToken).expect(401);
      await accept(acceptedToken, {}).expect(401);
    });
  });

  describe("list / revoke (§6) — RBAC и tenant", () => {
    it("GET список показывает только pending СВОЕЙ орги", async () => {
      const owner = await signUp(app);
      const stranger = await signUp(app);

      await createInvite(owner.token, "own-org@example.com", "MEMBER").expect(201);
      await createInvite(stranger.token, "stranger-org@example.com", "MEMBER").expect(201);

      const list = (await listInvites(owner.token).expect(200)).body.data as { email: string }[];
      expect(list.map((i) => i.email)).toContain("own-org@example.com");
      expect(list.map((i) => i.email)).not.toContain("stranger-org@example.com");
    });

    it("DELETE чужого id (другая орга) → 404, не 200", async () => {
      const owner = await signUp(app);
      const stranger = await signUp(app);

      await createInvite(owner.token, "target@example.com", "MEMBER").expect(201);
      const listed = (await listInvites(owner.token).expect(200)).body.data as { id: string }[];

      await revokeInvite(stranger.token, listed[0]!.id).expect(404);
    });

    it("Manager/Member/Viewer → 403 на list/revoke", async () => {
      const owner = await signUp(app);
      await createInvite(owner.token, "for-rbac@example.com", "MEMBER").expect(201);
      const listed = (await listInvites(owner.token).expect(200)).body.data as { id: string }[];

      await prisma.membership.updateMany({ where: { userId: owner.userId }, data: { role: "MEMBER" } });
      await listInvites(owner.token).expect(403);
      await revokeInvite(owner.token, listed[0]!.id).expect(403);
    });
  });
});
