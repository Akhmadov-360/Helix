import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@helix/ui";
import { getAccessToken } from "../shared/api";
import { useT } from "../shared/i18n";
import { RegisterForm } from "../features/auth/register-form";

export const Route = createFileRoute("/register")({
  beforeLoad: () => {
    if (getAccessToken() !== null) throw redirect({ to: "/" });
  },
  component: RegisterPage,
});

function RegisterPage() {
  const t = useT();
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t("register.title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <RegisterForm />
          <p className="text-center text-sm text-muted-foreground">
            {t("register.hasAccount")}{" "}
            <Link to="/login" className="font-medium text-foreground underline underline-offset-4">
              {t("register.signIn")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
