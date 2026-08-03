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
import { useT } from "../../shared/i18n";
import { useUpdateWorkspace } from "./mutations";

const AUDIENCES: Audience[] = ["B2B", "B2C", "MIXED"];

export function EditWorkspaceDialog({
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
  const update = useUpdateWorkspace(orgId);
  // Ленивая инициализация из props, не useEffect+setState: родитель монтирует этот компонент
  // заново под новым key={workspace.id} при каждом открытии (route/index.tsx) — так что "текущий
  // воркспейс" всегда известен уже на первом рендере, синхронизировать нечего.
  const [name, setName] = useState(workspace?.name ?? "");
  const [audience, setAudience] = useState<Audience>(workspace?.audience ?? "B2B");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!workspace || !name.trim()) return;
    update.mutate(
      { id: workspace.id, input: { name: name.trim(), audience } },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("workspaces.edit.title")}</DialogTitle>
          <DialogDescription>{t("workspaces.edit.description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="workspace-edit-name" required>{t("workspaces.create.name")}</Label>
            <Input
              id="workspace-edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={update.isPending}
              autoFocus
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="workspace-edit-audience">{t("workspaces.create.audience")}</Label>
            <Select value={audience} onValueChange={(v) => setAudience(v as Audience)} disabled={update.isPending}>
              <SelectTrigger id="workspace-edit-audience">
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
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={update.isPending}>
              {t("workspaces.create.cancel")}
            </Button>
            <Button type="submit" disabled={update.isPending || !name.trim()}>
              {update.isPending ? t("workspaces.edit.submitting") : t("workspaces.edit.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
