import { z } from "zod";
import { dealRoleSchema } from "./deal-roles";

// Привязка контакта к сделке (§3). roles — набор DealRole; пустой допустим («роль пока неизвестна»,
// §5.2). Дубли в наборе схлопываются (множество ролей, не список).
export const linkContactSchema = z.object({
  contactId: z.string().min(1),
  roles: z.array(dealRoleSchema).default([]),
});
export type LinkContactInput = z.infer<typeof linkContactSchema>;

// PATCH — ПОЛНАЯ замена набора ролей (не дельта). roles=[] → сбросить в «неизвестно» (§5.2, не ошибка).
export const updateLinkSchema = z.object({
  roles: z.array(dealRoleSchema),
});
export type UpdateLinkInput = z.infer<typeof updateLinkSchema>;

// Назначение co-worker (§ assignee). Пользователь — член орги (проверяется в сервисе → 400).
export const assignSchema = z.object({
  userId: z.string().min(1),
});
export type AssignInput = z.infer<typeof assignSchema>;

// Контакт в сделке + денорм для UI (name/email/companyName — без второго запроса). roles: DealRole[].
export const projectContactResponseSchema = z.object({
  contactId: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  companyName: z.string().optional(),
  roles: z.array(dealRoleSchema),
});
export type ProjectContactResponse = z.infer<typeof projectContactResponseSchema>;

// Assignee — co-worker сделки (§ assignee). Денорм имени для UI.
export const projectAssigneeResponseSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
});
export type ProjectAssigneeResponse = z.infer<typeof projectAssigneeResponseSchema>;
