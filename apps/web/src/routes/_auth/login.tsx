import { createFileRoute } from "@tanstack/react-router";
import { useT } from "../../shared/i18n";
import { LoginForm } from "../../features/auth/login-form";

export const Route = createFileRoute("/_auth/login")({
  component: LoginPage,
});

function LoginPage() {
  const t = useT();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("login.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("login.subtitle")}</p>
      </div>
      <LoginForm />
    </div>
  );
}
