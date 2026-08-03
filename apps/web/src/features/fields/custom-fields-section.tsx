import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarIcon } from "lucide-react";
import type { FieldDefinitionResponse } from "@helix/api-schemas";
import {
  Badge,
  Calendar,
  Checkbox,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  cn,
} from "@helix/ui";
import { companiesListQueryOptions } from "../companies/queries";
import { contactsListQueryOptions } from "../contacts/queries";
import { orgMembersQueryOptions } from "../../shared/org/queries";
import { useLocaleStore, useT } from "../../shared/i18n";
import { useLocalize } from "../../shared/lib/localize";

const NO_VALUE = "__none__";

function toDatetimeLocal(iso: unknown): string {
  if (typeof iso !== "string") return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Значения custom-полей лида (custom-fields.md §4) — один контрол на тип, тот же набор типов,
// что бэкенд валидирует. definitions — упорядоченный список из FieldsController, values — сырой
// Project.fields (только затронутые ключи меняются через onChange).
export function CustomFieldsSection({
  orgId,
  definitions,
  values,
  onChange,
  disabled,
  errorKeys,
  className,
}: {
  orgId: string;
  definitions: FieldDefinitionResponse[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  disabled?: boolean;
  errorKeys?: ReadonlySet<string>;
  className?: string;
}) {
  if (definitions.length === 0) return null;

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {definitions.map((definition) => (
        <CustomFieldControl
          key={definition.id}
          orgId={orgId}
          definition={definition}
          value={values[definition.key]}
          onChange={(value) => onChange(definition.key, value)}
          disabled={disabled}
          error={errorKeys?.has(definition.key) ?? false}
        />
      ))}
    </div>
  );
}

function CustomFieldControl({
  orgId,
  definition,
  value,
  onChange,
  disabled,
  error,
}: {
  orgId: string;
  definition: FieldDefinitionResponse;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  error: boolean;
}) {
  const t = useT();
  const localize = useLocalize();
  const id = `custom-field-${definition.id}`;
  const errorClass = error ? "border-destructive focus-visible:ring-destructive" : "";

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} required={definition.required}>
        {localize(definition.label)}
      </Label>
      <FieldControlByType
        id={id}
        orgId={orgId}
        definition={definition}
        value={value}
        onChange={onChange}
        disabled={disabled}
        errorClass={errorClass}
      />
      {error && <p className="text-xs text-destructive">{t("fields.value.required")}</p>}
    </div>
  );
}

function FieldControlByType({
  id,
  orgId,
  definition,
  value,
  onChange,
  disabled,
  errorClass,
}: {
  id: string;
  orgId: string;
  definition: FieldDefinitionResponse;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  errorClass: string;
}) {
  const t = useT();

  switch (definition.type) {
    case "text":
    case "phone":
      return (
        <Input
          id={id}
          type={definition.type === "phone" ? "tel" : "text"}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || undefined)}
          disabled={disabled}
          className={errorClass}
        />
      );
    case "url":
      return (
        <Input
          id={id}
          type="url"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || undefined)}
          disabled={disabled}
          className={errorClass}
        />
      );
    case "email":
      return (
        <Input
          id={id}
          type="email"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || undefined)}
          disabled={disabled}
          className={errorClass}
        />
      );
    case "longtext":
      return (
        <Textarea
          id={id}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || undefined)}
          disabled={disabled}
          className={errorClass}
        />
      );
    case "number":
    case "currency":
      return (
        <Input
          id={id}
          type="number"
          value={typeof value === "number" ? value : ""}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
          disabled={disabled}
          className={errorClass}
        />
      );
    case "boolean":
      return (
        <div className="flex h-10 items-center">
          <Checkbox
            id={id}
            checked={value === true}
            onCheckedChange={(v) => onChange(v === true ? true : undefined)}
            disabled={disabled}
          />
        </div>
      );
    case "date":
      return <DateFieldControl id={id} value={value} onChange={onChange} disabled={disabled} errorClass={errorClass} />;
    case "datetime":
      return (
        <Input
          id={id}
          type="datetime-local"
          value={toDatetimeLocal(value)}
          onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : undefined)}
          disabled={disabled}
          className={errorClass}
        />
      );
    case "select":
      return (
        <Select value={typeof value === "string" ? value : NO_VALUE} onValueChange={(v) => onChange(v === NO_VALUE ? undefined : v)} disabled={disabled}>
          <SelectTrigger id={id} className={errorClass}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_VALUE}>{t("fields.value.notSet")}</SelectItem>
            {(definition.options ?? []).map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "multiselect":
      return <MultiselectControl definition={definition} value={value} onChange={onChange} disabled={disabled} />;
    case "contactRef":
      return <ContactRefControl id={id} orgId={orgId} value={value} onChange={onChange} disabled={disabled} errorClass={errorClass} />;
    case "companyRef":
      return <CompanyRefControl id={id} orgId={orgId} value={value} onChange={onChange} disabled={disabled} errorClass={errorClass} />;
    case "userRef":
      return <UserRefControl id={id} orgId={orgId} value={value} onChange={onChange} disabled={disabled} errorClass={errorClass} />;
    default: {
      const exhaustive: never = definition.type;
      return exhaustive;
    }
  }
}

