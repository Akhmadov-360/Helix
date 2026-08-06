import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { createOrganizationSchema, type CreateOrganizationInput } from "@helix/api-schemas";
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
} from "@helix/ui";
import { useT } from "../../shared/i18n";
import { useCreateOrganization } from "./mutations";

export function CreateOrganizationDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const form = useForm<CreateOrganizationInput>({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: { name: "" },
  });
  const create = useCreateOrganization();

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
          onSubmit={form.handleSubmit((values) => create.mutate(values, { onSuccess: () => handleOpenChange(false) }))}
          className="flex flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle>{t("settings.createOrg.title")}</DialogTitle>
            <DialogDescription>{t("settings.createOrg.description")}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="new-org-name">{t("settings.createOrg.name")}</Label>
            <Input id="new-org-name" aria-invalid={errors.name !== undefined} {...form.register("name")} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)} disabled={create.isPending}>
              {t("workspaces.create.cancel")}
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? t("settings.createOrg.submitting") : t("settings.createOrg.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
