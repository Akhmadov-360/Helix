import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { MAX_ATTACHMENT_SIZE_BYTES, type AttachmentResponse } from "@helix/api-schemas";
import {
  Badge,
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  Progress,
  TableToolbar,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from "@helix/ui";
import { Download, FolderSearch, Pencil, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { useCan } from "../../shared/auth/ability";
import { useLocaleStore, useT } from "../../shared/i18n";
import { navigateToDownload } from "../../shared/lib/navigate-to-download";
import { AttachmentIcon } from "./attachment-icon";
import { AttachmentPreviewDialog } from "./attachment-preview-dialog";
import { categorizeAttachment, type AttachmentCategory } from "./attachment-category";
import { DeleteAttachmentDialog } from "./delete-attachment-dialog";
import { formatFileSize } from "./format-file-size";
import { fetchDownloadUrl, useUploadAttachment } from "./mutations";
import { projectAttachmentsQueryOptions, projectStorageUsageQueryOptions } from "./queries";
import { RenameAttachmentDialog } from "./rename-attachment-dialog";

const CATEGORIES: AttachmentCategory[] = ["all", "image", "document", "other"];
const MAX_SIZE_LABEL = formatFileSize(MAX_ATTACHMENT_SIZE_BYTES);

interface UploadingItem {
  key: string;
  file: File;
  progress: number; // 0-100 uploading; -1 = confirm в процессе
}

export function AttachmentsView({ orgId, projectId }: { orgId: string; projectId: string }) {
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);
  const attachments = useSuspenseQuery(projectAttachmentsQueryOptions(orgId, projectId)).data;
  const usage = useSuspenseQuery(projectStorageUsageQueryOptions(orgId, projectId)).data;
  const upload = useUploadAttachment(orgId, projectId);
  const canCreate = useCan("Attachment.create");
  const canUpdate = useCan("Attachment.update");
  const canDelete = useCan("Attachment.delete");

  const [uploading, setUploading] = useState<UploadingItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [category, setCategory] = useState<AttachmentCategory>("all");
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; filename: string } | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ id: string; filename: string } | null>(null);
  const [previewTarget, setPreviewTarget] = useState<{ id: string; filename: string; mimeType: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  const searchQuery = search.trim().toLowerCase();
  const filteredAttachments = useMemo(
    () =>
      attachments
        .filter((a) => category === "all" || categorizeAttachment(a.mimeType) === category)
        .filter((a) => !searchQuery || a.filename.toLowerCase().includes(searchQuery)),
    [attachments, category, searchQuery],
  );
  const usagePercent = usage.quotaBytes > 0 ? Math.min(100, (usage.usedBytes / usage.quotaBytes) * 100) : 0;
  const quotaExceeded = usage.usedBytes >= usage.quotaBytes;

  // Счётчик на каждый чип фильтра — считаем один раз за рендер, не внутри .map (иначе O(n·4)
  // проходов по attachments на каждый ререндер списка).
  const categoryCounts: Record<AttachmentCategory, number> = {
    all: attachments.length,
    image: 0,
    document: 0,
    other: 0,
  };
  for (const a of attachments) categoryCounts[categorizeAttachment(a.mimeType)] += 1;

  function handleFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
        toast.error(t("attachments.error.tooLarge"));
        continue;
      }
      const key = `${file.name}-${file.size}-${Date.now()}-${Math.random()}`;
      setUploading((current) => [...current, { key, file, progress: 0 }]);

      upload.mutate(
        {
          file,
          onProgress: (percent) =>
            setUploading((current) => current.map((u) => (u.key === key ? { ...u, progress: percent } : u))),
        },
        {
          onSettled: () => setUploading((current) => current.filter((u) => u.key !== key)),
        },
      );
    }
  }

  // Реальное скачивание (Save As), не превью — presigned URL несёт Content-Disposition: attachment
  // (S3Service, files.md §5), поэтому обычная навигация браузера сама триггерит скачивание и не
  // уводит со страницы (code-review: раньше window.open открывал файл в новом табе вместо скачивания).
  async function handleRealDownload(attachmentId: string) {
    try {
      const url = await fetchDownloadUrl(projectId, attachmentId, "attachment");
      navigateToDownload(url);
    } catch {
      toast.error(t("attachments.error.unexpected"));
    }
  }

  const hasAnyAttachments = attachments.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <Progress value={usagePercent} className={`h-1.5 flex-1 ${quotaExceeded ? "[&>div]:bg-destructive" : ""}`} />
        <span className="shrink-0 tabular-nums">
          {t("attachments.storage.usage", {
            used: formatFileSize(usage.usedBytes),
            quota: formatFileSize(usage.quotaBytes),
          })}
        </span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        disabled={quotaExceeded}
        className="hidden"
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {!hasAnyAttachments && uploading.length === 0 ? (
        canCreate ? (
          <Dropzone
            isDragging={isDragging}
            quotaExceeded={quotaExceeded}
            onDragStateChange={setIsDragging}
            onDrop={handleFiles}
            onBrowse={() => fileInputRef.current?.click()}
          />
        ) : (
          <p className="text-sm text-muted-foreground">{t("attachments.list.empty")}</p>
        )
      ) : (
        <>
          <TableToolbar
            search={{ value: search, onChange: setSearch, placeholder: t("attachments.search.placeholder") }}
            actions={
              canCreate &&
              !quotaExceeded && (
                <Button type="button" size="sm" onClick={() => fileInputRef.current?.click()}>
                  <UploadCloud className="h-4 w-4" />
                  {t("attachments.list.upload")}
                </Button>
              )
            }
          />

          <div className="flex flex-wrap gap-1">
            {CATEGORIES.map((c) => (
              <Button
                key={c}
                type="button"
                size="sm"
                variant={category === c ? "secondary" : "ghost"}
                // Обнулённая категория остаётся кликабельной (не disabled) — выбрать её и увидеть
                // пустое состояние с кнопкой сброса не хуже, чем не дать выбрать вовсе.
                className={cn("gap-1.5", categoryCounts[c] === 0 && "opacity-60")}
                onClick={() => setCategory(c)}
              >
                {t(`attachments.filter.${c}`)}
                <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                  {categoryCounts[c]}
                </Badge>
              </Button>
            ))}
          </div>

          <div
            onDragOver={(e: DragEvent) => {
              if (!canCreate || quotaExceeded) return;
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e: DragEvent) => {
              if (!canCreate || quotaExceeded) return;
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
            }}
            className={cn(
              "rounded-xl border transition-colors",
              isDragging ? "border-accent bg-accent/5" : "border-border",
            )}
          >
            {filteredAttachments.length === 0 && uploading.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <FolderSearch className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium">{t("attachments.filter.emptyTitle")}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setCategory("all");
                    setSearch("");
                  }}
                >
                  {t("attachments.filter.reset")}
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {uploading.map((item) => (
                  <div key={item.key} className="flex items-center gap-3 px-3 py-2.5">
                    <AttachmentIcon mimeType={item.file.type} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.file.name}</p>
                      <Progress value={item.progress} className="mt-1 h-1" />
                    </div>
                  </div>
                ))}

                {filteredAttachments.map((attachment) => (
                  <AttachmentRow
                    key={attachment.id}
                    attachment={attachment}
                    canUpdate={canUpdate}
                    canDelete={canDelete}
                    dateFormatter={dateFormatter}
                    onPreview={() => setPreviewTarget(attachment)}
                    onDownload={() => void handleRealDownload(attachment.id)}
                    onRenameRequest={() => setRenameTarget({ id: attachment.id, filename: attachment.filename })}
                    onDeleteRequest={() => setDeleteTarget({ id: attachment.id, filename: attachment.filename })}
                  />
                ))}
              </div>
            )}

            {canCreate && !quotaExceeded && hasAnyAttachments && (
              <p className="flex items-center justify-center gap-1.5 border-t border-border py-3 text-xs text-muted-foreground">
                <UploadCloud className="h-3.5 w-3.5" />
                {t("attachments.dropzone.more")}
              </p>
            )}
          </div>
        </>
      )}

      <AttachmentPreviewDialog
        projectId={projectId}
        attachment={previewTarget}
        open={previewTarget !== null}
        onOpenChange={(open) => !open && setPreviewTarget(null)}
        onDownload={(id) => void handleRealDownload(id)}
      />

      <RenameAttachmentDialog
        orgId={orgId}
        projectId={projectId}
        attachment={renameTarget}
        open={renameTarget !== null}
        onOpenChange={(open) => !open && setRenameTarget(null)}
      />

      <DeleteAttachmentDialog
        orgId={orgId}
        projectId={projectId}
        attachment={deleteTarget}
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      />
    </div>
  );
}

