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

// Ближайший реально скроллящийся предок — не хардкодим "main": KbDetailView заводит свою
// unpadded overflow-y-auto колонку (тот же приём, что уже был у PageDetailView), чтобы sticky-
// тулбар RichTextEditor не упирался в padding <main> (design review: "текст, проскроллированный
// под тулбар, был виден сквозь него" — sticky top:0 меряется от padding-box ближайшего реального
// скролл-предка, а не от истинного края вьюпорта; padding на <main> сдвигал точку прилипания).
function closestScrollable(el: HTMLElement): HTMLElement | Window {
  let node: HTMLElement | null = el.parentElement;
  while (node) {
    if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)) return node;
    node = node.parentElement;
  }
  return window;
}

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

    const scrollParent = closestScrollable(container);

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
