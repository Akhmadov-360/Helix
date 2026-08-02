import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@helix/ui";
import { useT } from "../../shared/i18n";
import { useSwitchOrg } from "../../shared/org/mutations";
import { myOrgsQueryOptions } from "../../shared/org/queries";

// FR-ORG-2 — тот же приём, что WorkspaceSwitcher (компактный dropdown-триггер над списком
// сайдбара), но уровнем выше: орга, не воркспейс внутри неё. useQuery (не useSuspenseQuery) — как
// WorkspaceSwitcher: список орг не блокирует первый рендер сайдбара, пока грузится.
export function OrgSwitcher({ activeOrgId }: { activeOrgId: string }) {
  const t = useT();
  const orgs = useQuery(myOrgsQueryOptions()).data ?? [];
  const current = orgs.find((o) => o.orgId === activeOrgId);
  const switchOrg = useSwitchOrg();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={switchOrg.isPending}
          className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
        >
          <span className="truncate">{current?.name ?? t("sidebar.org.label")}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>{t("sidebar.org.switch")}</DropdownMenuLabel>
        {orgs.map((org) => (
          <DropdownMenuItem
            key={org.orgId}
            onSelect={() => org.orgId !== activeOrgId && switchOrg.mutate({ orgId: org.orgId })}
          >
            <span className="flex-1 truncate">{org.name}</span>
            {org.orgId === activeOrgId && <Check className="h-3.5 w-3.5 shrink-0" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
