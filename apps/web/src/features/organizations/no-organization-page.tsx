import { useState } from "react";
import { Building2 } from "lucide-react";
import { Button } from "@helix/ui";
import { useAccount, useLogout } from "../../shared/auth/session";
import { useT } from "../../shared/i18n";
import { CreateOrganizationDialog } from "../settings/create-organization-dialog";

export function NoOrganizationPage() {
  const t = useT();
  const me = useAccount();
  const logout = useLogout();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-background p-4">
      <div className="flex w-full max-w-md flex-col gap-6">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Building2 className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{t("noOrg.title")}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">{t("noOrg.description")}</p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t("noOrg.inviteHint", { email: me.email })}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Button onClick={() => setCreateOpen(true)}>{t("noOrg.create")}</Button>
          <Button variant="ghost" onClick={() => logout.mutate()} disabled={logout.isPending}>
            {t("shell.logout")}
          </Button>
        </div>
      </div>
      <CreateOrganizationDialog open={createOpen} onOpenChange={setCreateOpen} />
    </main>
  );
}
