import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { Audience, ContactResponse, DedupHint as DedupHintData } from "@helix/api-schemas";
import { Card } from "@helix/ui";
import { useCan } from "../../shared/auth/ability";
import { useT } from "../../shared/i18n";
import { AssigneesSection } from "./assignees-view";
import { ContactSearch } from "./contact-search";
import { DealRoleChips } from "./deal-role-chips";
import { DedupHint } from "./dedup-hint";
import { useLinkContact, useMergeContact, useUnlinkContact, useUpdateContactRoles } from "./mutations";
import { projectContactsQueryOptions } from "./queries";

// audience приходит пропом, не собственным запросом воркспейса: features/* не импортируют друг
// друга напрямую (composition на уровне routes/, скелет apps/web §2) — маршрут contacts.tsx уже
// грузит workspace ради этого и передаёт audience сюда.
export function ContactsView({
  orgId,
  projectId,
  audience,
}: {
  orgId: string;
  projectId: string;
  audience: Audience;
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

  function linkExisting(contact: ContactResponse) {
    link.mutate({
      contactId: contact.id,
      roles: [],
      optimistic: { contactId: contact.id, name: contact.name, email: contact.email },
    });
  }

  function handleCreated(contact: ContactResponse, hint: DedupHintData) {
    link.mutate({
      contactId: contact.id,
      roles: [],
      optimistic: { contactId: contact.id, name: contact.name, email: contact.email },
    });
    if (hint.candidates.length > 0) setDedup({ hint, newContactId: contact.id });
  }

  return (
    <div className="flex flex-col gap-4">
      {canLink && (
        <ContactSearch orgId={orgId} excludeIds={excludeIds} onLinkExisting={linkExisting} onCreated={handleCreated} />
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
        <p className="text-muted-foreground">{t("contacts.list.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {contacts.map((contact) => (
            <li key={contact.contactId}>
              <Card className="flex flex-col gap-2 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{contact.name}</p>
                    {(contact.email ?? contact.companyName) && (
                      <p className="text-xs text-muted-foreground">
                        {[contact.email, contact.companyName].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  {canUnlink && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => unlink.mutate({ contactId: contact.contactId })}
                    >
                      {t("contacts.list.unlink")}
                    </button>
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

      <AssigneesSection orgId={orgId} projectId={projectId} />
    </div>
  );
}