// Большая dropzone-иллюстрация — показывается ТОЛЬКО когда во всём проекте ещё нет ни одного файла
// (Figma "Lead Detail - Files (Empty)"). Как только появляется первый файл, эта же drop-зона
// схлопывается в компактную подсказку под списком (см. "attachments.dropzone.more" ниже).
function Dropzone({
  isDragging,
  quotaExceeded,
  onDragStateChange,
  onDrop,
  onBrowse,
}: {
  isDragging: boolean;
  quotaExceeded: boolean;
  onDragStateChange: (dragging: boolean) => void;
  onDrop: (files: FileList) => void;
  onBrowse: () => void;
}) {
  const t = useT();
  return (
    <div
      onDragOver={(e: DragEvent) => {
        e.preventDefault();
        if (!quotaExceeded) onDragStateChange(true);
      }}
      onDragLeave={() => onDragStateChange(false)}
      onDrop={(e: DragEvent) => {
        e.preventDefault();
        onDragStateChange(false);
        if (!quotaExceeded && e.dataTransfer.files.length > 0) onDrop(e.dataTransfer.files);
      }}
      className={cn(
        "flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-6 py-16 text-center transition-colors",
        quotaExceeded
          ? "cursor-not-allowed border-border opacity-50"
          : isDragging
            ? "border-accent bg-accent/5"
            : "border-border",
      )}
    >
      <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-accent/10 text-accent">
        <UploadCloud className="h-7 w-7" />
      </span>
      <p className="text-lg font-semibold">
        {quotaExceeded ? t("attachments.storage.quotaExceeded") : t("attachments.dropzone.title")}
      </p>
      {!quotaExceeded && <p className="max-w-sm text-sm text-muted-foreground">{t("attachments.dropzone.subtitle")}</p>}
      {!quotaExceeded && (
        <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onBrowse}>
          {t("attachments.dropzone.browse")}
        </Button>
      )}
      {!quotaExceeded && (
        <p className="mt-4 text-xs text-muted-foreground">
          {t("attachments.dropzone.formats", { size: MAX_SIZE_LABEL })}
        </p>
      )}
    </div>
  );
}

