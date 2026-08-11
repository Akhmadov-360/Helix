import type { Logger } from "@nestjs/common";
import { z } from "zod";

// pages-kb.md §3 — pageTemplates/kbSeed хранятся как z.array(z.unknown()) в BlueprintDefinition
// (blueprints.md §0: "валидны, НЕ реализованы" на момент сохранения блюпринта). Инстанцирование —
// первое место, где форма элемента реально важна, поэтому парсим defensively здесь, а не ужесточаем
// blueprintDefinitionSchema (это сломало бы уже сохранённые блюпринты со старым/произвольным JSON).
const templateItemSchema = z.object({
  title: z.string().min(1),
  contentJson: z.record(z.string(), z.unknown()).optional(),
});
export type TemplateItem = z.infer<typeof templateItemSchema>;

/**
 * §3 — невалидный элемент не блокирует создание воркспейса/проекта (тот же принцип, что
 * notificationDefaults в notifications.md §4): логируем и пропускаем, откатывать транзакцию ради
 * второстепенного контента не оправдано.
 */
export function parseTemplateItems(raw: unknown[] | undefined, logger: Logger, context: string): TemplateItem[] {
  if (!raw || raw.length === 0) return [];

  const items: TemplateItem[] = [];
  for (const item of raw) {
    const parsed = templateItemSchema.safeParse(item);
    if (parsed.success) {
      items.push(parsed.data);
    } else {
      logger.warn(`${context}: skipping invalid template item — ${parsed.error.message}`);
    }
  }
  return items;
}
