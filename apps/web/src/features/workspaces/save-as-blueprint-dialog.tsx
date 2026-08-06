import { useState } from "react";
import type { Audience, WorkspaceResponse } from "@helix/api-schemas";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
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
import { useCreateBlueprintFromWorkspace } from "../blueprints/mutations";
import { useT } from "../../shared/i18n";

// PRD FR-BP-1: блюпринт помечается B2B ИЛИ B2C — в отличие от Workspace.audience, MIXED здесь
// не вариант (иначе такой блюпринт не попал бы ни в один срез мастера создания — GridStep
// фильтрует ровно по B2B/B2C, MIXED в его выборе аудитории нет).
const AUDIENCES: Extract<Audience, "B2B" | "B2C">[] = ["B2B", "B2C"];

// FR-BP-4: снапшот ТЕКУЩЕГО состава воркспейса (фазы+кастомные поля) в новый org-private
// блюпринт — не живая ссылка (blueprints.md §0: PATCH-редактирования блюпринта нет вообще,
// создал неправильно — удали и пересохрани).
export function SaveAsBlueprintDialog({
  orgId,
  workspace,
  open,
  onOpenChange,
}: {
  orgId: string;
  workspace: WorkspaceResponse | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const create = useCreateBlueprintFromWorkspace(orgId);
  const [name, setName] = useState(workspace ? `${workspace.name} template` : "");
  // Источник может быть MIXED (валидно для Workspace, не для Blueprint, см. AUDIENCES) —
  // в этом случае дефолт B2B, не пропускаем MIXED дальше в форму.
  const [audience, setAudience] = useState<Audience>(workspace?.audience === "B2C" ? "B2C" : "B2B");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!workspace || !name.trim()) return;
    create.mutate(
      { workspaceId: workspace.id, name: name.trim(), audience },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("blueprints.save.title")}</DialogTitle>
          <DialogDescription>{t("blueprints.save.description")}</DialogDescription>
        </DialogHeader>
        {open && workspace && (
          <form key={workspace.id} onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="blueprint-save-name" required>{t("blueprints.save.name")}</Label>
              <Input
                id="blueprint-save-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={create.isPending}
                autoFocus
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="blueprint-save-audience">{t("workspaces.create.audience")}</Label>
              <Select value={audience} onValueChange={(v) => setAudience(v as Audience)} disabled={create.isPending}>
                <SelectTrigger id="blueprint-save-audience">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUDIENCES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {t(`workspaces.create.audience.${option}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={create.isPending}>
                {t("workspaces.create.cancel")}
              </Button>
              <Button type="submit" disabled={create.isPending || !name.trim()}>
                {create.isPending ? t("blueprints.save.submitting") : t("blueprints.save.submit")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
