import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateRefreshToken, hashRefreshToken } from "../../src/modules/auth/sessions/refresh-token";

describe("refresh-token", () => {
  it("каждый вызов даёт новый токен", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateRefreshToken()));
    expect(tokens.size).toBe(100);
  });

  it("токен url-safe и достаточно длинный (32 байта в base64url)", () => {
    const token = generateRefreshToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
  });

  it("хеш детерминирован", () => {
    const token = generateRefreshToken();
    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token));
  });

  it("хеш — это SHA-256 в hex, и он не равен самому токену", () => {
    const token = generateRefreshToken();
    const hash = hashRefreshToken(token);

    expect(hash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(hash).toHaveLength(64);
    expect(hash).not.toBe(token);
  });

  it("разные токены дают разные хеши", () => {
    expect(hashRefreshToken(generateRefreshToken())).not.toBe(
      hashRefreshToken(generateRefreshToken()),
    );
  });
});
