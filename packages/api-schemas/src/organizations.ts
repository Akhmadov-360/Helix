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
