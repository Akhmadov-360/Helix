import { createFileRoute, redirect } from "@tanstack/react-router";
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
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </div>
  );
}
