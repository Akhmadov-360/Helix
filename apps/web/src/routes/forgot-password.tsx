import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@helix/ui";
import { getAccessToken } from "../shared/api";
import { useT } from "../shared/i18n";
import { ForgotPasswordForm } from "../features/auth/forgot-password-form";

export const Route = createFileRoute("/forgot-password")({
  beforeLoad: () => {
    if (getAccessToken() !== null) throw redirect({ to: "/" });
  },
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const t = useT();
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t("forgotPassword.title")}</CardTitle>
          <CardDescription>{t("forgotPassword.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <ForgotPasswordForm />
          <p className="text-center text-sm text-muted-foreground">
            <Link to="/login" className="font-medium text-foreground underline underline-offset-4">
              {t("forgotPassword.backToLogin")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
