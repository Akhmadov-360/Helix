import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import type { Audience, CompanyResponse, ContactResponse, DedupHint as DedupHintData } from "@helix/api-schemas";
import { Button, Card, cn } from "@helix/ui";
import { useCan } from "../../shared/auth/ability";
import { useT } from "../../shared/i18n";
import { ContactSearch } from "./contact-search";
import { DealRoleChips } from "./deal-role-chips";
import { DedupHint } from "./dedup-hint";
import { useLinkContact, useMergeContact, useUnlinkContact, useUpdateContactRoles } from "./mutations";
import { projectContactsQueryOptions } from "./queries";

// audience/company приходят пропом, не собственным запросом воркспейса/компании: features/* не
// импортируют друг друга напрямую (композиция на уровне routes/, скелет apps/web §2) — маршрут
// contacts.tsx уже грузит workspace/companies ради этого и передаёт их сюда.
export function ContactsView({
  orgId,
  projectId,
  audience,
  company,
}: {
  orgId: string;
  projectId: string;
  audience: Audience;
  company?: CompanyResponse;
}) {
  const t = useT();
  const contacts = useSuspenseQuery(projectContactsQueryOptions(orgId, projectId)).data;
  const link = useLinkContact(orgId, projectId);
  const updateRoles = useUpdateContactRoles(orgId, projectId);
  const unlink = useUnlinkContact(orgId, projectId);
  const merge = useMergeContact(orgId, projectId);
  // §8.2: без capability не рендерим действие — сервер всё равно единственный энфорсер, но не
  // предлагаем то, что гарантированно вернёт 403 (тот же принцип, что ProjectCard/PhaseRow, H1).
  const canLink = useCan("ProjectContact.create");
  const canUnlink = useCan("ProjectContact.delete");
  const canEditRoles = useCan("ProjectContact.update");
  const canMerge = useCan("Contact.merge");
  const [dedup, setDedup] = useState<{ hint: DedupHintData; newContactId: string } | null>(null);

  const excludeIds = new Set(contacts.map((c) => c.contactId));
  // Связь баннера с карточками ниже (UI-обзор): без этого пользователь сопоставляет текст баннера
  // с карточками вручную. Подсвечиваем и новый контакт, и предложенных кандидатов — обе стороны
  // потенциального дубля.
  const dedupHighlight = dedup
    ? new Set([dedup.newContactId, ...dedup.hint.candidates.map((c) => c.id)])
    : null;

  function linkExisting(contact: ContactResponse) {
    link.mutate({
      contactId: contact.id,
      roles: [],
      optimistic: { contactId: contact.id, name: contact.name, email: contact.email, phone: contact.phone },
    });
  }

  function handleCreated(contact: ContactResponse, hint: DedupHintData) {
    link.mutate({
      contactId: contact.id,
      roles: [],
      optimistic: { contactId: contact.id, name: contact.name, email: contact.email, phone: contact.phone },
    });
    if (hint.candidates.length > 0) setDedup({ hint, newContactId: contact.id });
  }

  return (
    <div className="flex flex-col gap-4">
      {canLink && (
        <ContactSearch
          orgId={orgId}
          excludeIds={excludeIds}
          onLinkExisting={linkExisting}
          onCreated={handleCreated}
          company={company}
        />
      )}

      {dedup && (
        <DedupHint
          hint={dedup.hint}
          canMerge={canMerge}
          onMerge={(candidateId) => {
            merge.mutate({ targetId: candidateId, sourceId: dedup.newContactId });
            setDedup(null);
          }}
          onDismiss={() => setDedup(null)}
        />
      )}

      {contacts.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
          <Users className="h-8 w-8" />
          <p>{t("contacts.list.empty")}</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {contacts.map((contact) => (
            <li key={contact.contactId}>
              <Card
                className={cn(
                  "flex flex-col gap-2 p-3",
                  dedupHighlight?.has(contact.contactId) && "border-amber-500/50 ring-1 ring-amber-500/30",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{contact.name}</p>
                    {/* Строка всегда занимает место (redesign): без плейсхолдера карточки без
                        email/компании были ниже соседних — сетка выглядела рваной. */}
                    <p className="text-xs text-muted-foreground">
                      {[contact.email, contact.phone, contact.companyName].filter(Boolean).join(" · ") || " "}
                    </p>
                  </div>
                  {canUnlink && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-auto shrink-0 px-1.5 py-0.5 text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => unlink.mutate({ contactId: contact.contactId })}
                    >
                      {t("contacts.list.unlink")}
                    </Button>
                  )}
                </div>
                <DealRoleChips
                  roles={contact.roles}
                  audience={audience}
                  disabled={!canEditRoles}
                  onToggle={(role) => {
                    const roles = contact.roles.includes(role)
                      ? contact.roles.filter((r) => r !== role)
                      : [...contact.roles, role];
                    updateRoles.mutate({ contactId: contact.contactId, roles });
                  }}
                />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
