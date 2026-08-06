import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@helix/ui";
import { getAccessToken } from "../shared/api";
import { useT } from "../shared/i18n";
import { ResetPasswordForm } from "../features/auth/reset-password-form";

export interface ResetPasswordSearch {
  token?: string;
}

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>): ResetPasswordSearch => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  beforeLoad: () => {
    if (getAccessToken() !== null) throw redirect({ to: "/" });
  },
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const t = useT();
  const { token } = Route.useSearch();

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t("resetPassword.title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {token ? (
            <ResetPasswordForm token={token} />
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-destructive">{t("resetPassword.error.missingToken")}</p>
              <Link
                to="/forgot-password"
                className="text-center text-sm font-medium text-foreground underline underline-offset-4"
              >
                {t("forgotPassword.title")}
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
