import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import type { ContactResponse, DedupHint } from "@helix/api-schemas";
import { Button, Card, Input } from "@helix/ui";
import { useT } from "../../shared/i18n";
import { contactSearchQueryOptions } from "./queries";
import { CreateContactForm } from "./create-contact-form";

export function ContactSearch({
  orgId,
  excludeIds,
  onLinkExisting,
  onCreated,
}: {
  orgId: string;
  excludeIds: Set<string>;
  onLinkExisting: (contact: ContactResponse) => void;
  onCreated: (contact: ContactResponse, dedupHint: DedupHint) => void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const search = useQuery(contactSearchQueryOptions(orgId, debounced));
  const results = (search.data?.contacts ?? []).filter((c) => !excludeIds.has(c.id));

  if (creating) {
    return (
      <CreateContactForm
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
      {debounced.trim().length > 0 && (
        <Card className="flex flex-col divide-y divide-border p-1">
          {results.map((contact) => (
            <button
              key={contact.id}
              type="button"
              onClick={() => onLinkExisting(contact)}
              className="flex flex-col items-start px-2 py-1.5 text-left text-sm hover:bg-muted"
            >
              <span className="font-medium">{contact.name}</span>
              {contact.email && <span className="text-xs text-muted-foreground">{contact.email}</span>}
            </button>
          ))}
          {!search.isFetching && results.length === 0 && (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">{t("contacts.search.noResults")}</p>
          )}
          <Button variant="ghost" size="sm" className="justify-start" onClick={() => setCreating(true)}>
            {t("contacts.search.createNew", { query })}
          </Button>
        </Card>
      )}
    </div>
  );
}
