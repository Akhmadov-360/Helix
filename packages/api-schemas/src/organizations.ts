import { z } from "zod";
import { roleSchema } from "./auth";

// Ростер орги — под UI-пикеры (assignee/co-worker/reassign, frontend-architecture.md §12/§13).
// orgId НЕ в ответе: список уже org-scoped через токен, дублировать нечего.
export const orgMemberResponseSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  role: roleSchema,
});
export type OrgMemberResponse = z.infer<typeof orgMemberResponseSchema>;

export const orgMemberListResponseSchema = z.array(orgMemberResponseSchema);
export type OrgMemberListResponse = z.infer<typeof orgMemberListResponseSchema>;

// Расширенный вариант — под Settings > Members (админ смотрит workload). UI-пикеры
// (assignee/co-worker/reassign) продолжают ходить в базовую schema — избегаем лишних
// SQL-агрегатов, которые пикерам не нужны и вызываются часто. Разделение по endpoint-параметру
// `?stats=true` в контроллере, не отдельный роут (та же ресурсная сущность, разный проекция).
// Membership не имеет createdAt в schema.prisma — "joined at" колонку сюда добавим отдельным PR
// с миграцией (Membership +createdAt @default(now()) @db.Timestamptz), это не блокирует остальные
// две метрики.
export const orgMemberDetailedResponseSchema = orgMemberResponseSchema.extend({
  assignedLeadsCount: z.number().int().min(0), // Project.status === OPEN (не WON/LOST/ARCHIVED — те не workload)
  openTasksCount: z.number().int().min(0), // Task.done === false
});
export type OrgMemberDetailedResponse = z.infer<typeof orgMemberDetailedResponseSchema>;

export const orgMemberDetailedListResponseSchema = z.array(orgMemberDetailedResponseSchema);
export type OrgMemberDetailedListResponse = z.infer<typeof orgMemberDetailedListResponseSchema>;

// Список орг ТЕКУЩЕГО пользователя (FR-ORG-2) — под org-switcher. orgId ЕСТЬ в ответе (в отличие
// от orgMemberResponseSchema): здесь список СПАН нескольких орг, скоуп по токену не подходит.
export const myOrgResponseSchema = z.object({
  orgId: z.string(),
  name: z.string(),
  role: roleSchema,
});
export type MyOrgResponse = z.infer<typeof myOrgResponseSchema>;

export const myOrgListResponseSchema = z.array(myOrgResponseSchema);
export type MyOrgListResponse = z.infer<typeof myOrgListResponseSchema>;

// ────────────────────── создание доп. организации (FR-ORG-2) ────────────────────
// Organization.name — простая строка (см. registration.service.ts), не LocalizedName.
export const createOrganizationSchema = z.object({
  name: z.string().trim().min(1).max(200),
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

// ─────────────────── смена роли участника (Appendix B, O/A only) ────────────────
export const changeMemberRoleSchema = z.object({
  role: roleSchema,
});
export type ChangeMemberRoleInput = z.infer<typeof changeMemberRoleSchema>;

// ───────────────────────── FR-ORG-3: org-level settings ─────────────────────────
// Organization.settings — типизированная проекция JSON-колонки (default "{}"), не отдельные
// колонки схемы: ни одно поле не нуждается в индексации/фильтрации, а набор естественно растёт
// без новых миграций. Все поля опциональны — партиальный PATCH мёржится в service, не здесь.

// Полные официальные списки ECMA-402 (Intl.supportedValuesOf), а не ручная курация — не устаревают
// и не требуют поддержки. Работает и в Node (валидация на бэке), и в браузере (Select на фронте):
// оба — часть baseline ECMA-402, доступны там, где уже используется остальной Intl (locale, дата).
export const CURRENCY_CODES = Intl.supportedValuesOf("currency");
export const currencyCodeSchema = z.enum(CURRENCY_CODES);

export const TIME_ZONES = Intl.supportedValuesOf("timeZone");
export const timeZoneSchema = z.enum(TIME_ZONES);

// logoUrl: временно принимает и обычный URL, и data:-URI (см. организация-настройки §логотип) —
// загрузка файла в S3/MinIO это M3 (packages/config/src/env.schema.ts помечает S3 как M3/files),
// до тех пор фронт кодирует превью в data-URI на клиенте с проверкой размера/типа. Единственный
// источник лимита — MAX_LOGO_FILE_BYTES; здесь его же base64-проекция (+overhead data:-префикса),
// не отдельная константа, которая могла бы разъехаться с клиентской проверкой.
export const MAX_LOGO_FILE_BYTES = 300 * 1024;
const MAX_LOGO_DATA_URI_LENGTH = Math.ceil(MAX_LOGO_FILE_BYTES / 3) * 4 + 50;

const brandingSchema = z.object({
  logoUrl: z.string().url().max(MAX_LOGO_DATA_URI_LENGTH).optional(),
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Ожидается hex-цвет, напр. #1a2b3c")
    .optional(),
});

// aiProvider — потребитель появился (@helix/ai, ai-chat.md §5), enum'ы теперь реальные значения,
// не свободная строка. embeddingProvider — ОТДЕЛЬНОЕ поле от provider (ADR, decisions.md): у
// Anthropic нет embeddings endpoint, поэтому chat- и embedding-провайдер выбираются независимо —
// схема не должна давать выбрать anthropic туда, где нужен embeddingProvider. "gemini" в обоих
// enum'ах — у Google есть и chat, и embeddings (последний через Matryoshka в vector(1536)).
export const AI_CHAT_PROVIDERS = ["anthropic", "openai", "gemini", "bedrock"] as const;
export type AiChatProviderName = (typeof AI_CHAT_PROVIDERS)[number];
export const AI_EMBEDDING_PROVIDERS = ["openai", "gemini", "bedrock"] as const;
export type AiEmbeddingProviderName = (typeof AI_EMBEDDING_PROVIDERS)[number];

const aiProviderSchema = z.object({
  provider: z.enum(AI_CHAT_PROVIDERS).optional(),
  embeddingProvider: z.enum(AI_EMBEDDING_PROVIDERS).optional(),
  region: z.string().trim().min(1).max(100).optional(),
});

export const organizationSettingsSchema = z.object({
  currency: currencyCodeSchema.optional(),
  timezone: timeZoneSchema.optional(),
  branding: brandingSchema.optional(),
  aiProvider: aiProviderSchema.optional(),
});
export type OrganizationSettings = z.infer<typeof organizationSettingsSchema>;

// PATCH-тело — то же самое (все поля optional) + name. name — не часть JSON `settings` (это
// отдельная колонка Organization.name, см. registration.service.ts), но живёт в той же форме и
// том же PATCH-запросе, что и остальные 4 группы (одна форма-редактор, см. general-settings-page.tsx).
export const updateOrganizationSettingsSchema = organizationSettingsSchema.extend({
  name: z.string().trim().min(1).max(200).optional(),
});
export type UpdateOrganizationSettingsInput = z.infer<typeof updateOrganizationSettingsSchema>;

export const organizationSettingsResponseSchema = z.object({
  orgId: z.string(),
  name: z.string(),
  settings: organizationSettingsSchema,
});
export type OrganizationSettingsResponse = z.infer<typeof organizationSettingsResponseSchema>;
