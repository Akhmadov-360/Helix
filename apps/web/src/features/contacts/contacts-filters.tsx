import { useState } from "react";
import { Briefcase, Building2, ListFilter } from "lucide-react";
import type { CompanyResponse } from "@helix/api-schemas";
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
import type { ContactsFilterState } from "./contacts-filter-state";

// Слот-чипы для DataTable.filterChips. Активное состояние отображается прямо в лейбле
// (Компании (3), Сделок ≥ 5) — юзер видит применённый фильтр не открывая popover.
// Тот же паттерн, что и MembersFilterChips: multi-select + min-numeric.
export function ContactsFilterChips({
  state,
  onChange,
  companies,
}: {
  state: ContactsFilterState;
  onChange: (next: ContactsFilterState) => void;
  companies: CompanyResponse[];
}) {
  const t = useT();

  return (
    <>
      {companies.length > 0 && (
        <CompanyChip
          companies={companies}
          selected={state.companies}
          onToggle={(companyId) => {
            const next = new Set(state.companies);
            if (next.has(companyId)) next.delete(companyId);
            else next.add(companyId);
            onChange({ ...state, companies: next });
          }}
          onClear={() => onChange({ ...state, companies: new Set() })}
        />
      )}
      <MinNumericChip
        icon={<ListFilter className="h-3.5 w-3.5" />}
        baseLabel={t("contacts.filter.deals")}
        formatActive={(n) => t("contacts.filter.dealsActive", { n: String(n) })}
        value={state.minDeals}
        onChange={(v) => onChange({ ...state, minDeals: v })}
      />
    </>
  );
}

function CompanyChip({
  companies,
  selected,
  onToggle,
  onClear,
}: {
  companies: CompanyResponse[];
  selected: Set<string>;
  onToggle: (companyId: string) => void;
  onClear: () => void;
}) {
  const t = useT();
  const active = selected.size > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant={active ? "secondary" : "outline"} size="sm">
          <Building2 className="h-3.5 w-3.5" />
          {t("contacts.filter.companies")}
          {active && <CountBadge value={selected.size} />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 max-h-72 overflow-y-auto">
        {companies.map((company) => (
          <DropdownMenuCheckboxItem
            key={company.id}
            checked={selected.has(company.id)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={() => onToggle(company.id)}
          >
            {company.name}
          </DropdownMenuCheckboxItem>
        ))}
        {active && (
          <div className="border-t border-border p-1 pt-2">
            <Button type="button" variant="ghost" size="sm" className="w-full justify-start" onClick={onClear}>
              {t("contacts.filter.clear")}
            </Button>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Тот же паттерн что MinNumericChip в members-filters: Popover (не Dropdown — внутри Input,
// Dropdown-item съел бы фокус), локальный draft (не спамим onChange на keypress), Enter/Apply.
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
          {active ? (
            <span className="inline-flex items-center gap-1.5">
              <Briefcase className="h-3.5 w-3.5" />
              {formatActive(value)}
            </span>
          ) : (
            baseLabel
          )}
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
            {t("contacts.filter.min")}
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
              {t("contacts.filter.clear")}
            </Button>
            <Button type="submit" size="sm">{t("contacts.filter.apply")}</Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
