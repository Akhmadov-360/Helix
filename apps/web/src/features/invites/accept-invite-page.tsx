import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CircleAlert } from "lucide-react";
import { z } from "zod";
import type { InvitePreviewResponse } from "@helix/api-schemas";
import { passwordSchema } from "@helix/api-schemas";
import { Avatar, Button, Input, Label, PasswordInput, RoleBadge } from "@helix/ui";
import { BrandLogo } from "../../app/brand/logo";
import { StatusCard } from "../auth/status-card";
import { useT } from "../../shared/i18n";
import { ThemeToggle } from "../../shared/theme";
import { acceptInviteErrorKey, useAcceptInvite } from "./mutations";
import { invitePreviewQueryOptions } from "./queries";

// Отдельный, не под `_auth` (§ решение): его pathless-layout редиректит уже вошедших на "/" в
// beforeLoad — сломало бы ветку ACCEPT для юзера, принимающего инвайт во ВТОРУЮ оргу, уже будучи
// залогиненным в первую. Своя лёгкая карточка вместо split-screen шелла — одноразовая страница,
// не часть основного auth-флоу, не стоит расширять _auth ради одного нового потребителя.
export function AcceptInvitePage({ token }: { token: string }) {
  const t = useT();
  const preview = useQuery(invitePreviewQueryOptions(token));

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-4 sm:p-6">
      <div className="flex w-full max-w-md flex-col gap-6 rounded-3xl bg-card p-8 shadow-2xl sm:p-10">
        <div className="flex items-center justify-between">
          <BrandLogo />
          <ThemeToggle />
        </div>
        {preview.isPending ? (
          <p className="text-sm text-muted-foreground">{t("inviteAccept.loading")}</p>
        ) : preview.isError ? (
          <InvalidInvite />
        ) : (
          <AcceptInviteContent token={token} preview={preview.data} />
        )}
      </div>
    </div>
  );
}

function InvalidInvite() {
  const t = useT();
  return (
    <StatusCard
      tone="error"
      icon={CircleAlert}
      title={t("inviteAccept.invalid.title")}
      description={t("inviteAccept.invalid.description")}
    >
      <Link
        to="/login"
        className="inline-flex items-center justify-center text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        {t("inviteAccept.invalid.backHome")}
      </Link>
    </StatusCard>
  );
}

// Шапка приглашения (avatar + role badge + «X invited you to Y» heading) — общая для обеих
// веток REGISTER/ACCEPT. Делит визуальную ответственность с формой: header отвечает «кто и куда
// зовёт», форма отвечает «что делать» (создать аккаунт или подтвердить).
function InviteHeader({ preview }: { preview: InvitePreviewResponse }) {
  const t = useT();
  const firstName = preview.inviterName.trim().split(/\s+/)[0] ?? preview.inviterName;
  return (
    <div className="flex flex-col gap-4 border-b border-border pb-6">
      <div className="flex items-start justify-between gap-3">
        <Avatar name={preview.inviterName} size="lg" />
        <RoleBadge role={preview.role} label={t(`role.${preview.role}`)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t("inviteAccept.header.title", { inviterFirstName: firstName, orgName: preview.orgName })}
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("inviteAccept.header.subtitle.prefix")}{" "}
          <span className="font-medium text-foreground">{preview.email}</span>
          {t("inviteAccept.header.subtitle.suffix", { orgName: preview.orgName })}
        </p>
      </div>
    </div>
  );
}

function AcceptInviteContent({ token, preview }: { token: string; preview: InvitePreviewResponse }) {
  return (
    <div className="flex flex-col gap-6">
      <InviteHeader preview={preview} />
      {preview.acceptMode === "REGISTER" ? (
        <RegisterBranch token={token} />
      ) : (
        <AcceptBranch token={token} email={preview.email} />
      )}
    </div>
  );
}

const registerBranchSchema = z.object({
  name: z.string().trim().min(1).max(200),
  password: passwordSchema,
});
type RegisterBranchInput = z.infer<typeof registerBranchSchema>;

// invites.md §3(a): email без User — accept сам создаёт аккаунт, поэтому нужны имя+пароль.
function RegisterBranch({ token }: { token: string }) {
  const t = useT();
  const accept = useAcceptInvite(token);
  const form = useForm<RegisterBranchInput>({
    resolver: zodResolver(registerBranchSchema),
    defaultValues: { name: "", password: "" },
  });
  const { errors } = form.formState;
  const rootError = accept.isError ? t(`inviteAccept.error.${acceptInviteErrorKey(accept.error)}`) : null;

  return (
    <form noValidate onSubmit={form.handleSubmit((values) => accept.mutate(values))} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name" required>
          {t("inviteAccept.register.name")}
        </Label>
        <Input id="name" type="text" autoComplete="name" aria-invalid={errors.name !== undefined} {...form.register("name")} />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password" required>
          {t("inviteAccept.register.password")}
        </Label>
        <PasswordInput
          id="password"
          autoComplete="new-password"
          aria-invalid={errors.password !== undefined}
          showLabel={t("auth.password.show")}
          hideLabel={t("auth.password.hide")}
          {...form.register("password")}
        />
        {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
      </div>

      {rootError && (
        <p role="alert" className="text-sm text-destructive">
          {rootError}
        </p>
      )}

      <Button type="submit" disabled={accept.isPending}>
        {accept.isPending ? t("inviteAccept.register.submitting") : t("inviteAccept.register.submit")}
      </Button>
    </form>
  );
}

// invites.md §3(b): email уже User — без формы, владение токеном уже доказывает личность (§2).
function AcceptBranch({ token, email }: { token: string; email: string }) {
  const t = useT();
  const accept = useAcceptInvite(token);
  const rootError = accept.isError ? t(`inviteAccept.error.${acceptInviteErrorKey(accept.error)}`) : null;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("inviteAccept.accept.description", { email })}</p>
      {rootError && (
        <p role="alert" className="text-sm text-destructive">
          {rootError}
        </p>
      )}
      <Button type="button" onClick={() => accept.mutate({})} disabled={accept.isPending}>
        {accept.isPending ? t("inviteAccept.accept.submitting") : t("inviteAccept.accept.submit")}
      </Button>
    </div>
  );
}
