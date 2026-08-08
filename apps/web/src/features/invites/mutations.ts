import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { authResultSchema, type AcceptInviteInput } from "@helix/api-schemas";
import { request, setAccessToken, TransportError } from "../../shared/api";
import { clearLastWorkspaceId } from "../../shared/lib/last-workspace";

// invites.md §3: accept сразу логинит принявшего (issueFor на бэке) — тот же приём, что
// register-form.tsx/login-form.tsx: clearLastWorkspaceId (смена личности, чужой хинт не нужен),
// setAccessToken, редирект на "/". Работает одинаково для обеих веток (REGISTER/ACCEPT).
export function useAcceptInvite(token: string) {
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (input: AcceptInviteInput) =>
      request({ method: "POST", path: `/v1/invites/${token}/accept`, body: input, schema: authResultSchema }),
    onSuccess: (result) => {
      clearLastWorkspaceId();
      setAccessToken(result.accessToken);
      void navigate({ to: "/" });
    },
  });
}

export function acceptInviteErrorKey(error: unknown): "invalidToken" | "requiresProfile" | "network" | "generic" {
  if (error instanceof TransportError) {
    if (error.kind === "unauthorized") return "invalidToken";
    if (error.kind === "validation" && error.code === "INVITE_ACCEPT_REQUIRES_PROFILE") return "requiresProfile";
    if (error.kind === "network") return "network";
  }
  return "generic";
}
