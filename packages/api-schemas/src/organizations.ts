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
