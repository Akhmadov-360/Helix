import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Avatar, avatarVariants, cn, Popover, PopoverContent, PopoverTrigger } from "@helix/ui";

// Тот же avatar-стек, что у ассайни (project-card.tsx MAX_VISIBLE_ASSIGNEES), но для КОНТАКТОВ
// сделки (ProjectContact — внешние люди, не co-workers) — design review: сам стек это
// Popover-триггер, клик открывает полный список с именами. Общий на board TableView + ProjectCard
// (один фичевый модуль — дублировать незачем); companies-view.tsx держит свою копию отдельно —
// разные фичи, features/* друг друга не импортируют (композиция на уровне routes/).
const MAX_VISIBLE_CONTACTS = 3;

export function ContactsAvatarPopover({ contacts }: { contacts: Array<{ id: string; name: string }> }) {
  const [open, setOpen] = useState(false);

  if (contacts.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="flex -space-x-2" onClick={(e) => e.stopPropagation()}>
          {contacts.slice(0, MAX_VISIBLE_CONTACTS).map((contact) => (
            <Avatar key={contact.id} name={contact.name} size="sm" className="ring-2 ring-card" />
          ))}
          {contacts.length > MAX_VISIBLE_CONTACTS && (
            <span className={cn(avatarVariants({ size: "sm" }), "ring-2 ring-card")}>
              +{contacts.length - MAX_VISIBLE_CONTACTS}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex max-h-64 w-56 flex-col gap-0.5 overflow-y-auto p-2">
        {contacts.map((contact) => (
          <Link
            key={contact.id}
            to="/contacts/$contactId"
            params={{ contactId: contact.id }}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted hover:text-accent"
          >
            <Avatar name={contact.name} size="sm" />
            <span className="truncate">{contact.name}</span>
          </Link>
        ))}
      </PopoverContent>
    </Popover>
  );
}
