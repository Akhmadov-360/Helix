export const REFRESH_SESSION_CLEANUP_JOB = "refresh-session.cleanup";

// jobId фиксирован — тот же repeatable job при каждом рестарте приложения, BullMQ не плодит дубликат
// по (name, repeat-options, jobId). Cron: раз в сутки в 03:00 — вне пиковых часов.
export const REFRESH_SESSION_CLEANUP_REPEAT_OPTIONS = { pattern: "0 3 * * *" };

// ADR (refresh-session-retention, 2026-08-08): RefreshSession retention — operational, не
// forensic. Раньше 30 дней объяснялись «окном на инцидент-анализ REUSE», но это смешивало две
// разные политики хранения в одной таблице — та, что растёт на КАЖДУЮ ротацию токена (при 15-мин
// access TTL это ~96 строк/день на активного юзера), удерживалась месяц ради событий, которые
// на самом деле редкие. Теперь REUSE-инцидент атомарно уходит в AuditLog (RefreshSessionService
// .recordReuse — своя, куда более долгая политика хранения), а сама RefreshSession-строка нужна
// только на support/on-call разбор в первые дни после смерти.
export const REFRESH_SESSION_RETENTION_DAYS = 3;

// EXPLAIN (ANALYZE, BUFFERS) на 500k синтетических строк (2026-08-08, см. коммит-сообщение) —
// НЕ индекс: предикат cleanup матчит бОльшую часть таблицы (мёртвые строки — это норма, не
// исключение), поэтому planner закономерно игнорирует partial-индексы на usedAt/revokedAt (seq
// scan честно дешевле при такой селективности — измерено, не предположено). Реальный риск на
// масштабе — ОДНА транзакция на сотни тысяч/миллионы строк (лок и WAL burst), не выбор скана.
// Батч по BATCH_SIZE via findMany+deleteMany(id in) — тот же общий объём работы, но каждая
// транзакция короткая (замер: ~15мс/10k против ~466мс на 444k одним deleteMany).
export const REFRESH_SESSION_CLEANUP_BATCH_SIZE = 5000;
