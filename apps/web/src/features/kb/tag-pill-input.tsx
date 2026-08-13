import { useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@helix/ui";
import { useT } from "../../shared/i18n";
import { tagColorClass } from "./tag-color";

// design review: "Инпут тегов `onboarding, sales` выглядит как случайное поле ввода — редактирует
// через запятую, сбивает с толку". Бейджи с × для удаления + автокомплит по knownTags при вводе
// (тот же candidates-приём, что TagFilterSelect/wiki-ссылки — источник: уже загруженные статьи).
export function TagPillInput({
  tags,
  onChange,
  knownTags,
  disabled,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  knownTags: string[];
  disabled?: boolean;
}) {
  const t = useT();
  const [draft, setDraft] = useState("");
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = knownTags.filter(
    (tag) => !tags.includes(tag) && (draft.trim() === "" || tag.toLowerCase().includes(draft.trim().toLowerCase())),
  );

  function addTag(tag: string) {
    const trimmed = tag.trim();
    if (!trimmed || tags.includes(trimmed)) return;
    onChange([...tags, trimmed]);
    setDraft("");
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t2) => t2 !== tag));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(draft);
    } else if (e.key === "Backspace" && draft === "" && tags.length > 0) {
      removeTag(tags[tags.length - 1]!);
    }
  }

  return (
    <div className="relative">
      <div
        className={cn(
          "flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5",
          "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
          disabled && "cursor-not-allowed opacity-50",
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((tag) => (
          <span
            key={tag}
            className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", tagColorClass(tag))}
          >
            {tag}
            {!disabled && (
              <button
                type="button"
                aria-label={t("kb.detail.removeTag", { tag })}
                onClick={(e) => {
                  e.stopPropagation();
                  removeTag(tag);
                }}
                className="rounded-full hover:opacity-70"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
        {!disabled && (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setSuggestionsOpen(true)}
            onBlur={() => setTimeout(() => setSuggestionsOpen(false), 150)}
            placeholder={tags.length === 0 ? t("kb.detail.tagsPlaceholder") : ""}
            className="min-w-20 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        )}
      </div>
      {suggestionsOpen && suggestions.length > 0 && (
        <div className="absolute left-0 top-full z-10 mt-1 w-56 overflow-hidden rounded-md border border-border bg-popover p-1 shadow-md">
          {suggestions.slice(0, 8).map((tag) => (
            <button
              key={tag}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => addTag(tag)}
              className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
            >
              <span className={cn("truncate rounded-full px-2 py-0.5 text-xs", tagColorClass(tag))}>{tag}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
