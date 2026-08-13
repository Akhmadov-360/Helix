import { useState } from "react";
import { Check, ChevronsUpDown, Tag as TagIcon, X } from "lucide-react";
import { Button, Input, Popover, PopoverContent, PopoverTrigger, cn } from "@helix/ui";
import { useT } from "../../shared/i18n";
import { tagColorClass } from "./tag-color";

// design review: "Строгий инпут для тегов — пользователю приходится угадывать, какие теги
// вообще существуют". Combobox с автокомплитом по УЖЕ СУЩЕСТВУЮЩИМ тегам (knownTags — собраны
// из уже загруженного списка статей, см. kb-list-view.tsx, тот же "candidates из того, что уже на
// экране" приём, что wiki-ссылки/@-упоминания) — не свободный текст, только выбор из реальных.
// Single-select (не multi): backend §7 фильтрует по одному tag= — расширение до multi-tag AND
// потребовало бы менять контракт listKbArticlesQuerySchema, за пределами этого прохода.
export function TagFilterSelect({
  value,
  onChange,
  knownTags,
}: {
  value: string;
  onChange: (tag: string) => void;
  knownTags: string[];
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filtered = knownTags.filter((tag) => tag.toLowerCase().includes(query.toLowerCase()));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-48 justify-between font-normal", !value && "text-muted-foreground")}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <TagIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{value || t("kb.page.tagPlaceholder")}</span>
          </span>
          {value ? (
            <X
              className="h-3.5 w-3.5 shrink-0 opacity-60 hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
            />
          ) : (
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1.5" align="start">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("kb.page.tagSearchPlaceholder")}
          className="mb-1.5 h-8"
          autoFocus
        />
        <div className="max-h-56 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">{t("kb.page.noTagsFound")}</p>
          ) : (
            filtered.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => {
                  onChange(tag === value ? "" : tag);
                  setOpen(false);
                  setQuery("");
                }}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                <Check className={cn("h-3.5 w-3.5 shrink-0", tag === value ? "opacity-100" : "opacity-0")} />
                <span className={cn("truncate rounded-full px-2 py-0.5 text-xs", tagColorClass(tag))}>{tag}</span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
