import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@helix/ui";
import { getAccessToken } from "../shared/api";
import { useT } from "../shared/i18n";
import { LoginForm } from "../features/auth/login-form";

export const Route = createFileRoute("/login")({
  // Уже вошли (access в памяти) → на страницу логина не пускаем. После reload токена нет
  // (он не персистится, auth.md §4), поэтому ложного редиректа не будет.
  beforeLoad: () => {
    if (getAccessToken() !== null) throw redirect({ to: "/" });
  },
  component: LoginPage,
});

function LoginPage() {
  const t = useT();
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t("login.title")}</CardTitle>
          <CardDescription>{t("login.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <LoginForm />
          <div className="flex flex-col gap-2 text-center text-sm text-muted-foreground">
            <Link to="/forgot-password" className="font-medium text-foreground underline underline-offset-4">
              {t("login.forgotPassword")}
            </Link>
            <p>
              {t("login.noAccount")}{" "}
              <Link to="/register" className="font-medium text-foreground underline underline-offset-4">
                {t("login.signUp")}
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
