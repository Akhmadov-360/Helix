import { useState } from "react";
import type { FieldDefinitionResponse } from "@helix/api-schemas";
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@helix/ui";
import { useT } from "../../shared/i18n";
import { missingFieldKeysFrom, toBoardError } from "../board/board-error";
import { CustomFieldsSection } from "../fields/custom-fields-section";
import { ManageFieldsHint } from "../fields/manage-fields-hint";
import { useUpdateProject } from "./mutations";

// Батч-редактирование всех custom-полей лида одной формой (не N инлайн-редакторов в сайдбаре) —
// проще для валидации/required-подсветки (§7), тот же выбор, что FieldFormDialog для самих
// FieldDefinition. Один PATCH со всем набором fields — Project.fields JSON целиком перезаписывает
// сервис (полный смёрженный набор, не дельта — projects.service.ts).
export function EditProjectFieldsDialog({
  orgId,
  workspaceId,
  projectId,
  definitions,
  values,
  open,
  onOpenChange,
}: {
  orgId: string;
  workspaceId: string;
  projectId: string;
  definitions: FieldDefinitionResponse[];
  values: Record<string, unknown>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("fields.value.editTitle")}</DialogTitle>
        </DialogHeader>
        {/* Размонтируется при закрытии — свежий локальный стейт из `values` на каждое открытие,
            тот же приём, что PhaseFormFields. */}
        {open && (
          <EditFieldsForm
            orgId={orgId}
            workspaceId={workspaceId}
            projectId={projectId}
            definitions={definitions}
            values={values}
            onDone={() => onOpenChange(false)}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditFieldsForm({
  orgId,
  workspaceId,
  projectId,
  definitions,
  values,
  onDone,
  onCancel,
}: {
  orgId: string;
  workspaceId: string;
  projectId: string;
  definitions: FieldDefinitionResponse[];
  values: Record<string, unknown>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const update = useUpdateProject(orgId, workspaceId, projectId);
  const [fields, setFields] = useState<Record<string, unknown>>(values);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    update.mutate({ fields }, { onSuccess: onDone });
  }

  const missingKeys =
    update.error && toBoardError(update.error) === "missingRequiredFields"
      ? new Set(missingFieldKeysFrom(update.error))
      : undefined;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <CustomFieldsSection
        orgId={orgId}
        definitions={definitions}
        values={fields}
        onChange={(key, value) => setFields((prev) => ({ ...prev, [key]: value }))}
        disabled={update.isPending}
        errorKeys={missingKeys}
      />
      <ManageFieldsHint workspaceId={workspaceId} />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={update.isPending}>
          {t("fields.form.cancel")}
        </Button>
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? t("fields.form.submitting") : t("fields.form.submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}
