import { createFileRoute, Link } from "@tanstack/react-router";
import { useT } from "../../shared/i18n";
import { ResetPasswordForm } from "../../features/auth/reset-password-form";

export interface ResetPasswordSearch {
  token?: string;
}

export const Route = createFileRoute("/_auth/reset-password")({
  validateSearch: (search: Record<string, unknown>): ResetPasswordSearch => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const t = useT();
  const { token } = Route.useSearch();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("resetPassword.title")}</h1>
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-destructive">{t("resetPassword.error.missingToken")}</p>
          <Link
            to="/forgot-password"
            className="text-sm font-medium text-foreground underline underline-offset-4"
          >
            {t("forgotPassword.title")}
          </Link>
        </div>
      )}
    </div>
  );
}
