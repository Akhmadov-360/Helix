import { createFileRoute } from "@tanstack/react-router";
import { useT } from "../../shared/i18n";
import { RegisterForm } from "../../features/auth/register-form";

export const Route = createFileRoute("/_auth/register")({
  component: RegisterPage,
});

function RegisterPage() {
  const t = useT();
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("register.title")}</h1>
      <RegisterForm />
    </div>
  );
}
