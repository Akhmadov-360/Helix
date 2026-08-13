import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { MAX_ATTACHMENT_SIZE_BYTES, type AttachmentResponse } from "@helix/api-schemas";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  Progress,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@helix/ui";
import { Download, FolderSearch, Pencil, Trash2, Upload } from "lucide-react";
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
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; filename: string } | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ id: string; filename: string } | null>(null);
  const [previewTarget, setPreviewTarget] = useState<{ id: string; filename: string; mimeType: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  const filteredAttachments =
    category === "all" ? attachments : attachments.filter((a) => categorizeAttachment(a.mimeType) === category);
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

      {canCreate && (
        <div
          onDragOver={(e: DragEvent) => {
            e.preventDefault();
            if (!quotaExceeded) setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e: DragEvent) => {
            e.preventDefault();
            setIsDragging(false);
            if (!quotaExceeded && e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
          }}
          className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-6 text-center transition-colors ${
            quotaExceeded
              ? "cursor-not-allowed border-border opacity-50"
              : isDragging
                ? "border-accent bg-accent/5"
                : "border-border"
          }`}
        >
          <Upload className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {quotaExceeded ? t("attachments.storage.quotaExceeded") : t("attachments.dropzone.hint")}
          </p>
          {!quotaExceeded && (
            <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              {t("attachments.dropzone.browse")}
            </Button>
          )}
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
        </div>
      )}

      {attachments.length > 0 && (
        <div className="flex gap-1">
          {CATEGORIES.map((c) => (
            <Button
              key={c}
              type="button"
              size="sm"
              variant={category === c ? "secondary" : "ghost"}
              // Обнулённая категория остаётся кликабельной (не disabled) — выбрать её и увидеть
              // пустое состояние с кнопкой сброса не хуже, чем не дать выбрать вовсе.
              className={categoryCounts[c] === 0 ? "opacity-60" : undefined}
              onClick={() => setCategory(c)}
            >
              {t(`attachments.filter.${c}`)} ({categoryCounts[c]})
            </Button>
          ))}
        </div>
      )}

      {attachments.length === 0 && uploading.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("attachments.list.empty")}</p>
      )}

      {attachments.length > 0 && filteredAttachments.length === 0 && uploading.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-10 text-center">
          <FolderSearch className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">{t("attachments.filter.emptyTitle")}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => setCategory("all")}>
            {t("attachments.filter.reset")}
          </Button>
        </div>
      )}

      <AttachmentGroup className="flex-col overflow-visible">
        {uploading.map((item) => (
          <Attachment key={item.key} state="uploading" size="sm" className="w-full">
            <AttachmentMedia>
              <AttachmentIcon mimeType={item.file.type} className="h-4 w-4" />
            </AttachmentMedia>
            <AttachmentContent>
              <AttachmentTitle>{item.file.name}</AttachmentTitle>
              <Progress value={item.progress} className="mt-1 h-1" />
            </AttachmentContent>
          </Attachment>
        ))}

        {filteredAttachments.map((attachment) => (
          <AttachmentCard
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
      </AttachmentGroup>

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

function AttachmentCard({
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
        {/* Клик по всей строке уже открывает превью — AttachmentTrigger примитива абсолютно
            позиционирован на всю карточку (inset-0), кнопки действий поверх него (z-20) с
            stopPropagation. cursor-pointer добавлен явно: <button> не наследует pointer от UA
            stylesheet, в отличие от <a>. */}
        <Attachment state="done" size="sm" className="w-full cursor-pointer transition-all">
          <AttachmentTrigger onClick={onPreview} aria-label={attachment.filename} className="cursor-pointer" />
          <AttachmentMedia>
            <AttachmentIcon mimeType={attachment.mimeType} className="h-4 w-4" />
          </AttachmentMedia>
          <AttachmentContent>
            <AttachmentTitle>{attachment.filename}</AttachmentTitle>
            <AttachmentDescription>{description}</AttachmentDescription>
          </AttachmentContent>
          <AttachmentActions>
            {canUpdate && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <AttachmentAction
                    aria-label={t("attachments.list.rename")}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRenameRequest();
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </AttachmentAction>
                </TooltipTrigger>
                <TooltipContent>{t("attachments.list.rename")}</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <AttachmentAction
                  aria-label={t("attachments.list.download")}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDownload();
                  }}
                >
                  <Download className="h-3.5 w-3.5" />
                </AttachmentAction>
              </TooltipTrigger>
              <TooltipContent>{t("attachments.list.download")}</TooltipContent>
            </Tooltip>
            {canDelete && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <AttachmentAction
                    aria-label={t("attachments.list.delete")}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteRequest();
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </AttachmentAction>
                </TooltipTrigger>
                <TooltipContent>{t("attachments.list.delete")}</TooltipContent>
              </Tooltip>
            )}
          </AttachmentActions>
        </Attachment>
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
