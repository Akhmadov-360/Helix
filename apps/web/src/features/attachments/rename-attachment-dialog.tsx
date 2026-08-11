import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { updateAttachmentSchema, type UpdateAttachmentInput } from "@helix/api-schemas";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label } from "@helix/ui";
import { useT } from "../../shared/i18n";
import { useUpdateAttachmentFilename } from "./mutations";

// Скриншоты/фото часто сохраняются с неосмысленными системными именами — даём переименовать
// прямо из приложения, не заставляя удалять+перезаливать (files.md §7, пересмотрено).
export function RenameAttachmentDialog({
  orgId,
  projectId,
  attachment,
  open,
  onOpenChange,
}: {
  orgId: string;
  projectId: string;
  attachment: { id: string; filename: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const rename = useUpdateAttachmentFilename(orgId, projectId);
  const form = useForm<UpdateAttachmentInput>({
    resolver: zodResolver(updateAttachmentSchema),
    defaultValues: { filename: "" },
  });

  // Диалог переиспользуется для любого вложения (тот же приём, что DeleteAttachmentDialog) —
  // при смене цели/открытии подставляем актуальное имя, иначе форма показала бы прошлое значение.
  useEffect(() => {
    if (open && attachment) form.reset({ filename: attachment.filename });
  }, [open, attachment, form]);

  function handleOpenChange(next: boolean) {
    if (!next) form.reset();
    onOpenChange(next);
  }

  const { errors } = form.formState;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form
          noValidate
          onSubmit={form.handleSubmit((values) => {
            if (!attachment) return;
            rename.mutate(
              { attachmentId: attachment.id, input: values },
              { onSuccess: () => handleOpenChange(false) },
            );
          })}
          className="flex flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle>{t("attachments.rename.title")}</DialogTitle>
            <DialogDescription>{t("attachments.rename.description")}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="attachment-filename">{t("attachments.rename.label")}</Label>
            <Input
              id="attachment-filename"
              autoFocus
              aria-invalid={errors.filename !== undefined}
              {...form.register("filename")}
            />
            {errors.filename && <p className="text-sm text-destructive">{errors.filename.message}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)} disabled={rename.isPending}>
              {t("attachments.delete.cancel")}
            </Button>
            <Button type="submit" disabled={rename.isPending}>
              {rename.isPending ? t("attachments.rename.submitting") : t("attachments.rename.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
