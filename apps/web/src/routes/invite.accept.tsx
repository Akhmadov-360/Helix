import { createFileRoute, Link } from "@tanstack/react-router";
import { AcceptInvitePage } from "../features/invites/accept-invite-page";
import { useT } from "../shared/i18n";

export interface AcceptInviteSearch {
  token?: string;
}

// НЕ под /_auth (см. accept-invite-page.tsx) — отдельный top-level роут, доступен независимо
// от auth-состояния. Query-param, не path-param: путь зашит в письме (org-invite-email.ts).
export const Route = createFileRoute("/invite/accept")({
  validateSearch: (search: Record<string, unknown>): AcceptInviteSearch => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  component: AcceptInviteRoute,
});

function AcceptInviteRoute() {
  const t = useT();
  const { token } = Route.useSearch();

  if (!token) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
        <div className="flex max-w-md flex-col gap-4">
          <p className="text-sm text-destructive">{t("inviteAccept.error.missingToken")}</p>
          <Link to="/login" className="text-sm font-medium text-foreground underline underline-offset-4">
            {t("login.title")}
          </Link>
        </div>
      </div>
    );
  }

  return <AcceptInvitePage token={token} />;
}