function DateFieldControl({
  id,
  value,
  onChange,
  disabled,
  errorClass,
}: {
  id: string;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  errorClass: string;
}) {
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);
  const [open, setOpen] = useState(false);
  const date = typeof value === "string" && value ? new Date(value) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          className={cn(
            "flex h-10 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50",
            !date && "text-muted-foreground",
            errorClass,
          )}
        >
          <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
          {date ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date) : t("fields.value.pickDate")}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => {
            onChange(d ? d.toISOString().slice(0, 10) : undefined);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

// Короткие списки options (workspace-конфигурация, не тысячи значений) — toggle-чипы читаются
// быстрее, чем Popover+Checkbox-список, для типичного размера набора (design decision, §UX).
function MultiselectControl({
  definition,
  value,
  onChange,
  disabled,
}: {
  definition: FieldDefinitionResponse;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  const selected = Array.isArray(value) ? (value as string[]) : [];

  function toggle(option: string) {
    if (disabled) return;
    const next = selected.includes(option) ? selected.filter((o) => o !== option) : [...selected, option];
    onChange(next.length > 0 ? next : undefined);
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {(definition.options ?? []).map((option) => {
        const active = selected.includes(option);
        return (
          <button key={option} type="button" onClick={() => toggle(option)} disabled={disabled}>
            <Badge
              variant={active ? "success" : "outline"}
              className={cn("cursor-pointer transition-colors", disabled && "cursor-not-allowed opacity-50")}
            >
              {option}
            </Badge>
          </button>
        );
      })}
    </div>
  );
}

// contactRef/companyRef/userRef — простой Select из уже существующих org-скоупных списков (тот
// же паттерн, что owner-пикер в project-detail-shell.tsx); полноценный typeahead-поиск, как у
// ContactSearch, — не для custom-поля v1 (редкий тип, не золотим). Общая презентационная часть
// вынесена в RefSelect, каждый *RefControl лишь резолвит свой список — три конкретных хука
// вместо одного generic-компонента с `as never` (строгая типизация, CLAUDE.md).
function RefSelect({
  id,
  value,
  onChange,
  disabled,
  errorClass,
  options,
}: {
  id: string;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  errorClass: string;
  options: Array<{ id: string; name: string }>;
}) {
  const t = useT();
  return (
    <Select value={typeof value === "string" ? value : NO_VALUE} onValueChange={(v) => onChange(v === NO_VALUE ? undefined : v)} disabled={disabled}>
      <SelectTrigger id={id} className={errorClass}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_VALUE}>{t("fields.value.notSet")}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ContactRefControl(props: { id: string; orgId: string; value: unknown; onChange: (v: unknown) => void; disabled?: boolean; errorClass: string }) {
  const { data } = useQuery(contactsListQueryOptions(props.orgId));
  const options = (data?.contacts ?? []).map((c) => ({ id: c.id, name: c.name }));
  return <RefSelect {...props} options={options} />;
}

function CompanyRefControl(props: { id: string; orgId: string; value: unknown; onChange: (v: unknown) => void; disabled?: boolean; errorClass: string }) {
  const { data } = useQuery(companiesListQueryOptions(props.orgId));
  const options = (data?.companies ?? []).map((c) => ({ id: c.id, name: c.name }));
  return <RefSelect {...props} options={options} />;
}

function UserRefControl(props: { id: string; orgId: string; value: unknown; onChange: (v: unknown) => void; disabled?: boolean; errorClass: string }) {
  const { data } = useQuery(orgMembersQueryOptions(props.orgId));
  const options = (data ?? []).map((m) => ({ id: m.userId, name: m.name }));
  return <RefSelect {...props} options={options} />;
}
