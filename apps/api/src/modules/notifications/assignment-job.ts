// notifications.md-паттерн (см. lead-created-job.ts): минимум для восстановления контекста (P3),
// EmailWorker рефетчит имя проекта/email назначенного свежими на старте обработки.
export interface AssignmentJobData {
  orgId: string;
  projectId: string;
  userId: string;
}

export const ASSIGNMENT_JOB = "project.assigned";
