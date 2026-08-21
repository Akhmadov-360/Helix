import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@helix/api-schemas";
import { useEffect, useState } from "react";
import { MailCheck } from "lucide-react";
import { z } from "zod";
import { Button, Input, Label } from "@helix/ui";
import { request } from "../../shared/api";
import { useT } from "../../shared/i18n";
import { StatusCard } from "./status-card";

const RESEND_COOLDOWN_SECONDS = 30;

export function ForgotPasswordForm() {
  const t = useT();
  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const submit = useMutation({
    mutationFn: (input: ForgotPasswordInput) =>
      request({ method: "POST", path: "/v1/auth/forgot-password", body: input, schema: z.null() }),
  });

  // Ответ ВСЕГДА успешен независимо от того, существует ли email (PasswordResetService,
  // не оракул существования аккаунта) — success-карточка показывает одну и ту же формулировку
  // «if an account exists» на любой ввод.
  if (submit.isSuccess) {
    return (
      <ForgotPasswordSuccess
        email={form.getValues("email")}
        onResend={() => submit.mutate({ email: form.getValues("email") })}
        resending={submit.isPending}
      />
    );
  }

  const { errors } = form.formState;

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((values) => submit.mutate(values))}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="email" required>{t("forgotPassword.email")}</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          aria-invalid={errors.email !== undefined}
          {...form.register("email")}
        />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>

      <Button type="submit" disabled={submit.isPending}>
        {submit.isPending ? t("forgotPassword.submitting") : t("forgotPassword.submit")}
      </Button>
    </form>
  );
}

function ForgotPasswordSuccess({
  email,
  onResend,
  resending,
}: {
  email: string;
  onResend: () => void;
  resending: boolean;
}) {
  const t = useT();
  const [seconds, setSeconds] = useState(RESEND_COOLDOWN_SECONDS);

  // Обратный отсчёт до разблокировки resend — единственный useEffect в форме, cleanup обязателен
  // (react-strict-mode двойной mount развалит счётчик без него).
  useEffect(() => {
    if (seconds <= 0) return;
    const id = window.setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => window.clearInterval(id);
  }, [seconds]);

  const canResend = seconds === 0 && !resending;

  return (
    <StatusCard
      tone="success"
      icon={MailCheck}
      title={t("forgotPassword.success.title")}
      description={
        <>
          {t("forgotPassword.success.description.prefix")}{" "}
          <span className="font-medium text-foreground">{email}</span>
          {t("forgotPassword.success.description.suffix")}
        </>
      }
    >
      <Button
        type="button"
        variant="outline"
        disabled={!canResend}
        onClick={() => {
          onResend();
          setSeconds(RESEND_COOLDOWN_SECONDS);
        }}
      >
        {resending
          ? t("forgotPassword.submitting")
          : seconds > 0
            ? t("forgotPassword.success.resendIn", { seconds: String(seconds) })
            : t("forgotPassword.success.resend")}
      </Button>
    </StatusCard>
  );
}
