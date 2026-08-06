import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { resetPasswordSchema, type ResetPasswordInput } from "@helix/api-schemas";
import { z } from "zod";
import { Button, Input, Label } from "@helix/ui";
import { request, TransportError } from "../../shared/api";
import { toast } from "sonner";
import { useT, type MessageKey } from "../../shared/i18n";

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useT();
  const navigate = useNavigate();
  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, newPassword: "" },
  });

  const submit = useMutation({
    mutationFn: (input: ResetPasswordInput) =>
      request({ method: "POST", path: "/v1/auth/reset-password", body: input, schema: z.null() }),
    onSuccess: () => {
      toast.success(t("resetPassword.success"));
      void navigate({ to: "/login" });
    },
    onError: (error) => toast.error(t(resetPasswordErrorKey(error))),
  });

  const { errors } = form.formState;

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((values) => submit.mutate({ ...values, token }))}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="newPassword">{t("resetPassword.newPassword")}</Label>
        <Input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          aria-invalid={errors.newPassword !== undefined}
          {...form.register("newPassword")}
        />
        {errors.newPassword && <p className="text-sm text-destructive">{errors.newPassword.message}</p>}
      </div>

      <Button type="submit" disabled={submit.isPending}>
        {submit.isPending ? t("resetPassword.submitting") : t("resetPassword.submit")}
      </Button>
    </form>
  );
}

function resetPasswordErrorKey(error: unknown): MessageKey {
  if (error instanceof TransportError) {
    if (error.kind === "unauthorized") return "resetPassword.error.invalidToken";
    if (error.kind === "network") return "resetPassword.error.network";
  }
  return "resetPassword.error.generic";
}
