// notifications.md §3: минимум для восстановления контекста (P3) — НЕ денормализуем
// имена/email/HTML на момент enqueue. Job-обработчик рефетчит всё свежим на старте (§4).
export interface LeadCreatedJobData {
  orgId: string;
  projectId: string;
}

export const LEAD_CREATED_JOB = "lead.created";
