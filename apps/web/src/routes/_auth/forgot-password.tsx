import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useT } from "../../shared/i18n";
import { ForgotPasswordForm } from "../../features/auth/forgot-password-form";

export const Route = createFileRoute("/_auth/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const t = useT();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("forgotPassword.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("forgotPassword.subtitle")}</p>
      </div>
      <ForgotPasswordForm />
      <Link
        to="/login"
        className="flex items-center gap-1.5 text-sm font-medium text-foreground underline-offset-4 hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {t("forgotPassword.backToLogin")}
      </Link>
    </div>
  );
}
