import { z } from "zod";

/**
 * Env-контракт Helix.
 *
 * M0-скоуп: обязательны DATABASE_URL (API + Prisma-CLI) и JWT (auth входит в M0, см. ниже).
 * Redis/S3 в M0 не подключены (нет BullMQ/S3) → OPTIONAL, иначе приложение не поднялось бы без
 * фиктивных секретов. Ужесточаем per-веха: Redis → M2 (BullMQ), S3 → M3 (files).
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // ── Core (M0) ─────────────────────────────────────────────────────────────
  DATABASE_URL: z.url(),

  // ── Async / Redis (M2 — BullMQ) ─────────────────────────────────────────────
  REDIS_URL: z.url().optional(),

  // ── Files / S3 · MinIO (M3) ──────────────────────────────────────────────────
  S3_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_BUCKET: z.string().optional(),

  // ── Auth / JWT (M0 — см. docs/specs/auth.md) ─────────────────────────────────
  // ОБЯЗАТЕЛЕН: auth входит в M0. Без секрета приложение не должно подниматься —
  // иначе отказ случится на первом логине, а не на старте (ровно то, от чего
  // boot-time валидация и защищает). min(32) — чтобы подпись не была слабой.
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  // TTL access-токена. §1 спеки: ~15 мин — короткий, т.к. stateless и не отзывается.
  JWT_EXPIRES_IN: z.string().default("15m"),

  /**
   * Срок жизни refresh-сессии в днях. §3 спеки: TTL АБСОЛЮТНЫЙ (от createdAt),
   * не скользящий — сессия живёт ровно N дней несмотря на активность, то есть
   * перелогин раз в N дней гарантирован и токенов-долгожителей не возникает.
   * Диапазон из §1 — 7–30 дней; берём верхнюю границу как компромисс с удобством.
   */
  REFRESH_TTL_DAYS: z.coerce.number().int().positive().max(90).default(30),
});

export type Env = z.infer<typeof envSchema>;
