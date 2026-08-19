import { z } from "zod";

/**
 * Env-контракт Helix.
 *
 * M0-скоуп: обязательны DATABASE_URL (API + Prisma-CLI) и JWT (auth входит в M0, см. ниже).
 * Redis был OPTIONAL до M2 (BullMQ ещё не существовал) — теперь обязателен, см. REDIS_URL ниже.
 * S3 — M3 (files, docs/specs/files.md §12): S3_BUCKET обязателен, остальные S3_*
 * условны на провайдере (MinIO в деве нуждается в explicit-кредах/эндпоинте, реальный AWS S3 — нет).
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // ── Core (M0) ─────────────────────────────────────────────────────────────
  DATABASE_URL: z.url(),

  // ── Async / Redis (M2 — BullMQ) ─────────────────────────────────────────────
  REDIS_URL: z.url(), // было optional() — M0-заглушка; с M2 BullMQ реально подключён, обязателен

  // ── Notifications / Email (M2, notifications.md §8) ──────────────────────────
  MAIL_PROVIDER: z.enum(["ses", "smtp", "resend"]),
  MAIL_FROM: z.email(), // адрес отправителя, "Helix <noreply@...>"
  APP_URL: z.url(), // база для deep link в письме (§5)
  // SES (prod): без кастомных кред-переменных — default credential provider chain (IAM role), §7.
  SES_REGION: z.string().optional(),
  // SMTP: в деве (MailHog) без auth — USER/PASS не заданы. Для облачных SMTP-провайдеров
  // (Resend/SendGrid/Mailgun и т.п.) через реальный порт — оба поля optional() на уровне env (те же
  // условные креды, что SES_REGION/S3_*), но SmtpMailerService передаёt auth ТОЛЬКО если оба заданы
  // (см. smtp-mailer.service.ts). НЕ используется в проде на Railway — см. RESEND_API_KEY ниже.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  // Resend HTTP API (не SMTP!) — обнаружено вживую: Railway (и большинство PaaS) блокирует
  // исходящие SMTP-порты (25/465/587) на уровне сети ради анти-спам политики, SMTPConnection падал
  // по "Connection timeout" ещё до того, как Resend вообще видел запрос. HTTP на 443 не блокируется —
  // MAIL_PROVIDER=resend отправляет через api.resend.com, тот же MAIL_FROM.
  RESEND_API_KEY: z.string().optional(), // обязателен только когда MAIL_PROVIDER=resend

  // ── Files / S3 · MinIO (M3, docs/specs/files.md §12) ──────────────────────────
  S3_ENDPOINT: z.url().optional(), // задан → MinIO/S3-совместимый (dev); не задан → настоящий AWS S3 (prod)
  S3_REGION: z.string().optional(), // как SES_REGION — не обязателен, SDK резолвит по умолчанию
  S3_ACCESS_KEY: z.string().optional(), // нужен только при заданном S3_ENDPOINT (MinIO)
  S3_SECRET_KEY: z.string().optional(), // нужен только при заданном S3_ENDPOINT (MinIO)
  S3_BUCKET: z.string(), // ОБЯЗАТЕЛЕН: без него Attachment-модуль не может работать вообще

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

  // ── CORS (M1 — apps/web как отдельный origin) ────────────────────────────────
  // Refresh-cookie идёт с credentials: "include" (auth.md §4) → нужен ТОЧНЫЙ origin
  // в Access-Control-Allow-Origin, wildcard "*" с credentials браузер отклоняет.
  WEB_ORIGIN: z.url().default("http://localhost:5173"),

  // ── AI / RAG (M4, docs/specs/ai-chat.md §9) ───────────────────────────────────
  // Все optional() на уровне env — то, ЧЕМ обслуживать чат/эмбеддинги, выбирается per-org
  // (Organization.settings.aiProvider), не глобально. Если организация выбрала provider, для которого
  // здесь нет ключа — это не boot-time ошибка (как S3_BUCKET), а runtime 422 "AI не настроен для
  // этой организации" (ai-chat.md §12) — ключей может не быть вовсе, если AI никто не включал.
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(), // также обслуживает embeddingProvider="openai" (ADR, decisions.md — Anthropic без embeddings endpoint)
  AWS_BEDROCK_REGION: z.string().optional(), // Bedrock — default credential provider chain (IAM role), тот же паттерн, что SES_REGION
});

export type Env = z.infer<typeof envSchema>;
