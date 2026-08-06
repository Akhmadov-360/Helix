// notifications.md §4: Workspace.settings.notifications.newLead — узкий известный путь в Json,
// typed-контракт не заводим (только Blueprints, этап 3, когда-нибудь пишут в это поле). Читаем
// защитно: любая форма, кроме ожидаемой, → жёсткий дефолт, не бросаем.
export interface NewLeadNotificationConfig {
  email: boolean;
  recipients: ("owner" | "assignees")[];
}

const DEFAULT_CONFIG: NewLeadNotificationConfig = { email: true, recipients: ["owner", "assignees"] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readNewLeadConfig(settings: unknown): NewLeadNotificationConfig {
  const notifications = isRecord(settings) ? settings.notifications : undefined;
  const newLead = isRecord(notifications) ? notifications.newLead : undefined;
  if (!isRecord(newLead)) return DEFAULT_CONFIG;

  const email = typeof newLead.email === "boolean" ? newLead.email : DEFAULT_CONFIG.email;
  const recipients = Array.isArray(newLead.recipients)
    ? newLead.recipients.filter((r): r is "owner" | "assignees" => r === "owner" || r === "assignees")
    : DEFAULT_CONFIG.recipients;
  return { email, recipients };
}

/**
 * §4. Возвращает `null`, если письма явно выключены блюпринтом — не отправлять, НЕ логировать
 * как ошибку (осознанная тишина воркспейса). Возвращает `[]`, если письма включены, но получателей
 * не набралось (owner явно обнулён reassign'ом, assignees пусты) — EmailWorker логирует `info`,
 * тоже не отправляет, но это другое, более редкое состояние («лид в пуле»), не то же самое молчание.
 */
export function resolveLeadCreatedRecipients(
  settings: unknown,
  ownerEmail: string | null,
  assigneeEmails: string[],
): string[] | null {
  const config = readNewLeadConfig(settings);
  if (!config.email) return null;

  const emails = [
    ...(config.recipients.includes("owner") && ownerEmail ? [ownerEmail] : []),
    ...(config.recipients.includes("assignees") ? assigneeEmails : []),
  ];
  return [...new Set(emails)];
}
