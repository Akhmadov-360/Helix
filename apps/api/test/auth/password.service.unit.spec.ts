import { describe, expect, it } from "vitest";
import { ARGON2_POLICY, PasswordService } from "../../src/modules/auth/password.service";

/**
 * Unit-уровень: чистая криптообвязка, без БД и сети.
 * Ловит класс багов «хеширование вообще не работает / работает не тем алгоритмом».
 */
describe("PasswordService", () => {
  const passwords = new PasswordService();

  it("hash → verify проходит для правильного пароля", async () => {
    const hash = await passwords.hash("correct horse battery staple");
    expect(await passwords.verify(hash, "correct horse battery staple")).toBe(true);
  });

  it("verify отвергает неверный пароль", async () => {
    const hash = await passwords.hash("correct horse battery staple");
    expect(await passwords.verify(hash, "wrong password entirely")).toBe(false);
  });

  it("хеш не содержит открытый пароль и помечен argon2id", async () => {
    const hash = await passwords.hash("super secret value");
    expect(hash).not.toContain("super secret value");
    expect(hash.startsWith("$argon2id$")).toBe(true);
  });

  it("одинаковые пароли дают разные хеши (соль случайна)", async () => {
    const a = await passwords.hash("same password twice");
    const b = await passwords.hash("same password twice");
    expect(a).not.toBe(b);
  });

  it("verify не падает на мусоре, а возвращает false", async () => {
    expect(await passwords.verify("not-a-valid-phc-string", "whatever")).toBe(false);
  });

  describe("needsRehash", () => {
    it("свежий хеш по текущей политике пересчитывать не нужно", async () => {
      const hash = await passwords.hash("some password here");
      expect(passwords.needsRehash(hash)).toBe(false);
    });

    it("хеш со слабой памятью требует пересчёта", () => {
      const weak = `$argon2id$v=19$m=${ARGON2_POLICY.memoryCost - 1},t=2,p=1$c29tZXNhbHQ$aGFzaA`;
      expect(passwords.needsRehash(weak)).toBe(true);
    });

    it("хеш с меньшим числом итераций требует пересчёта", () => {
      const weak = `$argon2id$v=19$m=${ARGON2_POLICY.memoryCost},t=1,p=1$c29tZXNhbHQ$aGFzaA`;
      expect(passwords.needsRehash(weak)).toBe(true);
    });

    it("другой вариант argon2 требует пересчёта", () => {
      const wrongVariant = `$argon2i$v=19$m=${ARGON2_POLICY.memoryCost},t=2,p=1$c29tZXNhbHQ$aGFzaA`;
      expect(passwords.needsRehash(wrongVariant)).toBe(true);
    });

    it("нераспознанный формат требует пересчёта (безопасный дефолт)", () => {
      expect(passwords.needsRehash("$2b$12$somethingbcryptish")).toBe(true);
    });
  });
});
