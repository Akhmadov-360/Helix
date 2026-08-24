import { useState } from "react";
import { Briefcase, Building2, ListFilter } from "lucide-react";
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
import type { CompaniesFilterState } from "./companies-filter-state";

// Слот-чипы для DataTable.filterChips (тот же паттерн, что MembersFilterChips / ContactsFilterChips).
export function CompaniesFilterChips({
  state,
  onChange,
  industries,
}: {
  state: CompaniesFilterState;
  onChange: (next: CompaniesFilterState) => void;
  industries: string[];
}) {
  const t = useT();

  return (
    <>
      {industries.length > 0 && (
        <IndustryChip
          options={industries}
          selected={state.industries}
          onToggle={(industry) => {
            const next = new Set(state.industries);
            if (next.has(industry)) next.delete(industry);
            else next.add(industry);
            onChange({ ...state, industries: next });
          }}
          onClear={() => onChange({ ...state, industries: new Set() })}
        />
      )}
      <MinNumericChip
        icon={<ListFilter className="h-3.5 w-3.5" />}
        baseLabel={t("companies.filter.deals")}
        formatActive={(n) => t("companies.filter.dealsActive", { n: String(n) })}
        value={state.minDeals}
        onChange={(v) => onChange({ ...state, minDeals: v })}
      />
    </>
  );
}

function IndustryChip({
  options,
  selected,
  onToggle,
  onClear,
}: {
  options: string[];
  selected: Set<string>;
  onToggle: (industry: string) => void;
  onClear: () => void;
}) {
  const t = useT();
  const active = selected.size > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant={active ? "secondary" : "outline"} size="sm">
          <Building2 className="h-3.5 w-3.5" />
          {t("companies.filter.industries")}
          {active && <CountBadge value={selected.size} />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 max-h-72 overflow-y-auto">
        {options.map((industry) => (
          <DropdownMenuCheckboxItem
            key={industry}
            checked={selected.has(industry)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={() => onToggle(industry)}
          >
            {industry}
          </DropdownMenuCheckboxItem>
        ))}
        {active && (
          <div className="border-t border-border p-1 pt-2">
            <Button type="button" variant="ghost" size="sm" className="w-full justify-start" onClick={onClear}>
              {t("companies.filter.clear")}
            </Button>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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
            {t("companies.filter.min")}
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
              {t("companies.filter.clear")}
            </Button>
            <Button type="submit" size="sm">{t("companies.filter.apply")}</Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
