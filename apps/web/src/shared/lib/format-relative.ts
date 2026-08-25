// Общая для activity-view.tsx и version-history (pages) — оба показывают "N минут/часов/дней назад".
export function formatRelative(iso: string, formatter: Intl.RelativeTimeFormat): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60_000);
  if (Math.abs(diffMinutes) < 60) return formatter.format(diffMinutes, "minute");
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return formatter.format(diffHours, "hour");
  const diffDays = Math.round(diffHours / 24);
  return formatter.format(diffDays, "day");
}

// Только для activity-view.tsx — "23 дня назад" не читается так же легко, как конкретная дата.
// Относительное время — пока событие в пределах недели ("today"-ish контекст), дальше абсолютная
// дата+время: порог намеренно уже, чем у formatRelative (которая не имеет верхней границы) —
// не трогаем formatRelative и её остальных 5 потребителей (pages-list-view и др.), которым
// неограниченный relative-формат уже норм.
const ACTIVITY_ABSOLUTE_THRESHOLD_DAYS = 7;

export function formatActivityTimestamp(
  iso: string,
  relativeFormatter: Intl.RelativeTimeFormat,
  dateFormatter: Intl.DateTimeFormat,
): string {
  const diffDays = (Date.now() - new Date(iso).getTime()) / 86_400_000;
  if (diffDays < ACTIVITY_ABSOLUTE_THRESHOLD_DAYS) return formatRelative(iso, relativeFormatter);
  return dateFormatter.format(new Date(iso));
}
