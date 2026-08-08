import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Check, MoreHorizontal, Pencil, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import type { FieldDefinitionResponse } from "@helix/api-schemas";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
} from "@helix/ui";
import { useCan } from "../../shared/auth/ability";
import { useT } from "../../shared/i18n";
import { useLocalize } from "../../shared/lib/localize";
import { DeleteFieldDialog } from "./delete-field-dialog";
import { FieldFormDialog } from "./field-form-dialog";
import { FIELD_TYPE_ICON, fieldTypeLabelKey } from "./field-type-meta";
import { fieldsQueryOptions } from "./queries";

const COLUMN_COUNT = 5;

// Custom Fields — конфигурация воркспейса (та же категория прав, что фазы, custom-fields.md §1):
// отдельная страница (не диалог поверх доски), потому что список произвольной длины + форма
// редактирования (options-editor, смена типа) не влезли бы в Dialog без вложенной прокрутки, и
// это deep-linkable, в отличие от модалки (nav-guideline).
export function FieldsPage({ orgId, workspaceId }: { orgId: string; workspaceId: string }) {
  const t = useT();
  const localize = useLocalize();
  const fields = useSuspenseQuery(fieldsQueryOptions(orgId, workspaceId)).data;

  const canCreate = useCan("FieldDefinition.create");
  const canUpdate = useCan("FieldDefinition.update");
  const canDelete = useCan("FieldDefinition.delete");

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<FieldDefinitionResponse | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FieldDefinitionResponse | null>(null);

  const toolbar = (
    <TableToolbar
      title={t("fields.page.title")}
      actions={
        canCreate && (
          <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            {t("fields.create.trigger")}
          </Button>
        )
      }
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t("fields.page.subtitle")}</p>
      <Table toolbar={toolbar} containerClassName="min-h-0 flex-1" className="min-w-[560px]">
        <TableHeader>
          <TableRow header>
            <TableHead>{t("fields.list.label")}</TableHead>
            <TableHead>{t("fields.list.type")}</TableHead>
            <TableHead>{t("fields.list.required")}</TableHead>
            <TableHead>{t("fields.list.options")}</TableHead>
            <TableHead className="w-10">
              <span className="sr-only">{t("fields.list.menu")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {fields.length === 0 ? (
            <TableRow>
              <TableCell colSpan={COLUMN_COUNT}>
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
                  <SlidersHorizontal className="h-8 w-8" />
                  <p>{t("fields.page.empty")}</p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            fields.map((field) => {
              const Icon = FIELD_TYPE_ICON[field.type];
              return (
                <TableRow key={field.id}>
                  <TableCell className="font-medium text-foreground">{localize(field.label)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="gap-1">
                      <Icon className="h-3 w-3" />
                      {t(fieldTypeLabelKey(field.type))}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {field.required ? <Check className="h-3.5 w-3.5 text-accent" /> : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="max-w-64 truncate text-muted-foreground">
                    {field.options?.join(", ") ?? "—"}
                  </TableCell>
                  <TableCell>
                    {(canUpdate || canDelete) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" aria-label={t("fields.list.menu")}>
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canUpdate && (
                            <DropdownMenuItem onSelect={() => setEditTarget(field)}>
                              <Pencil className="h-3.5 w-3.5" />
                              {t("fields.list.edit")}
                            </DropdownMenuItem>
                          )}
                          {canDelete && (
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleteTarget(field)}>
                              <Trash2 className="h-3.5 w-3.5" />
                              {t("fields.list.delete")}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      <FieldFormDialog orgId={orgId} workspaceId={workspaceId} field={null} open={createOpen} onOpenChange={setCreateOpen} />
      <FieldFormDialog
        orgId={orgId}
        workspaceId={workspaceId}
        field={editTarget}
        open={editTarget !== null}
        onOpenChange={(open) => !open && setEditTarget(null)}
      />
      <DeleteFieldDialog
        orgId={orgId}
        workspaceId={workspaceId}
        field={deleteTarget}
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      />
    </div>
  );
}
