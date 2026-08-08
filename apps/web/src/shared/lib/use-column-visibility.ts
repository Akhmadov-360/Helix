import { useState } from "react";

// Видимость колонок — per-view настройка UI, не доменная сущность (нет SavedView/TableViewPreference
// в schema.prisma — сознательно, см. project-auth… нет, см. критику таблиц: сохранённые вьюхи это
// отдельная веха). localStorage — ровно тот объём персистентности, который заслуживает "запомнить,
// какие колонки я скрыл в этом браузере", не более.
export function useColumnVisibility(storageKey: string) {
  const key = `helix:columns:${storageKey}`;
  const [hidden, setHidden] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });

  function toggle(columnKey: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(columnKey)) {
        next.delete(columnKey);
      } else {
        next.add(columnKey);
      }
      try {
        localStorage.setItem(key, JSON.stringify([...next]));
      } catch {
        // localStorage недоступен (приватный режим и т.п.) — видимость просто не переживёт reload
      }
      return next;
    });
  }

  return { isVisible: (columnKey: string) => !hidden.has(columnKey), toggle };
}
