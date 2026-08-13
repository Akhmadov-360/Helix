import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { WorkspaceResponse } from "@helix/api-schemas";
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
import { useT } from "../../shared/i18n";
import { workspacesQueryOptions } from "../workspaces/queries";
import { useCreateKbArticle } from "./mutations";

const ORG_WIDE = "org-wide";

// §1 — workspaceId не задан = org-wide статья, видна из любого воркспейса; конкретный workspaceId
// сужает видимость до контекста этого воркспейса (тот же выбор, что при создании Page на проекте,
// только на уровень выше — здесь это явный выбор пользователя, а не наследование от проекта).
export function CreateKbArticleDialog({
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
  const workspaces = useSuspenseQuery(workspacesQueryOptions(orgId)).data;
  const create = useCreateKbArticle(orgId);

  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState("");
  const [workspaceId, setWorkspaceId] = useState<string>(ORG_WIDE);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    create.mutate(
      {
        title: title.trim(),
        workspaceId: workspaceId === ORG_WIDE ? undefined : workspaceId,
        icon: icon.trim() || undefined,
      },
      {
        onSuccess: (article) => {
          setTitle("");
          setIcon("");
          setWorkspaceId(ORG_WIDE);
          onOpenChange(false);
          void navigate({ to: "/kb/$articleId", params: { articleId: article.id } });
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("kb.create.title")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="kb-icon">{t("kb.create.icon")}</Label>
              <Input
                id="kb-icon"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                disabled={create.isPending}
                placeholder="📚"
                maxLength={16}
                className="w-14 text-center"
              />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="kb-title" required>
                {t("kb.create.label")}
              </Label>
              <Input
                id="kb-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={create.isPending}
                autoFocus
                required
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="kb-workspace">{t("kb.create.workspace")}</Label>
            <Select value={workspaceId} onValueChange={setWorkspaceId}>
              <SelectTrigger id="kb-workspace">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ORG_WIDE}>{t("kb.workspace.orgWide")}</SelectItem>
                {workspaces.map((ws: WorkspaceResponse) => (
                  <SelectItem key={ws.id} value={ws.id}>
                    {ws.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={create.isPending}>
              {t("kb.create.cancel")}
            </Button>
            <Button type="submit" disabled={create.isPending || !title.trim()}>
              {create.isPending ? t("kb.create.submitting") : t("kb.create.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
