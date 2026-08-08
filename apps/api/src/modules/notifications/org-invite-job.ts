import type { Role } from "@helix/db";

// Тот же случай, что PasswordResetJobData (§9 invites.md): одноразовый payload, token — сырой,
// снапшот email/orgName/inviterName на момент enqueue (реюз одноразовый — устаревания не грозит).
export interface OrgInviteJobData {
  email: string;
  orgName: string;
  inviterName: string;
  role: Role;
  token: string;
}

export const ORG_INVITE_JOB = "org.invite";
