import { useState } from "react";

export interface TableSort<K extends string> {
  key: K;
  direction: "asc" | "desc";
}

// Toggle-логика ("клик по той же колонке — разворот, по другой — дефолт") была продублирована
// дословно в companies-view/global-contacts-view/board-table-view — сам компаратор остаётся в
// каждой вьюхе (поля и типы разные), но переключение направления — нет.
//
// getDefaultDirection — опционален: числовым/датным колонкам (сумма, дата создания) естественнее
// начинать с desc ("сначала крупные/новые"), а не asc, как строковым; board-table-view этим
// пользуется, companies/contacts — нет (везде default asc, аргумент не передают).
export function useTableSort<K extends string>(initial: TableSort<K>, getDefaultDirection?: (key: K) => "asc" | "desc") {
  const [sort, setSort] = useState<TableSort<K>>(initial);

  function toggleSort(key: K) {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: getDefaultDirection?.(key) ?? "asc" },
    );
  }

  return [sort, toggleSort] as const;
}
