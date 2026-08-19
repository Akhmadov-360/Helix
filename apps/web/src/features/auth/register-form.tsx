import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { authResultSchema, registerSchema, type RegisterInput } from "@helix/api-schemas";
import { Button, Input, Label, PasswordInput, PasswordRequirementsList, PasswordStrengthMeter } from "@helix/ui";
import { request, setAccessToken, TransportError } from "../../shared/api";
import { useT, type MessageKey } from "../../shared/i18n";
import { clearLastWorkspaceId } from "../../shared/lib/last-workspace";
import { passwordRequirementsMet, passwordStrength } from "../../shared/lib/password-strength";

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
  const password = useWatch({ control: form.control, name: "password" });
  const strength = passwordStrength(password);
  const requirementsMet = passwordRequirementsMet(password);

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((values) => register.mutate(values))}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="name" required>{t("register.name")}</Label>
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
        <Label htmlFor="email" required>{t("register.email")}</Label>
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
        <Label htmlFor="password" required>{t("register.password")}</Label>
        <PasswordInput
          id="password"
          autoComplete="new-password"
          aria-invalid={errors.password !== undefined}
          showLabel={t("auth.password.show")}
          hideLabel={t("auth.password.hide")}
          {...form.register("password")}
        />
        {password.length > 0 && (
          <PasswordRequirementsList
            requirements={[
              { key: "length", label: t("auth.password.requirement.length"), met: requirementsMet.length },
              { key: "case", label: t("auth.password.requirement.case"), met: requirementsMet.case },
              { key: "symbols", label: t("auth.password.requirement.symbols"), met: requirementsMet.symbols },
            ]}
          />
        )}
        {/* strength=0 (короче минимума) — чек-лист выше уже красным крестиком сообщает об этом,
            !== 0, не > 0 — TS сужает числовой union по равенству/неравенству, не по сравнению. */}
        {password.length > 0 && strength !== 0 && (
          <PasswordStrengthMeter strength={strength} label={t(`auth.password.strength.${strength}`)} />
        )}
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
