import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";
import { REFRESH_COOKIE_NAME } from "../../src/modules/auth/sessions/refresh-cookie.service";
import { hashRefreshToken } from "../../src/modules/auth/sessions/refresh-token";
import { createTestApp } from "../helpers/create-test-app";

const REGISTRATION = {
  email: "member@example.com",
  name: "Test Member",
  password: "correct horse battery staple",
};

function cookieFrom(res: request.Response): string {
  const raw = res.headers["set-cookie"] as unknown as string[] | undefined;
  const cookie = raw?.find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`));
  if (!cookie) throw new Error("refresh cookie not set");
  return cookie.split(";")[0] ?? "";
}

function tokenFrom(cookie: string): string {
  return decodeURIComponent(cookie.split("=")[1] ?? "");
}

describe("Ротация refresh + reuse detection (§5)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const signUp = async (): Promise<string> =>
    cookieFrom(
      await request(app.getHttpServer()).post("/v1/auth/register").send(REGISTRATION).expect(201),
    );

  const refresh = (cookie: string) =>
    request(app.getHttpServer()).post("/v1/auth/refresh").set("Cookie", cookie);

  describe("ротация", () => {
    it("выдаёт НОВЫЙ refresh-токен в cookie", async () => {
      const first = await signUp();
      const second = cookieFrom(await refresh(first).expect(200));

      expect(second).not.toBe(first);
    });

    it("создаёт НОВУЮ строку, а не обновляет старую in-place", async () => {
      const cookie = await signUp();
      const before = await prisma.refreshSession.findFirst();

      await refresh(cookie).expect(200);

      const sessions = await prisma.refreshSession.findMany({ orderBy: { createdAt: "asc" } });

      // §5 прямо запрещает обновление tokenHash in-place: оно затёрло бы старый хеш,
      // и повторный приход старого токена стал бы неотличим от невалидного —
      // reuse detection умерла бы молча. Тест краснеет, если кто-то так «оптимизирует».
      expect(sessions).toHaveLength(2);
      expect(sessions[0]?.id).toBe(before?.id);
      expect(sessions[0]?.tokenHash).toBe(before?.tokenHash);
      expect(sessions[1]?.tokenHash).not.toBe(before?.tokenHash);
    });

    it("старая строка помечается потраченной, новая остаётся живой", async () => {
      const cookie = await signUp();
      await refresh(cookie).expect(200);

      const [old, fresh] = await prisma.refreshSession.findMany({ orderBy: { createdAt: "asc" } });

      expect(old?.usedAt).toBeInstanceOf(Date);
      expect(fresh?.usedAt).toBeNull();
      expect(fresh?.revokedAt).toBeNull();
    });

    it("новая строка остаётся в ТОЙ ЖЕ цепочке", async () => {
      const cookie = await signUp();
      await refresh(cookie).expect(200);

      const families = new Set((await prisma.refreshSession.findMany()).map((s) => s.familyId));
      expect(families.size).toBe(1);
    });

    it("новый токен в cookie соответствует хешу новой строки", async () => {
      const cookie = await signUp();
      const rotated = cookieFrom(await refresh(cookie).expect(200));

      const fresh = await prisma.refreshSession.findFirst({ where: { usedAt: null } });
      expect(fresh?.tokenHash).toBe(hashRefreshToken(tokenFrom(rotated)));
    });

    it("новым токеном можно рефрешить дальше — цепочка живёт", async () => {
      let cookie = await signUp();

      for (let i = 0; i < 3; i++) {
        cookie = cookieFrom(await refresh(cookie).expect(200));
      }

      expect(await prisma.refreshSession.count()).toBe(4);
    });

    it("TTL НЕ продлевается ротацией (абсолютный, не скользящий)", async () => {
      const cookie = await signUp();
      const original = await prisma.refreshSession.findFirst();

      await refresh(cookie).expect(200);
      const rotated = await prisma.refreshSession.findFirst({ where: { usedAt: null } });

      // §3: сессия живёт ровно N дней от создания несмотря на активность. Если бы
      // ротация выдавала новые N дней, активная сессия не протухала бы никогда.
      expect(rotated?.expiresAt.getTime()).toBe(original?.expiresAt.getTime());
    });
  });

  describe("reuse detection — ГЛАВНЫЙ тест", () => {
    it("повторный приход старого токена убивает ВСЮ семью", async () => {
      const first = await signUp();
      const second = cookieFrom(await refresh(first).expect(200));

      // Старый токен приходит второй раз — это и есть аномалия.
      await refresh(first).expect(401);

      const sessions = await prisma.refreshSession.findMany();
      expect(sessions).toHaveLength(2);
      for (const session of sessions) {
        expect(session.revokedAt).toBeInstanceOf(Date);
        expect(session.revokedReason).toBe("REUSE");
      }

      // Свежий токен тоже мёртв: отличить вора от юзера нельзя, поэтому цепочка
      // умирает целиком. Простой отказ не спас бы — если ротировал вор, у него
      // на руках валидный токен.
      await refresh(second).expect(401);

      // ADR (refresh-session-retention): REUSE — forensic-факт, который переживает саму
      // RefreshSession-строку (retention теперь короткий, operational-only) — уходит в AuditLog
      // атомарно с revokeFamily. actorId=null: userId здесь ПОСТРАДАВШИЙ, не актор действия.
      const session = sessions[0];
      const membership = await prisma.membership.findFirstOrThrow({ where: { userId: session?.userId } });
      const auditEntry = await prisma.auditLog.findFirstOrThrow({
        where: { orgId: membership.orgId, action: "security.refresh_token_reuse_detected" },
      });
      expect(auditEntry.actorId).toBeNull();
      expect(auditEntry.payload).toEqual({
        schemaVersion: 1,
        userId: session?.userId,
        familyId: session?.familyId,
      });
    });

    it("отзыв цепочки ПЕРЕЖИВАЕТ откат — kill family реально коммитится", async () => {
      const first = await signUp();
      await refresh(first).expect(200);
      await refresh(first).expect(401);

      // Если бы 401 бросался внутри транзакции, Prisma откатила бы её вместе
      // с revokeFamily, и строки остались бы живыми.
      expect(await prisma.refreshSession.count({ where: { revokedAt: null } })).toBe(0);
    });

    it("чужая цепочка (другое устройство) при reuse не страдает", async () => {
      const deviceA = await signUp();
      const deviceB = cookieFrom(
        await request(app.getHttpServer())
          .post("/v1/auth/login")
          .send({ email: REGISTRATION.email, password: REGISTRATION.password })
          .expect(200),
      );

      await refresh(deviceA).expect(200);
      await refresh(deviceA).expect(401); // reuse на устройстве A

      // Устройство B в другой семье — его выкидывать не за что.
      await refresh(deviceB).expect(200);
    });

    it("отозванная семья не воскресает", async () => {
      const first = await signUp();
      const second = cookieFrom(await refresh(first).expect(200));
      await refresh(first).expect(401);

      await refresh(second).expect(401);
      await refresh(first).expect(401);
      expect(await prisma.refreshSession.count({ where: { revokedAt: null } })).toBe(0);
    });
  });

  describe("конкурентность", () => {
    it("два одновременных refresh одним токеном: один выигрывает, второй ловит reuse", async () => {
      const cookie = await signUp();

      const [first, second] = await Promise.all([refresh(cookie), refresh(cookie)]);
      const statuses = [first.status, second.status].sort((a, b) => a - b);

      // Инвариант «ровно один раз» держится атомарным compare-and-set на usedAt:
      // обычный SELECT-then-UPDATE пропустил бы обоих.
      expect(statuses).toEqual([200, 401]);

      // Строгая политика M0 (§5): проигравший трактуется как reuse → семья умирает.
      expect(await prisma.refreshSession.count({ where: { revokedAt: null } })).toBe(0);
    });
  });
});
