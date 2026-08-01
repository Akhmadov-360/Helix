import { useState } from "react";
import { phaseTypeSchema, type Locale, type PhaseResponse, type PhaseType } from "@helix/api-schemas";
import {
  Button,
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
import { useCreatePhase, useUpdatePhase } from "./mutations";

// name — LocalizedName, но форма пишет только в ТЕКУЩУЮ UI-локаль (минимально жизнеспособная
// правка §P1: остальные локали не изобретаем полями — если понадобится редактировать все три
// сразу, это отдельный проход). На edit — мёрджим с существующим name, не заменяем целиком:
// PATCH .name уходит в Prisma jsonb как raw replace (phases.repository.ts update()), отправка
// одного лишь текущего локаля стёрла бы переводы остальных без этого мёржа.
export function PhaseFormDialog({
  orgId,
  workspaceId,
  phase,
  open,
  onOpenChange,
}: {
  orgId: string;
  workspaceId: string;
  phase: PhaseResponse | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{phase ? t("phases.edit.title") : t("phases.create.title")}</DialogTitle>
        </DialogHeader>
        {/* key на phase.id (или "create") — реинициализирует локальный стейт формы при каждом
            открытии на новую фазу/режим, без setState-в-эффекте (react-hooks/set-state-in-effect). */}
        {open && (
          <PhaseFormFields
            key={phase?.id ?? "create"}
            orgId={orgId}
            workspaceId={workspaceId}
            phase={phase}
            onDone={() => onOpenChange(false)}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PhaseFormFields({
  orgId,
  workspaceId,
  phase,
  onDone,
  onCancel,
}: {
  orgId: string;
  workspaceId: string;
  phase: PhaseResponse | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);
  const create = useCreatePhase(orgId, workspaceId);
  const update = useUpdatePhase(orgId, workspaceId);
  const pending = create.isPending || update.isPending;

  const [name, setName] = useState(() => (phase ? (phase.name[locale as Locale] ?? "") : ""));
  const [type, setType] = useState<PhaseType>(phase?.type ?? "OPEN");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    if (phase) {
      update.mutate({ phaseId: phase.id, input: { name: { ...phase.name, [locale]: name.trim() }, type } }, { onSuccess: onDone });
    } else {
      create.mutate({ name: { [locale]: name.trim() }, type }, { onSuccess: onDone });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phase-name" required>{t("phases.form.name")}</Label>
        <Input
          id="phase-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={pending}
          autoFocus
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phase-type">{t("phases.form.type")}</Label>
        <Select value={type} onValueChange={(v) => setType(v as PhaseType)} disabled={pending}>
          <SelectTrigger id="phase-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {phaseTypeSchema.options.map((option) => (
              <SelectItem key={option} value={option}>
                {t(`projectDetail.status.${option}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          {t("phases.form.cancel")}
        </Button>
        <Button type="submit" disabled={pending || !name.trim()}>
          {pending ? t("phases.form.submitting") : t("phases.form.submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}
