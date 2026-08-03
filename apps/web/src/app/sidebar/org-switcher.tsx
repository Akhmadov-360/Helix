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

// FR-ORG-2 — единственный элемент в header сайдбара (редизайн этап 3): не отдельная строка
// "Helix" + отдельный WorkspaceSwitcher под ней, а один триггер "Helix / <орга>" — воркспейсы
// переехали в collapsible-секцию тела сайдбара (workspaces-section.tsx).
//
// side="right" — меню всплывает сбоку от триггера (не вниз), с отдельной side-popout анимацией
// (ui-pop-anim-side, globals.css) вместо стандартного fade+scale сверху вниз.
//
// Без "Создать оргу" в меню — намеренно: API не поддерживает создание орги пользователем
// (регистрация заводит ровно одну персональную оргу), пункт был бы мёртвым CTA.
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
          className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium text-sidebar-foreground transition-colors duration-150 hover:bg-sidebar-accent active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
        >
          <span className="truncate">
            <span className="text-sidebar-foreground/40">Helix / </span>
            {current?.name ?? t("sidebar.org.label")}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="start" className="ui-pop-anim-side w-56">
        <DropdownMenuLabel>{t("sidebar.org.switch")}</DropdownMenuLabel>
        {orgs.map((org) => (
          <DropdownMenuItem
            key={org.orgId}
            onSelect={() => org.orgId !== activeOrgId && switchOrg.mutate({ orgId: org.orgId })}
          >
            <span className="flex-1 truncate">{org.name}</span>
            {org.orgId === activeOrgId && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
