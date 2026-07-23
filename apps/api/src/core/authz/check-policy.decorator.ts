import { SetMetadata } from "@nestjs/common";
import type { AppAction, AppSubject } from "./app-ability";

export const CHECK_POLICY_KEY = "helix:check_policy";

export interface RequiredPolicy {
  action: AppAction;
  subject: AppSubject;
}

/** Требует, чтобы роль позволяла (action, subject). Проверяет PoliciesGuard. */
export const CheckPolicy = (action: AppAction, subject: AppSubject) =>
  SetMetadata(CHECK_POLICY_KEY, { action, subject } satisfies RequiredPolicy);