function AttachmentRow({
  attachment,
  canUpdate,
  canDelete,
  dateFormatter,
  onPreview,
  onDownload,
  onRenameRequest,
  onDeleteRequest,
}: {
  attachment: AttachmentResponse;
  canUpdate: boolean;
  canDelete: boolean;
  dateFormatter: Intl.DateTimeFormat;
  onPreview: () => void;
  onDownload: () => void;
  onRenameRequest: () => void;
  onDeleteRequest: () => void;
}) {
  const t = useT();
  const description = [
    formatFileSize(attachment.sizeBytes),
    attachment.uploadedByName,
    dateFormatter.format(new Date(attachment.createdAt)),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div className="group/row relative flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50">
          <button
            type="button"
            onClick={onPreview}
            aria-label={attachment.filename}
            className="absolute inset-0 z-10 outline-none"
          />
          <AttachmentIcon mimeType={attachment.mimeType} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{attachment.filename}</p>
            <p className="truncate text-xs text-muted-foreground">{description}</p>
          </div>
          <div className="relative z-20 flex shrink-0 items-center">
            {canUpdate && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("attachments.list.rename")}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRenameRequest();
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("attachments.list.rename")}</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("attachments.list.download")}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDownload();
                  }}
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("attachments.list.download")}</TooltipContent>
            </Tooltip>
            {canDelete && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("attachments.list.delete")}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteRequest();
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("attachments.list.delete")}</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onPreview}>{t("attachments.preview.open")}</ContextMenuItem>
        {canUpdate && (
          <ContextMenuItem onClick={onRenameRequest}>
            <Pencil className="mr-2 h-4 w-4" />
            {t("attachments.list.rename")}
          </ContextMenuItem>
        )}
        <ContextMenuItem onClick={onDownload}>
          <Download className="mr-2 h-4 w-4" />
          {t("attachments.list.download")}
        </ContextMenuItem>
        {canDelete && (
          <ContextMenuItem variant="destructive" onClick={onDeleteRequest}>
            <Trash2 className="mr-2 h-4 w-4" />
            {t("attachments.list.delete")}
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
