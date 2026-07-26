import { z } from "zod";
import type { Audience } from "./enums";

// Зеркало Prisma-enum DealRole (см. ADR «DealRole» в decisions.md). Порядок = порядок enum.
export const dealRoleSchema = z.enum([
  "CHAMPION",
  "DECISION_MAKER",
  "ECONOMIC_BUYER",
  "TECHNICAL_BUYER",
  "INFLUENCER",
  "BLOCKER",
]);
export type DealRole = z.infer<typeof dealRoleSchema>;

const ALL_ROLES = dealRoleSchema.options;

// B2C-лид — частное лицо/семья: роли комитета по закупке (ECONOMIC/TECHNICAL_BUYER) вырождаются.
const B2C_ROLES: readonly DealRole[] = ["CHAMPION", "DECISION_MAKER", "INFLUENCER", "BLOCKER"];

/**
 * RECOMMENDATION model, НЕ validation (project-links.md §4). Возвращает роли, УМЕСТНЫЕ для audience,
 * — для UI-подсказки. НИЧЕГО не отклоняет: любая роль ∈ enum допустима на любом audience (мягко).
 * Точка ужесточения готова: если методология станет строгой, 400 вешается на вызывающего, не сюда.
 */
export function validRolesFor(audience: Audience): readonly DealRole[] {
  return audience === "B2C" ? B2C_ROLES : ALL_ROLES; // B2B/MIXED — полный набор
}
