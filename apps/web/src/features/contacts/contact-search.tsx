import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Search } from "lucide-react";
import type { ContactResponse, DedupHint } from "@helix/api-schemas";
import { Button, Card, Input } from "@helix/ui";
import { useT } from "../../shared/i18n";
import { companyContactsQueryOptions, contactSearchQueryOptions } from "./queries";
import { CreateContactForm } from "./create-contact-form";

// company — деал этой карточки привязан к компании (design review): пока поле поиска пустое,
// показываем контактов ИЗ ЭТОЙ компании как подсказку рядом со строкой поиска, не только по
// явному запросу — самый частый следующий шаг ("привязать ещё людей из той же компании") не
// должен требовать печатать её название. Как только юзер начал печатать — обычный typeahead.
export function ContactSearch({
  orgId,
  excludeIds,
  onLinkExisting,
  onCreated,
  company,
}: {
  orgId: string;
  excludeIds: Set<string>;
  onLinkExisting: (contact: ContactResponse) => void;
  onCreated: (contact: ContactResponse, dedupHint: DedupHint) => void;
  company?: { id: string; name: string };
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const showingCompanySuggestions = Boolean(company) && debounced.trim().length === 0;
  // enabled переопределяем целиком (не спред) — исходный "непустой q" из queries.ts иначе
  // затирался бы этим же ключом: без company showingCompanySuggestions всегда false, и поиск
  // летел бы с q="" при каждом открытии диалога (400 от бэка, x3 из-за retry React Query).
  const search = useQuery({
    ...contactSearchQueryOptions(orgId, debounced),
    enabled: !showingCompanySuggestions && debounced.trim().length > 0,
  });
  const companyContacts = useQuery({
    ...companyContactsQueryOptions(orgId, company?.id ?? ""),
    enabled: showingCompanySuggestions,
  });

  const activeQuery = showingCompanySuggestions ? companyContacts : search;
  const results = (activeQuery.data?.contacts ?? []).filter((c) => !excludeIds.has(c.id));

  if (creating) {
    return (
      <CreateContactForm
        orgId={orgId}
        initialName={query}
        onDone={(contact, dedupHint) => {
          setCreating(false);
          setQuery("");
          onCreated(contact, dedupHint);
        }}
        onCancel={() => setCreating(false)}
      />
    );
  }

  return (
    <div className="flex max-w-lg flex-col gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("contacts.search.placeholder")}
          className="pl-9"
        />
      </div>
      {showingCompanySuggestions && results.length > 0 && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Building2 className="h-3 w-3" />
          {t("contacts.search.fromCompany", { name: company?.name ?? "" })}
        </p>
      )}
      {(debounced.trim().length > 0 || (showingCompanySuggestions && results.length > 0)) && (
        <Card className="scroll-slim flex max-h-64 flex-col divide-y divide-border overflow-y-auto p-1">
          {results.map((contact) => (
            <button
              key={contact.id}
              type="button"
              onClick={() => onLinkExisting(contact)}
              className="flex flex-col items-start px-2 py-1.5 text-left text-sm hover:bg-muted"
            >
              <span className="font-medium">{contact.name}</span>
              {/* Приоритет: телефон, иначе email (design review) — контакту звонят чаще, чем пишут. */}
              {(contact.phone ?? contact.email) && (
                <span className="text-xs text-muted-foreground">{contact.phone ?? contact.email}</span>
              )}
            </button>
          ))}
          {!showingCompanySuggestions && !search.isFetching && results.length === 0 && (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">{t("contacts.search.noResults")}</p>
          )}
          {!showingCompanySuggestions && (
            <Button variant="ghost" size="sm" className="justify-start" onClick={() => setCreating(true)}>
              {t("contacts.search.createNew", { query })}
            </Button>
          )}
        </Card>
      )}
    </div>
  );
}
