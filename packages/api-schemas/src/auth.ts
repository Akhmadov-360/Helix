import { z } from "zod";
import { capabilitiesSchema } from "./capabilities";

/**
 * Нормализация ДО валидации: пользователи пастят email с пробелами и в разном
 * регистре, а `User.email @unique` в Postgres регистрозависим — без приведения
 * Foo@x.com и foo@x.com завели бы два аккаунта на один почтовый ящик.
 */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

/**
 * Минимум 12 символов — OWASP ASVS v4 (V2.1.1). Верхняя граница 128 — ограничение
 * входа; на стоимость argon2 длина пароля влияет слабо, но неограниченный вход
 * принимать незачем.
 */
export const passwordSchema = z.string().min(12).max(128);

// ─────────────────────────────── register ──────────────────────────────────

export const registerSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1).max(200),
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

// ───────────────────────────────── login ──────────────────────────────────

export const loginSchema = z.object({
  email: emailSchema,
  /**
   * Здесь НЕ применяем `passwordSchema` (min 12) намеренно: политика длины
   * действует на МОМЕНТ ЗАДАНИЯ пароля. У существующих учёток пароль может быть
   * короче (заведён до ужесточения политики) — на логине его надо принять и
   * проверить, а не отвергать по формату. Плюс отказ по длине до проверки пароля
   * подсказывал бы атакующему, что политика поменялась.
   */
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Публичный профиль. Намеренно НЕ содержит passwordHash — форма ответа задана
 * контрактом, а не тем, что вернул ORM (защита от утечки полей при рефакторинге).
 */
export const userProfileSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
});
export type UserProfile = z.infer<typeof userProfileSchema>;

/**
 * Роли уровня организации. ДУБЛИРУЕТ enum Role из schema.prisma намеренно:
 * api-schemas — контракт для фронта, который Prisma-клиент не подключает.
 * Расхождение ловится на компиляции в apps/api (проверка совместимости типов).
 */
export const roleSchema = z.enum(["OWNER", "ADMIN", "MANAGER", "MEMBER", "VIEWER"]);
export type Role = z.infer<typeof roleSchema>;

// ─────────────────────────────── switch-org ────────────────────────────────

export const switchOrgSchema = z.object({
  orgId: z.string().min(1),
});
export type SwitchOrgInput = z.infer<typeof switchOrgSchema>;

/**
 * Ответ GET /v1/auth/me: профиль + КОНТЕКСТ текущего запроса. Роль отдаётся здесь,
 * а не в токене, — она читается из Membership на каждом запросе и всегда актуальна.
 */
export const currentUserSchema = userProfileSchema.extend({
  activeOrgId: z.string(),
  role: roleSchema,
  // Плоская проекция CASL-ability (§8.2 frontend-architecture.md) — UI решает, что показать;
  // сервер по-прежнему единственный энфорсер (@CheckPolicy на каждом мутаторе).
  capabilities: capabilitiesSchema,
});
export type CurrentUser = z.infer<typeof currentUserSchema>;

/**
 * Результат успешной аутентификации (регистрация и логин отдают одно и то же).
 * Access-токен возвращается в ТЕЛЕ намеренно: клиент держит его в памяти JS,
 * не в localStorage (§4 спеки). Refresh поедет в httpOnly-cookie на шаге 5.
 */
export const authResultSchema = z.object({
  accessToken: z.string(),
  user: userProfileSchema,
});
export type AuthResult = z.infer<typeof authResultSchema>;

// ────────────────────────── forgot / reset password ────────────────────────

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
