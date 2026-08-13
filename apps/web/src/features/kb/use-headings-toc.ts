import { useEffect, useState, type RefObject } from "react";

export interface TocHeading {
  index: number;
  level: number;
  text: string;
}

const HEADING_SELECTOR = ".tiptap h2, .tiptap h3";
// Отступ "активной зоны" от верха скролл-контейнера — заголовок считается текущим, когда его
// верх пересёк эту линию (не строго 0, чтобы заголовок подсвечивался чуть раньше, пока читаемый
// текст ещё виден под ним, а не только в момент когда он уже скрылся за верхним краем).
const ACTIVE_THRESHOLD_PX = 96;

// Свой лёгкий ToC (design review — без @tiptap/extension-table-of-contents: единственный
// потребитель, новая зависимость не оправдана). После рендера сканирует .tiptap h2/h3 по DOM
// (не по TipTap JSON — проще и надёжнее для scrollIntoView, узел и DOM-элемент гарантированно
// совпадают по порядку); MutationObserver — синхронизация при живом редактировании контента.
// activeIndex — scroll-spy (design review: "подсвечивать заголовок, в котором юзер находится"):
// последний заголовок, чей верх уже пересёк ACTIVE_THRESHOLD_PX от верха скролл-контейнера.
export function useHeadingsToc(containerRef: RefObject<HTMLElement | null>): {
  headings: TocHeading[];
  activeIndex: number;
  scrollToHeading: (index: number) => void;
} {
  const [headings, setHeadings] = useState<TocHeading[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Реальный скролл идёт на <main> (AppShell: overflow-y-auto), не на window — контент этой
    // страницы сам по себе не скроллится отдельно.
    const scrollParent = container.closest("main") ?? window;

    const scan = () => {
      const nodes = container.querySelectorAll<HTMLElement>(HEADING_SELECTOR);
      setHeadings(
        [...nodes].map((el, index) => ({
          index,
          level: el.tagName === "H2" ? 2 : 3,
          text: el.textContent?.trim() ?? "",
        })),
      );
    };

    const updateActive = () => {
      const nodes = container.querySelectorAll<HTMLElement>(HEADING_SELECTOR);
      const containerTop = scrollParent instanceof Element ? scrollParent.getBoundingClientRect().top : 0;
      let current = 0;
      nodes.forEach((el, index) => {
        if (el.getBoundingClientRect().top - containerTop <= ACTIVE_THRESHOLD_PX) current = index;
      });
      setActiveIndex(current);
    };

    scan();
    updateActive();
    const observer = new MutationObserver(() => {
      scan();
      updateActive();
    });
    observer.observe(container, { childList: true, subtree: true, characterData: true });
    scrollParent.addEventListener("scroll", updateActive, { passive: true });
    return () => {
      observer.disconnect();
      scrollParent.removeEventListener("scroll", updateActive);
    };
  }, [containerRef]);

  function scrollToHeading(index: number) {
    const container = containerRef.current;
    if (!container) return;
    const nodes = container.querySelectorAll<HTMLElement>(HEADING_SELECTOR);
    nodes[index]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return { headings, activeIndex, scrollToHeading };
}
