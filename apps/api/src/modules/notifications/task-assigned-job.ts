// notifications-паттерн (см. assignment-job.ts / mention-job.ts): минимум для восстановления
// контекста (P3), EmailWorker рефетчит имя таска/проекта/email назначенного свежими на старте.
// task-assigned ≠ project.assigned: тот про со-исполнителей всей сделки (см. AssignmentJobData),
// этот про исполнителя КОНКРЕТНОЙ задачи в чеклисте.
export interface TaskAssignedJobData {
  orgId: string;
  taskId: string;
  assigneeId: string;
  /** actorId нужен только для «X назначил вас на …» в шаблоне; null возможен если инициатор
   *  удалён между enqueue и обработкой — тогда generic-fallback («You were assigned a task»). */
  actorId: string | null;
}

export const TASK_ASSIGNED_JOB = "task.assigned";
