import { useState } from "react";

// Keyset-пагинация (companies.repository.ts §2): "next" — реальный cursorId с бэка, "prev" —
// просто снять верх уже пройденного стека (клиент сам был на той странице, курсор знает).
// resetKey — фильтр/pageSize: смена любого из них делает старые cursorId нерелевантными текущей
// выборке, стек обнуляется на страницу 1.
//
// Сброс — "adjusting state during render" (react.dev), не useEffect: setState в эффекте на смену
// resetKey даёт лишний холостой рендер со старым стеком перед сбросом; здесь же React перезапускает
// рендер немедленно, без коммита промежуточного состояния.
export function useCursorPagination(resetKey: unknown) {
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [pageIndex, setPageIndex] = useState(0);
  const [prevResetKey, setPrevResetKey] = useState(resetKey);

  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey);
    setCursors([undefined]);
    setPageIndex(0);
  }

  return {
    cursorId: cursors[pageIndex],
    page: pageIndex + 1,
    hasPrev: pageIndex > 0,
    goPrev: () => setPageIndex((i) => Math.max(0, i - 1)),
    goNext: (nextCursorId: string) => {
      setCursors((prev) => [...prev.slice(0, pageIndex + 1), nextCursorId]);
      setPageIndex((i) => i + 1);
    },
  };
}
