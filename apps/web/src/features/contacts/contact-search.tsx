import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Sparkles, X } from "lucide-react";
import type { ContactResponse, DedupHint } from "@helix/api-schemas";
import { Button, Card, cn, Input } from "@helix/ui";
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
  onCancel,
  company,
}: {
  orgId: string;
  excludeIds: Set<string>;
  onLinkExisting: (contact: ContactResponse) => void;
  onCreated: (contact: ContactResponse, dedupHint: DedupHint) => void;
  /** Опционален — сам компонент решает, нужна ли кнопка закрытия (пусто при "контактов ещё нет",
   *  где поиск открыт всегда и закрывать нечем, см. ContactsView). */
  onCancel?: () => void;
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
          autoFocus={Boolean(onCancel)}
          className={cn("pl-9", onCancel && "pr-9")}
        />
        {/* Раньше это была текстовая ссылка ПОД карточкой результатов (design review, screen 9) —
            при длинном списке совпадений её приходилось искать глазами. Кнопка в самой строке
            поиска — всегда на виду, без скролла, независимо от того, сколько результатов ниже. */}
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            aria-label={t("contacts.search.cancel")}
            className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {showingCompanySuggestions && results.length > 0 && (
        // Elevated callout вместо тонкой строки-подписи: сильнее сигналит «есть готовые кандидаты
        // от компании этой сделки — можно привязать в один клик, не печатая». Sparkle-иконка +
        // accent-border-left — визуальный «умный» hint, не просто заголовок раздела. count в
        // тексте: юзер видит масштаб (2 или 20 контактов), не открывая список.
        <div className="flex items-start gap-2 rounded-md border-l-2 border-accent bg-accent/5 px-3 py-2 text-xs">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
          <p className="min-w-0 text-foreground">
            {t("contacts.search.fromCompany", { name: company?.name ?? "" })}{" "}
            <span className="text-muted-foreground">
              {t("contacts.search.fromCompanyCount", { count: results.length })}
            </span>
          </p>
        </div>
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
          {/* "Создать" — только когда поиск реально ничего не нашёл (design review, screen 9):
              показывать его рядом с уже найденным совпадением создавало ложное впечатление, что
              искомый контакт не существует, хотя он прямо над этой кнопкой. */}
          {!showingCompanySuggestions && !search.isFetching && results.length === 0 && (
            <>
              <p className="px-2 py-1.5 text-sm text-muted-foreground">{t("contacts.search.noResults")}</p>
              <Button variant="ghost" size="sm" className="justify-start" onClick={() => setCreating(true)}>
                {t("contacts.search.createNew", { query })}
              </Button>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
