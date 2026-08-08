// notifications.md §3 приём (P3): минимум для письма, без денормализации сверх нужного.
// email/name снимок на момент enqueue — реюз одноразовый и живёт час, устаревания не грозит,
// а лишний рефетч usera на обработке job ничего бы не выиграл (в отличие от lead.created,
// где owner/assignees МОГУТ смениться за время в очереди).
export interface PasswordResetJobData {
  email: string;
  name: string;
  token: string;
}

export const PASSWORD_RESET_JOB = "password.reset";
