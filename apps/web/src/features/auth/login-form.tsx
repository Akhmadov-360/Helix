import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { authResultSchema, loginSchema, type LoginInput } from "@helix/api-schemas";
import { Button, Input, Label } from "@helix/ui";
import { request, setAccessToken, TransportError } from "../../shared/api";
import { useT, type MessageKey } from "../../shared/i18n";
import { clearLastWorkspaceId } from "../../shared/lib/last-workspace";

export function LoginForm() {
  const t = useT();
  const navigate = useNavigate();
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const login = useMutation({
    mutationFn: (input: LoginInput) =>
      request({ method: "POST", path: "/v1/auth/login", body: input, schema: authResultSchema }),
    onSuccess: (result) => {
      // Хинт мог остаться от ДРУГОЙ личности, если её сессия закончилась не через /logout
      // (закрыли вкладку) — иначе "/" слепо редиректнул бы на чужой воркспейс → 404 (last-workspace.ts).
      clearLastWorkspaceId();
      setAccessToken(result.accessToken);
      void navigate({ to: "/" });
    },
  });

  const { errors } = form.formState;
  const rootError = login.isError ? t(loginErrorKey(login.error)) : null;

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((values) => login.mutate(values))}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">{t("login.email")}</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          aria-invalid={errors.email !== undefined}
          {...form.register("email")}
        />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{t("login.password")}</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={errors.password !== undefined}
          {...form.register("password")}
        />
        {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
      </div>

      {rootError && (
        <p role="alert" className="text-sm text-destructive">
          {rootError}
        </p>
      )}

      <Button type="submit" disabled={login.isPending}>
        {login.isPending ? t("login.submitting") : t("login.submit")}
      </Button>
    </form>
  );
}

// Feature интерпретирует транспортный исход в доменный ключ (§6.4): на логине 401 = неверные креды.
function loginErrorKey(error: unknown): MessageKey {
  if (error instanceof TransportError) {
    if (error.kind === "unauthorized") return "login.error.invalidCredentials";
    if (error.kind === "network") return "login.error.network";
  }
  return "login.error.generic";
}
