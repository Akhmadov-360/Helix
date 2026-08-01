import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { Audience } from "@helix/api-schemas";
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
import { setLastWorkspaceId } from "../../shared/lib/last-workspace";
import { useCreateWorkspace } from "./mutations";

const AUDIENCES: Audience[] = ["B2B", "B2C", "MIXED"];

export function CreateWorkspaceDialog({
  orgId,
  open,
  onOpenChange,
}: {
  orgId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const navigate = useNavigate();
  const create = useCreateWorkspace(orgId);
  const [name, setName] = useState("");
  const [audience, setAudience] = useState<Audience>("B2B");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate(
      { name: name.trim(), audience },
      {
        onSuccess: (workspace) => {
          setName("");
          setAudience("B2B");
          onOpenChange(false);
          setLastWorkspaceId(workspace.id);
          void navigate({ to: "/workspaces/$workspaceId/board", params: { workspaceId: workspace.id } });
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("workspaces.create.title")}</DialogTitle>
          <DialogDescription>{t("workspaces.create.description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="workspace-name">{t("workspaces.create.name")}</Label>
            <Input
              id="workspace-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={create.isPending}
              autoFocus
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="workspace-audience">{t("workspaces.create.audience")}</Label>
            <Select value={audience} onValueChange={(v) => setAudience(v as Audience)} disabled={create.isPending}>
              <SelectTrigger id="workspace-audience">
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
              {create.isPending ? t("workspaces.create.submitting") : t("workspaces.create.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
