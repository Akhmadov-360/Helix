import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Building2, Mail, Phone, Plus, Users } from "lucide-react";
import type { Audience, CompanyResponse, ContactResponse, DedupHint as DedupHintData } from "@helix/api-schemas";
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@helix/ui";
import { useCan } from "../../shared/auth/ability";
import { EmptyState } from "../../shared/components/empty-state";
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
  // Пока контактов нет — поиск открыт сразу (нечего показывать взамен). Как только хотя бы один
  // привязан, сворачиваем его за "+ Привязать контакт": постоянно видимая строка поиска+подсказки
  // компании раньше отнимала место на каждом лиде, даже когда все нужные контакты уже добавлены.
  const [searching, setSearching] = useState(false);

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

  // Empty state (contacts.length === 0): ContactSearch inline — поиск ЕСТЬ основная задача,
  // отдельный dialog поверх пустой панели избыточен, будет двойная обёртка.
  // Populated state: список + «+ Привязать контакт» → открывает Dialog с той же ContactSearch —
  // фокус-trap и явный dismiss (Esc/overlay) как дискретное действие, а не inline-раскрытие.
  const inlineSearch = canLink && contacts.length === 0;
  const dialogOpen = canLink && contacts.length > 0 && searching;

  return (
    <div className="flex flex-col gap-4">
      {inlineSearch && (
        <ContactSearch
          orgId={orgId}
          excludeIds={excludeIds}
          onLinkExisting={linkExisting}
          onCreated={handleCreated}
          company={company}
        />
      )}
      {!inlineSearch && canLink && (
        <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setSearching(true)}>
          <Plus className="h-3.5 w-3.5" />
          {t("contacts.search.linkTrigger")}
        </Button>
      )}
      <Dialog open={dialogOpen} onOpenChange={(open) => setSearching(open)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("contacts.search.linkTrigger")}</DialogTitle>
            <DialogDescription>{t("contacts.search.dialogDescription")}</DialogDescription>
          </DialogHeader>
          <ContactSearch
            orgId={orgId}
            excludeIds={excludeIds}
            onLinkExisting={(contact) => {
              linkExisting(contact);
              setSearching(false);
            }}
            onCreated={(contact, hint) => {
              handleCreated(contact, hint);
              setSearching(false);
            }}
            // Внутри диалога autoFocus нужен (Radix переносит фокус на первый tabbable — это
            // подойдёт, но `autoFocus={Boolean(onCancel)}` в ContactSearch завязан на этот проп).
            // Dialog X-close и Esc уже дают путь наружу — свою inline-X от ContactSearch скрываем
            // (передаём noop-onCancel), чтобы не дублировать dismiss внутри уже дискретного модала.
            onCancel={() => setSearching(false)}
            company={company}
          />
        </DialogContent>
      </Dialog>

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
        // ContactSearch выше уже даёт конкретное следующее действие (dedup-подсказка по компании
        // включительно) — дублировать его нейтральной заглушкой излишне (design review). Ключим по
        // inlineSearch, не по company: так же закрывает случай "есть company, но нет прав линковать"
        // (canLink=false), который раньше не показывал вообще ничего.
        !inlineSearch && (
          <EmptyState icon={Users} title={t("contacts.list.empty")} description={t("contacts.list.emptyDescription")} />
        )
      ) : (
        // Flat-list с divide-y вместо per-row Card (design review): убираем card-in-card обёртки —
        // один внешний контейнер + разделители между строками читаются плотнее и не рассыпаются
        // на равнозначные плитки. dedup-подсветка теперь через мягкий фон строки, не ring вокруг.
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {contacts.map((contact) => (
            <li
              key={contact.contactId}
              className={cn(
                "flex flex-col gap-2 px-4 py-3 transition-colors",
                dedupHighlight?.has(contact.contactId) && "bg-amber-500/5",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{contact.name}</p>
                  {/* Иконки email/phone/company перед значением — при 3+ типах данных подряд одни
                      разделители «·» плохо парсились глазом; иконка сразу говорит «это email». */}
                  <ContactMeta email={contact.email} phone={contact.phone} companyName={contact.companyName} />
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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Мета-строка контакта: email/phone/company с иконками. Каждое поле опционально; ничего не
// показывается если пусто (плейсхолдер пропадает — плотнее список). truncate на самой строке —
// длинный email не должен ломать layout.
function ContactMeta({
  email,
  phone,
  companyName,
}: {
  email: string | null | undefined;
  phone: string | null | undefined;
  companyName: string | null | undefined;
}) {
  const items: Array<{ icon: typeof Mail; label: string }> = [];
  if (email) items.push({ icon: Mail, label: email });
  if (phone) items.push({ icon: Phone, label: phone });
  if (companyName) items.push({ icon: Building2, label: companyName });
  if (items.length === 0) return null;
  return (
    <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
      {items.map(({ icon: Icon, label }) => (
        <span key={label} className="inline-flex min-w-0 items-center gap-1">
          <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{label}</span>
        </span>
      ))}
    </div>
  );
}
