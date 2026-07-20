import { z } from "zod";

/**
 * Env-контракт Helix.
 *
 * M0-скоуп (decision E): обязателен только DATABASE_URL — на нём стоит и API,
 * и Prisma-CLI. Redis/S3/JWT в M0 не подключены (нет BullMQ/S3/auth), поэтому
 * они OPTIONAL — иначе приложение не поднялось бы без фиктивных секретов.
 * Ужесточаем per-веха: JWT → M2 (auth), Redis → M2 (BullMQ), S3 → M3 (files).
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

  // ── Auth / JWT (M2) ──────────────────────────────────────────────────────────
  JWT_SECRET: z.string().min(1).optional(),
  JWT_EXPIRES_IN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;
