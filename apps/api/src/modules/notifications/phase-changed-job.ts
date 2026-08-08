// Ссылки по id (P1), не по имени фазы — имя переведётся/переименуется до того, как job обработается,
// EmailWorker резолвит актуальное название под именно эти id на старте обработки (см. lead-created-job.ts).
export interface PhaseChangedJobData {
  orgId: string;
  projectId: string;
  actorId: string;
  fromPhaseId: string;
  toPhaseId: string;
}

export const PHASE_CHANGED_JOB = "project.phase_changed";
