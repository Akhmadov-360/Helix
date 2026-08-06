import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { authResultSchema, registerSchema, type RegisterInput } from "@helix/api-schemas";
import { Button, Input, Label } from "@helix/ui";
import { request, setAccessToken, TransportError } from "../../shared/api";
import { useT, type MessageKey } from "../../shared/i18n";
import { clearLastWorkspaceId } from "../../shared/lib/last-workspace";

export function RegisterForm() {
  const t = useT();
  const navigate = useNavigate();
  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", name: "", password: "" },
  });

  const register = useMutation({
    mutationFn: (input: RegisterInput) =>
      request({ method: "POST", path: "/v1/auth/register", body: input, schema: authResultSchema }),
    onSuccess: (result) => {
      // См. login-form.tsx: та же личность-смена, тот же риск чужого хинта.
      clearLastWorkspaceId();
      setAccessToken(result.accessToken);
      void navigate({ to: "/" });
    },
  });

  const { errors } = form.formState;
  const rootError = register.isError ? t(registerErrorKey(register.error)) : null;

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((values) => register.mutate(values))}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">{t("register.name")}</Label>
        <Input
          id="name"
          type="text"
          autoComplete="name"
          aria-invalid={errors.name !== undefined}
          {...form.register("name")}
        />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">{t("register.email")}</Label>
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
        <Label htmlFor="password">{t("register.password")}</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
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

      <Button type="submit" disabled={register.isPending}>
        {register.isPending ? t("register.submitting") : t("register.submit")}
      </Button>
    </form>
  );
}

// §6.4: 409 на регистрации значит занятый email (User.email @unique) — прямой домен-факт,
// а не общая "conflict"-заглушка, поэтому маппится в отдельный человекочитаемый ключ.
function registerErrorKey(error: unknown): MessageKey {
  if (error instanceof TransportError) {
    if (error.kind === "conflict") return "register.error.emailTaken";
    if (error.kind === "network") return "register.error.network";
  }
  return "register.error.generic";
}
