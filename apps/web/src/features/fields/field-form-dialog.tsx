import { useState } from "react";
import { Plus, X } from "lucide-react";
import {
  isCompatibleFieldTypeChange,
  type FieldDefinitionResponse,
  type FieldType,
  type Locale,
} from "@helix/api-schemas";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@helix/ui";
import { useLocaleStore, useT } from "../../shared/i18n";
import { FIELD_TYPE_GROUPS, FIELD_TYPE_ICON, fieldTypeLabelKey } from "./field-type-meta";
import { useCreateField, useUpdateField } from "./mutations";

const OPTIONS_TYPES = new Set<FieldType>(["select", "multiselect"]);

export function FieldFormDialog({
  orgId,
  workspaceId,
  field,
  open,
  onOpenChange,
}: {
  orgId: string;
  workspaceId: string;
  field: FieldDefinitionResponse | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{field ? t("fields.edit.title") : t("fields.create.title")}</DialogTitle>
        </DialogHeader>
        {/* key на field.id — реинициализирует локальный стейт формы при смене цели/режима,
            тот же приём, что PhaseFormDialog. */}
        {open && (
          <FieldFormFields
            key={field?.id ?? "create"}
            orgId={orgId}
            workspaceId={workspaceId}
            field={field}
            onDone={() => onOpenChange(false)}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function FieldFormFields({
  orgId,
  workspaceId,
  field,
  onDone,
  onCancel,
}: {
  orgId: string;
  workspaceId: string;
  field: FieldDefinitionResponse | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);
  const create = useCreateField(orgId, workspaceId);
  const update = useUpdateField(orgId, workspaceId);
  const pending = create.isPending || update.isPending;

  const [label, setLabel] = useState(() => (field ? (field.label[locale as Locale] ?? "") : ""));
  const [type, setType] = useState<FieldType>(field?.type ?? "text");
  const [options, setOptions] = useState<string[]>(() => field?.options ?? []);
  const [required, setRequired] = useState(field?.required ?? false);

  const needsOptions = OPTIONS_TYPES.has(type);
  const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
  const canSubmit = label.trim().length > 0 && (!needsOptions || cleanOptions.length > 0);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    const shared = {
      type,
      options: needsOptions ? cleanOptions : undefined,
      required,
    };

    if (field) {
      update.mutate(
        { fieldId: field.id, input: { ...shared, label: { ...field.label, [locale]: label.trim() } } },
        { onSuccess: onDone },
      );
    } else {
      create.mutate({ ...shared, label: { [locale]: label.trim() } }, { onSuccess: onDone });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="field-label" required>{t("fields.form.label")}</Label>
        <Input
          id="field-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          disabled={pending}
          autoFocus
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="field-type">{t("fields.form.type")}</Label>
        <Select value={type} onValueChange={(v) => setType(v as FieldType)} disabled={pending}>
          <SelectTrigger id="field-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FIELD_TYPE_GROUPS.flatMap((group) => group.types).map((option) => {
              const Icon = FIELD_TYPE_ICON[option];
              // На edit — недопустимые по allow-list смены типа (§5) задизейблены прямо в списке,
              // не 400 после сабмита: переиспользуем isCompatibleFieldTypeChange из api-schemas,
              // не дублируем ALLOWED_TYPE_CHANGES на фронте.
              const disabled = field ? !isCompatibleFieldTypeChange(field.type, option) : false;
              return (
                <SelectItem key={option} value={option} disabled={disabled}>
                  <span className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    {t(fieldTypeLabelKey(option))}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        {field && (
          <p className="text-xs text-muted-foreground">{t("fields.form.typeChangeHint")}</p>
        )}
      </div>

      {needsOptions && (
        <div className="flex flex-col gap-1.5">
          <Label required>{t("fields.form.options")}</Label>
          <div className="flex flex-col gap-2">
            {options.map((option, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  value={option}
                  onChange={(e) =>
                    setOptions((prev) => prev.map((o, i) => (i === index ? e.target.value : o)))
                  }
                  disabled={pending}
                  aria-label={t("fields.form.optionLabel", { index: index + 1 })}
                />
                <button
                  type="button"
                  onClick={() => setOptions((prev) => prev.filter((_, i) => i !== index))}
                  disabled={pending}
                  aria-label={t("fields.form.removeOption")}
                  className="shrink-0 rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => setOptions((prev) => [...prev, ""])}
              disabled={pending}
            >
              <Plus className="h-3.5 w-3.5" />
              {t("fields.form.addOption")}
            </Button>
          </div>
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={required} onCheckedChange={(v) => setRequired(v === true)} disabled={pending} />
        {t("fields.form.required")}
      </label>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          {t("fields.form.cancel")}
        </Button>
        <Button type="submit" disabled={pending || !canSubmit}>
          {pending ? t("fields.form.submitting") : t("fields.form.submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}
