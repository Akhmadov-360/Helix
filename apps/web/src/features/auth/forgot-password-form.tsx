import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@helix/api-schemas";
import { z } from "zod";
import { Button, Input, Label } from "@helix/ui";
import { request } from "../../shared/api";
import { useT } from "../../shared/i18n";

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
  // не оракул существования аккаунта) — форма показывает одно и то же сообщение на любой ввод.
  if (submit.isSuccess) {
    return <p className="text-sm text-muted-foreground">{t("forgotPassword.success")}</p>;
  }

  const { errors } = form.formState;

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((values) => submit.mutate(values))}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">{t("forgotPassword.email")}</Label>
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
