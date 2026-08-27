// Одноразовый payload на регистрацию — email/name снапшотятся на момент enqueue (тот же приём,
// что OrgInviteJobData/PasswordResetJobData): реюз одноразовый, устаревания не грозит.
export interface WelcomeJobData {
  email: string;
  name: string;
}

export const WELCOME_JOB = "user.welcome";
