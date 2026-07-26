// Нормализаторы производных полей дедупа. Единственная точка канонизации — чтобы источник
// (email/domain) и его канон (emailNormalized/domainNormalized) не разъезжались (contacts.md §4.3).

// email → lower(trim). Консервативно (§4.2): НЕ трогаем точки/+tag — риск ложного слияния разных
// людей в CRM хуже, чем недостающий хинт. NULL/пустой → null (в дедуп-lookup не участвует).
export function normalizeEmail(email: string | null | undefined): string | null {
  if (email == null) return null;
  const v = email.trim().toLowerCase();
  return v === "" ? null : v;
}

// domain → lower, срезаем протокол/www/путь. Дедуп компаний придёт позже (§7.8), но поле —
// производное от domain, поэтому канонизируем при каждой записи (та же дисциплина, что у email).
export function normalizeDomain(domain: string | null | undefined): string | null {
  if (domain == null) return null;
  const v = domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
  return v === "" ? null : v;
}
