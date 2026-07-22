import { JwtService, type JwtSignOptions } from "@nestjs/jwt";
import { describe, expect, it } from "vitest";
import { InvalidTokenError } from "../../src/core/errors/domain-error";
import { TokenService } from "../../src/modules/auth/token.service";

const SECRET = "test-only-secret-not-for-production-0123456789";

const makeTokens = (expiresIn = "15m"): TokenService =>
  new TokenService(
    new JwtService({
      secret: SECRET,
      // Как и в AuthModule: шаблонный ms-тип не выводится из обычной строки.
      signOptions: { expiresIn: expiresIn as JwtSignOptions["expiresIn"] },
    }),
  );

describe("TokenService", () => {
  it("подписывает и проверяет токен", async () => {
    const tokens = makeTokens();
    const token = await tokens.issueAccessToken("user-1", "org-1");
    const payload = await tokens.verifyAccessToken(token);

    expect(payload.sub).toBe("user-1");
    expect(payload.activeOrgId).toBe("org-1");
    expect(typeof payload.jti).toBe("string");
  });

  /**
   * Страж против регрессии P3 (§12 спеки): если кто-то «для удобства» положит в токен
   * роль или профиль, тест покраснеет. Роль обязана читаться свежей из Membership,
   * иначе понижение прав не подействует до истечения токена.
   */
  it("НЕ содержит role, email и name", async () => {
    const tokens = makeTokens();
    const token = await tokens.issueAccessToken("user-1", "org-1");

    const claims = JSON.parse(
      Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"),
    ) as Record<string, unknown>;

    expect(claims).not.toHaveProperty("role");
    expect(claims).not.toHaveProperty("email");
    expect(claims).not.toHaveProperty("name");
    expect(Object.keys(claims).sort()).toEqual(["activeOrgId", "exp", "iat", "jti", "sub"]);
  });

  it("каждый токен получает свой jti", async () => {
    const tokens = makeTokens();
    const first = await tokens.verifyAccessToken(await tokens.issueAccessToken("user-1", "org-1"));
    const second = await tokens.verifyAccessToken(await tokens.issueAccessToken("user-1", "org-1"));

    expect(first.jti).not.toBe(second.jti);
  });

  it("отвергает истёкший токен", async () => {
    const expired = makeTokens("-1s");
    const token = await expired.issueAccessToken("user-1", "org-1");

    await expect(expired.verifyAccessToken(token)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it("отвергает токен, подписанный чужим секретом", async () => {
    const foreign = new TokenService(new JwtService({ secret: "someone-elses-secret-0123456789abcd" }));
    const token = await foreign.issueAccessToken("user-1", "org-1");

    await expect(makeTokens().verifyAccessToken(token)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it("отвергает мусор вместо токена", async () => {
    await expect(makeTokens().verifyAccessToken("not.a.token")).rejects.toBeInstanceOf(
      InvalidTokenError,
    );
  });
});
