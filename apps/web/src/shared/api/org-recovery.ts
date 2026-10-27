import { apiErrorResponseSchema } from "@helix/api-schemas";
import { refreshAccessToken } from "./refresh";

const NOT_ORG_MEMBER_CODE = "NOT_ORG_MEMBER";
const THROTTLE_KEY = "helix:org-recovery-at";
const THROTTLE_MS = 10_000;

export async function isLostOrgResponse(res: Response): Promise<boolean> {
  if (res.status !== 403) return false;
  const json: unknown = await res.clone().json().catch(() => undefined);
  const parsed = apiErrorResponseSchema.safeParse(json);
  return parsed.success && parsed.data.error.code === NOT_ORG_MEMBER_CODE;
}

function recoveredRecently(): boolean {
  try {
    return Date.now() - Number(sessionStorage.getItem(THROTTLE_KEY)) < THROTTLE_MS;
  } catch {
    return false;
  }
}

function markRecovered(): void {
  try {
    sessionStorage.setItem(THROTTLE_KEY, String(Date.now()));
  } catch {
    // sessionStorage недоступен — защита от цикла перезагрузок просто не сработает.
  }
}

export async function recoverFromLostOrg(): Promise<boolean> {
  if (recoveredRecently()) return false;
  markRecovered();
  await refreshAccessToken();
  window.location.assign("/");
  return true;
}
