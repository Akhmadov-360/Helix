import { z } from "zod";
import { emailSchema, passwordSchema, roleSchema } from "./auth";

// ───────────────────────── создать инвайт (Owner/Admin) ─────────────────────────

export const createInviteSchema = z.object({
  email: emailSchema,
  role: roleSchema,
});
export type CreateInviteInput = z.infer<typeof createInviteSchema>;

// ─────────────────────── список pending-инвайтов орги ───────────────────────────

export const inviteResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: roleSchema,
  invitedByName: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
});
export type InviteResponse = z.infer<typeof inviteResponseSchema>;

export const inviteListResponseSchema = z.array(inviteResponseSchema);
export type InviteListResponse = z.infer<typeof inviteListResponseSchema>;

// ───────────────────────── превью + accept (публичные) ──────────────────────────

// invites.md §3: какой экран рисовать, не факт о существовании User — фронт не должен знать
// ПОЧЕМУ, только КАКОЙ ветки accept держаться. Растёт вперёд без ломающих изменений контракта
// (напр. "SSO" рядом, когда SSO-инвайты когда-нибудь появятся, §0).
export const acceptModeSchema = z.enum(["REGISTER", "ACCEPT"]);
export type AcceptMode = z.infer<typeof acceptModeSchema>;

export const invitePreviewResponseSchema = z.object({
  email: z.string(),
  orgName: z.string(),
  role: roleSchema,
  inviterName: z.string(),
  acceptMode: acceptModeSchema,
});
export type InvitePreviewResponse = z.infer<typeof invitePreviewResponseSchema>;

// name/password ОБЯЗАТЕЛЬНЫ только в ветке REGISTER (§3(a)) — Zod не знает об этом (нет доступа
// к БД на этапе валидации), сервис проверяет условно и бросает InviteAcceptRequiresProfileError.
export const acceptInviteSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  password: passwordSchema.optional(),
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;
// Успешный accept возвращает authResultSchema (auth.ts) — тот же конверт, что login/register:
// accept тоже проходит через AuthService.issueFor (§3).
