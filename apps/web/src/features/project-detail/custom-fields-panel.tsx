import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import type { FieldDefinitionResponse } from "@helix/api-schemas";
import { useCan } from "../../shared/auth/ability";
import { useLocaleStore, useT } from "../../shared/i18n";
import { useLocalize } from "../../shared/lib/localize";
import { companiesListQueryOptions } from "../companies/queries";
import { contactsListQueryOptions } from "../contacts/queries";
import { fieldsQueryOptions } from "../fields/queries";
import { orgMembersQueryOptions } from "../../shared/org/queries";
import { EditProjectFieldsDialog } from "./edit-fields-dialog";

// Не suspense: список полей воркспейса — второстепенное обогащение сайдбара (часто пустое),
// не критично для первого рендера страницы лида (в отличие от Owner/Company). Ничего не рендерим,
// пока не пришло, секция целиком скрыта при пустом наборе (§design: без пустого блока-заглушки).
export function CustomFieldsPanel({
  orgId,
  workspaceId,
  projectId,
  fields,
}: {
  orgId: string;
  workspaceId: string;
  projectId: string;
  fields: Record<string, unknown>;
}) {
  const t = useT();
  const localize = useLocalize();
  const locale = useLocaleStore((state) => state.locale);
  const canEdit = useCan("Project.update");
  const [open, setOpen] = useState(false);

  const definitions = useQuery(fieldsQueryOptions(orgId, workspaceId)).data ?? [];
  const contacts = useQuery(contactsListQueryOptions(orgId)).data?.contacts ?? [];
  const companies = useQuery(companiesListQueryOptions(orgId)).data?.companies ?? [];
  const members = useQuery(orgMembersQueryOptions(orgId)).data ?? [];

  // §UX design: не заваливаем сайдбар прочерками у незаполненных полей — показываем только те,
  // что реально заполнены. Полный список (включая пустые) доступен в EditProjectFieldsDialog,
  // куда и ведёт карандаш.
  const filledDefinitions = definitions.filter((d) => fields[d.key] !== undefined && fields[d.key] !== null);

  if (definitions.length === 0) return null;
  if (filledDefinitions.length === 0 && !canEdit) return null;

  function displayValue(definition: FieldDefinitionResponse): string {
    const value = fields[definition.key];

    switch (definition.type) {
      case "boolean":
        return value ? t("fields.value.yes") : t("fields.value.no");
      case "date":
        return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value as string));
      case "datetime":
        return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
          new Date(value as string),
        );
      case "multiselect":
        return Array.isArray(value) ? value.join(", ") : String(value);
      case "contactRef":
        return contacts.find((c) => c.id === value)?.name ?? t("fields.value.unknownRef");
      case "companyRef":
        return companies.find((c) => c.id === value)?.name ?? t("fields.value.unknownRef");
      case "userRef":
        return members.find((m) => m.userId === value)?.name ?? t("fields.value.unknownRef");
      default:
        return String(value);
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t("projectDetail.sidebar.customFields")}</h2>
        {canEdit && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={t("fields.value.edit")}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {filledDefinitions.length > 0 ? (
        <dl className="flex flex-col gap-2 text-sm">
          {filledDefinitions.map((definition) => (
            <div key={definition.id} className="flex items-start justify-between gap-2">
              <dt className="shrink-0 text-muted-foreground">{localize(definition.label)}</dt>
              <dd className="text-right font-medium">{displayValue(definition)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">{t("fields.value.noneFilled")}</p>
      )}
      <EditProjectFieldsDialog
        orgId={orgId}
        workspaceId={workspaceId}
        projectId={projectId}
        definitions={definitions}
        values={fields}
        open={open}
        onOpenChange={setOpen}
      />
    </div>
  );
}
