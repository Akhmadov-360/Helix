import { useState } from "react";
import { ListFilter, Users } from "lucide-react";
import type { Role } from "@helix/api-schemas";
import {
  Button,
  CountBadge,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@helix/ui";
import { useT } from "../../shared/i18n";
import type { MembersFilterState } from "./members-filter-state";

const ROLES: Role[] = ["OWNER", "ADMIN", "MANAGER", "MEMBER", "VIEWER"];

// Триггеры-чипы для DataTable.filterChips слота. Каждый чип показывает своё active-состояние
// в лейбле (Роль (2), Лиды ≥ 5) — юзер видит фильтр не открывая popover.
export function MembersFilterChips({
  state,
  onChange,
}: {
  state: MembersFilterState;
  onChange: (next: MembersFilterState) => void;
}) {
  const t = useT();

  return (
    <>
      <RoleChip
        selected={state.roles}
        onToggle={(role) => {
          const next = new Set(state.roles);
          if (next.has(role)) next.delete(role);
          else next.add(role);
          onChange({ ...state, roles: next });
        }}
        onClear={() => onChange({ ...state, roles: new Set() })}
      />
      <MinNumericChip
        icon={<ListFilter className="h-3.5 w-3.5" />}
        baseLabel={t("settings.members.filter.leads")}
        formatActive={(n) => t("settings.members.filter.leadsActive", { n: String(n) })}
        value={state.minLeads}
        onChange={(v) => onChange({ ...state, minLeads: v })}
      />
      <MinNumericChip
        icon={<ListFilter className="h-3.5 w-3.5" />}
        baseLabel={t("settings.members.filter.tasks")}
        formatActive={(n) => t("settings.members.filter.tasksActive", { n: String(n) })}
        value={state.minTasks}
        onChange={(v) => onChange({ ...state, minTasks: v })}
      />
    </>
  );
}

function RoleChip({
  selected,
  onToggle,
  onClear,
}: {
  selected: Set<Role>;
  onToggle: (role: Role) => void;
  onClear: () => void;
}) {
  const t = useT();
  const active = selected.size > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant={active ? "secondary" : "outline"} size="sm">
          <Users className="h-3.5 w-3.5" />
          {t("settings.members.filter.roles")}
          {active && <CountBadge value={selected.size} />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {ROLES.map((role) => (
          <DropdownMenuCheckboxItem
            key={role}
            checked={selected.has(role)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={() => onToggle(role)}
          >
            {t(`role.${role}`)}
          </DropdownMenuCheckboxItem>
        ))}
        {active && (
          <div className="border-t border-border p-1 pt-2">
            <Button type="button" variant="ghost" size="sm" className="w-full justify-start" onClick={onClear}>
              {t("settings.members.filter.clear")}
            </Button>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Численный фильтр «≥ N». Popover, не Dropdown — внутри Input, а Dropdown-item съел бы фокус
// и enter-submit. Локальное состояние поля (draft) — чтобы юзер мог набрать число не спамя
// applyM'ом на каждый keydown, применение по Enter/Apply-кнопке.
function MinNumericChip({
  icon,
  baseLabel,
  formatActive,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  baseLabel: string;
  formatActive: (n: number) => string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState<string>(value !== null ? String(value) : "");
  const [open, setOpen] = useState(false);
  const active = value !== null;

  function apply() {
    const parsed = draft.trim() === "" ? null : Number(draft);
    if (parsed !== null && (Number.isNaN(parsed) || parsed < 0)) return;
    onChange(parsed);
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setDraft(value !== null ? String(value) : "");
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant={active ? "secondary" : "outline"} size="sm">
          {icon}
          {active ? formatActive(value) : baseLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3">
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
        >
          <label className="text-xs font-medium text-muted-foreground">
            {t("settings.members.filter.min")}
          </label>
          <Input
            type="number"
            min={0}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            className="h-9"
          />
          <div className="mt-1 flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!active}
              onClick={() => {
                setDraft("");
                onChange(null);
                setOpen(false);
              }}
            >
              {t("settings.members.filter.clear")}
            </Button>
            <Button type="submit" size="sm">{t("settings.members.filter.apply")}</Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
