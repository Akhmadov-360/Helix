import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@helix/ui";
import { History } from "lucide-react";
import { useLocaleStore, useT } from "../../shared/i18n";
import { formatRelative } from "../../shared/lib/format-relative";
import { useRestorePageVersion } from "./mutations";
import { pageVersionsQueryOptions } from "./queries";

// pages-kb.md §8 — история открывается по клику, не suspense (не должна блокировать рендер
// страницы); restore — двухшаговое подтверждение ПРЯМО В строке (не вложенный Dialog поверх
// Dialog), т.к. перезаписывает видимый контент, хоть и не разрушительно (бэкенд сам снапшотит
// текущее состояние перед перезаписью, см. PagesService.restoreVersion).
export function PageVersionHistoryDialog({
  orgId,
  projectId,
  pageId,
  open,
  onOpenChange,
}: {
  orgId: string;
  projectId: string;
  pageId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);
  const relativeFormatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const versions = useQuery({ ...pageVersionsQueryOptions(orgId, pageId), enabled: open }).data ?? [];
  const restore = useRestorePageVersion(orgId, projectId, pageId);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  function handleRestore(versionId: string) {
    restore.mutate(versionId, {
      onSuccess: () => {
        setConfirmingId(null);
        onOpenChange(false);
      },
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setConfirmingId(null);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            {t("pages.history.title")}
          </DialogTitle>
          <DialogDescription>{t("pages.history.description")}</DialogDescription>
        </DialogHeader>

        {versions.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{t("pages.history.empty")}</p>
        ) : (
          <ul className="scroll-slim flex max-h-80 flex-col gap-1 overflow-y-auto">
            {versions.map((version) => (
              <li key={version.id} className="flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-muted">
                <div className="min-w-0">
                  <p className="truncate text-sm">{version.title || t("pages.title.placeholder")}</p>
                  <p className="text-xs text-muted-foreground">{formatRelative(version.createdAt, relativeFormatter)}</p>
                </div>
                {confirmingId === version.id ? (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmingId(null)} disabled={restore.isPending}>
                      {t("pages.history.cancel")}
                    </Button>
                    <Button type="button" variant="default" size="sm" onClick={() => handleRestore(version.id)} disabled={restore.isPending}>
                      {restore.isPending ? t("pages.history.restoring") : t("pages.history.confirmRestore")}
                    </Button>
                  </div>
                ) : (
                  <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => setConfirmingId(version.id)}>
                    {t("pages.history.restore")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
