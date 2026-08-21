import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { resetPasswordSchema, type ResetPasswordInput } from "@helix/api-schemas";
import { CircleCheck, Unlink } from "lucide-react";
import { z } from "zod";
import { Button, Label, PasswordInput, PasswordRequirementsList, PasswordStrengthMeter } from "@helix/ui";
import { request, TransportError } from "../../shared/api";
import { toast } from "sonner";
import { useT, type MessageKey } from "../../shared/i18n";
import { passwordRequirementsMet, passwordStrength } from "../../shared/lib/password-strength";
import { StatusCard } from "./status-card";

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useT();
  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, newPassword: "" },
  });

  const submit = useMutation({
    mutationFn: (input: ResetPasswordInput) =>
      request({ method: "POST", path: "/v1/auth/reset-password", body: input, schema: z.null() }),
    // network/generic — toast (перекрывающая проблема, форма остаётся на месте); invalidToken —
    // отдельный экран, не toast (пользователь не может исправить это на этой странице, только уйти
    // на forgot-password). Разделение живёт здесь, чтобы render-branch ниже совпал с ним.
    onError: (error) => {
      const key = resetPasswordErrorKey(error);
      if (key !== "resetPassword.error.invalidToken") toast.error(t(key));
    },
  });

  const newPassword = useWatch({ control: form.control, name: "newPassword" });
  const { errors } = form.formState;

  if (submit.isSuccess) return <ResetPasswordSuccess />;
  if (submit.isError && resetPasswordErrorKey(submit.error) === "resetPassword.error.invalidToken") {
    return <ResetPasswordInvalid />;
  }

  const strength = passwordStrength(newPassword);
  const requirementsMet = passwordRequirementsMet(newPassword);

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((values) => submit.mutate({ ...values, token }))}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="newPassword" required>{t("resetPassword.newPassword")}</Label>
        <PasswordInput
          id="newPassword"
          autoComplete="new-password"
          aria-invalid={errors.newPassword !== undefined}
          showLabel={t("auth.password.show")}
          hideLabel={t("auth.password.hide")}
          {...form.register("newPassword")}
        />
        {newPassword.length > 0 && (
          <PasswordRequirementsList
            requirements={[
              { key: "length", label: t("auth.password.requirement.length"), met: requirementsMet.length },
              { key: "case", label: t("auth.password.requirement.case"), met: requirementsMet.case },
              { key: "symbols", label: t("auth.password.requirement.symbols"), met: requirementsMet.symbols },
            ]}
          />
        )}
        {newPassword.length > 0 && strength !== 0 && (
          <PasswordStrengthMeter strength={strength} label={t(`auth.password.strength.${strength}`)} />
        )}
        {errors.newPassword && <p className="text-sm text-destructive">{errors.newPassword.message}</p>}
      </div>

      <Button type="submit" disabled={submit.isPending}>
        {submit.isPending ? t("resetPassword.submitting") : t("resetPassword.submit")}
      </Button>
    </form>
  );
}

function ResetPasswordSuccess() {
  const t = useT();
  return (
    <StatusCard
      tone="success"
      icon={CircleCheck}
      title={t("resetPassword.success.title")}
      description={t("resetPassword.success.description")}
    >
      <PrimaryLink to="/login" label={t("resetPassword.success.signIn")} />
    </StatusCard>
  );
}

function ResetPasswordInvalid() {
  const t = useT();
  return (
    <StatusCard
      tone="error"
      icon={Unlink}
      title={t("resetPassword.invalid.title")}
      description={t("resetPassword.invalid.description")}
    >
      <PrimaryLink to="/forgot-password" label={t("resetPassword.invalid.requestNew")} />
    </StatusCard>
  );
}

// Ссылка, стилизованная как primary-кнопка. Отдельный компонент, потому что TanStack Router `<Link>`
// не поддерживает asChild-паттерн (Button asChild → Link) без Slot-обёртки — а сюда мы не тащим Radix
// Slot ради двух вызовов на этой странице. Классы захардкожены, чтобы совпадать с buttonVariants.default.
function PrimaryLink({ to, label }: { to: "/login" | "/forgot-password"; label: string }) {
  return (
    <Link
      to={to}
      className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {label}
    </Link>
  );
}

function resetPasswordErrorKey(error: unknown): MessageKey {
  if (error instanceof TransportError) {
    if (error.kind === "unauthorized") return "resetPassword.error.invalidToken";
    if (error.kind === "network") return "resetPassword.error.network";
  }
  return "resetPassword.error.generic";
}
