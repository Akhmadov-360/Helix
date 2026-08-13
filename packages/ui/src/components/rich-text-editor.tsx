import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, ReactRenderer, type Editor, type JSONContent } from "@tiptap/react";
import { TableKit } from "@tiptap/extension-table";
import Placeholder from "@tiptap/extension-placeholder";
import Mention from "@tiptap/extension-mention";
import StarterKit from "@tiptap/starter-kit";
import { Bold, FileText, Heading2, Italic, Link2, List, ListOrdered, Table as TableIcon } from "lucide-react";
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import type { DOMOutputSpec, Node as ProseMirrorNode } from "@tiptap/pm/model";
import { cn } from "../lib/cn";
import { Button } from "./button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

// Тип пакета Mention требует DOMOutputSpec, но собственная реализация renderHTML по умолчанию (см.
// комментарий у Mention.extend ниже) в рантайме возвращает строку — этот alias используется, чтобы
// явно закастовать наш renderHTML к типу пакета, не разбирая внутренние generic-параметры Mention.
type MentionRenderHTML = (props: { node: ProseMirrorNode }) => DOMOutputSpec;

export interface RichTextEditorProps {
  /** pages-kb.md §1 — TipTap-документ как есть, форма не валидируется на фронте (источник — TipTap). */
  content?: Record<string, unknown>;
  onChange?: (content: Record<string, unknown>) => void;
  editable?: boolean;
  placeholder?: string;
  className?: string;
  /** Wiki-ссылки ("[["): страницы этого же проекта, доступные для связывания. */
  pageLinkCandidates?: { id: string; title: string }[];
  onNavigateToPage?: (pageId: string) => void;
  /** i18n тулбара — компонент в packages/ui без доступа к i18n приложения (см. sendLabel у
   * MentionTextarea, тот же приём): без пропа остаётся английский дефолт, не ломает KB/др. вызовы. */
  toolbarLabels?: Partial<RichTextToolbarLabels>;
}

interface RichTextToolbarLabels {
  heading: string;
  bold: string;
  italic: string;
  bulletList: string;
  orderedList: string;
  table: string;
  pageLink: string;
  pageLinkTooltip: string;
}

const DEFAULT_TOOLBAR_LABELS: RichTextToolbarLabels = {
  heading: "Heading",
  bold: "Bold",
  italic: "Italic",
  bulletList: "Bullet list",
  orderedList: "Numbered list",
  table: "Insert table",
  pageLink: "Link to page",
  pageLinkTooltip: 'Link to another page — type "[[" and pick from the list',
};

interface PageLinkItem {
  id: string;
  title: string;
}

interface PageLinkListProps {
  items: PageLinkItem[];
  command: (item: { id: string; label: string }) => void;
}
interface PageLinkListHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

const PageLinkList = forwardRef<PageLinkListHandle, PageLinkListProps>(function PageLinkList(
  { items, command },
  ref,
) {
  const [selected, setSelected] = useState(0);
  // Сброс выбора на новый список кандидатов — "adjusting state during render" (без лишнего
  // re-render, который дал бы useEffect): https://react.dev/learn/you-might-not-need-an-effect
  const [prevItems, setPrevItems] = useState(items);
  if (items !== prevItems) {
    setPrevItems(items);
    setSelected(0);
  }

  const select = useCallback(
    (index: number) => {
      const item = items[index];
      if (item) command({ id: item.id, label: item.title });
    },
    [items, command],
  );

  useImperativeHandle(
    ref,
    () => ({
      onKeyDown: ({ event }) => {
        // Пустой список кандидатов (KB — pageLinkCandidates не передаётся; или запрос не совпал
        // ни с одной страницей) — не перехватывать клавишу, иначе Enter/стрелки молча "проглатываются"
        // вместо обычного поведения редактора (найдено code review).
        if (items.length === 0) return false;
        if (event.key === "ArrowUp") {
          setSelected((i) => (i + items.length - 1) % items.length);
          return true;
        }
        if (event.key === "ArrowDown") {
          setSelected((i) => (i + 1) % items.length);
          return true;
        }
        if (event.key === "Enter") {
          select(selected);
          return true;
        }
        return false;
      },
    }),
    [items.length, select, selected],
  );

  if (items.length === 0) return null;

  return (
    <div className="w-64 overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
      {items.map((item, i) => (
        <button
          key={item.id}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => select(i)}
          className={cn(
            "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
            i === selected ? "bg-accent text-accent-foreground" : "hover:bg-muted",
          )}
        >
          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{item.title}</span>
        </button>
      ))}
    </div>
  );
});

// Тот же manual-portal-div приём, что createSuggestionRenderer в mention-textarea.tsx (см. её
// комментарий — единственный потребитель, tippy.js ради одного попапа не оправдан). "[[" вместо
// "@" — @tiptap/suggestion строит regex по произвольной строке-триггеру, не только по одному символу.
function createPageLinkSuggestionRenderer(suggestionOpenRef: { current: boolean }) {
  return () => {
    let component: ReactRenderer<PageLinkListHandle, PageLinkListProps>;
    let popup: HTMLDivElement;
    const POPUP_MAX_HEIGHT = 260;

    const position = (clientRect: (() => DOMRect | null) | null | undefined) => {
      const rect = clientRect?.();
      if (!rect || !popup) return;
      const spaceBelow = window.innerHeight - rect.bottom;
      const showAbove = spaceBelow < POPUP_MAX_HEIGHT + 8 && rect.top > spaceBelow;
      popup.style.left = `${rect.left}px`;
      if (showAbove) {
        popup.style.top = "";
        popup.style.bottom = `${window.innerHeight - rect.top + 4}px`;
      } else {
        popup.style.bottom = "";
        popup.style.top = `${rect.bottom + 4}px`;
      }
    };

    return {
      onStart: (props: SuggestionProps<PageLinkItem>) => {
        suggestionOpenRef.current = true;
        component = new ReactRenderer(PageLinkList, {
          props: { items: props.items as PageLinkItem[], command: props.command },
          editor: props.editor as Editor,
        });
        popup = document.createElement("div");
        popup.style.position = "fixed";
        popup.style.zIndex = "50";
        document.body.appendChild(popup);
        popup.appendChild(component.element);
        position(props.clientRect);
      },
      onUpdate: (props: SuggestionProps<PageLinkItem>) => {
        component.updateProps({ items: props.items as PageLinkItem[], command: props.command });
        position(props.clientRect);
      },
      onKeyDown: (props: SuggestionKeyDownProps) => {
        if (props.event.key === "Escape") {
          suggestionOpenRef.current = false;
          popup.remove();
          return true;
        }
        return component.ref?.onKeyDown(props) ?? false;
      },
      onExit: () => {
        suggestionOpenRef.current = false;
        popup.remove();
        component.destroy();
      },
    };
  };
}

// Заголовки/списки/таблица/bold/italic — ровно то, что просит FR-PG-1 ("headings/lists/tables"),
// НЕ весь StarterKit-набор: blockquote/codeBlock/horizontalRule выключены — нет запроса на них,
// заводить площадь редактора "на всякий случай" незачем (CLAUDE.md — не создавать спекулятивно).
//
// key={pageId}-паттерн у вызывающего кода: content — только НАЧАЛЬНОЕ содержимое (useEditor читает
// его один раз при монтировании). Переключение на другой Page/KBArticle должно ремонтировать
// компонент новым key, а не полагаться на реактивное обновление content-пропа.
export function RichTextEditor({
  content,
  onChange,
  editable = true,
  placeholder,
  className,
  pageLinkCandidates,
  onNavigateToPage,
  toolbarLabels,
}: RichTextEditorProps) {
  const labels = { ...DEFAULT_TOOLBAR_LABELS, ...toolbarLabels };
  // Suggestion.items — не-реактивный колбэк расширения (конфигурируется один раз при создании
  // editor), тот же приём, что candidatesRef в mention-textarea.tsx — ref читается только внутри
  // Suggestion-колбэков (items/onStart/onUpdate), которые TipTap вызывает вне цикла рендера React.
  const candidatesRef = useRef(pageLinkCandidates ?? []);
  useEffect(() => {
    candidatesRef.current = pageLinkCandidates ?? [];
  }, [pageLinkCandidates]);
  const suggestionOpenRef = useRef(false);
  const onNavigateRef = useRef(onNavigateToPage);
  useEffect(() => {
    onNavigateRef.current = onNavigateToPage;
  }, [onNavigateToPage]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      TableKit.configure({ table: { resizable: false } }),
      // Плейсхолдер на пустом документе (не на каждом пустом параграфе — showOnlyWhenEditable
      // + дефолтный emptyNodeClass достаточно для "первая строка пуста", того же приёма, что уже
      // работает в mention-textarea.tsx, CSS уже есть в globals.css).
      Placeholder.configure({ placeholder: placeholder ?? "" }),
      // Wiki-ссылки: Mention.extend вместо нового Node с нуля — переиспользуем Suggestion-плагин
      // Mention целиком (Suggestion строит regex по строке-триггеру, не только по 1 символу, так
      // что "[[" работает так же, как "@"), другой class различает рендер (.page-link vs .mention).
      // refs (candidatesRef/suggestionOpenRef) читаются только внутри колбэков items/render, которые
      // ProseMirror вызывает вне цикла рендера React — react-hooks/refs не умеет это доказать статически.
      // eslint-disable-next-line react-hooks/refs
      Mention.extend({ name: "pageLink" }).configure({
        HTMLAttributes: { class: "page-link" },
        // Дефолт Mention рендерит "{suggestion.char}{label}" и в тексте, и в DOM (renderHTML —
        // отдельная опция от renderText, не выводится одна из другой) — без обеих переопределений
        // видимая ссылка показывала бы буквально "[[Название".
        renderText: ({ node }) => (node.attrs.label as string) ?? "",
        // Тип пакета требует DOMOutputSpec (см. prosemirror-model: строка сама по себе туда не входит,
        // только как ребёнок ["tag", ...]), но собственная реализация Mention.renderHTML (см.
        // node_modules/@tiptap/extension-mention) в рантайме именно возвращает строку и САМА оборачивает
        // её в span с нужными data-type/class атрибутами — типизация пакета этому не соответствует
        // (апстрим-неточность); возврат массива обошёл бы это оборачивание и потерял бы атрибуты.
        renderHTML: (({ node }: { node: ProseMirrorNode }) =>
          (node.attrs.label as string) ?? "") as unknown as MentionRenderHTML,
        suggestion: {
          char: "[[",
          items: ({ query }: { query: string }) =>
            candidatesRef.current
              .filter((c) => c.title.toLowerCase().includes(query.toLowerCase()))
              .slice(0, 8),
          // eslint-disable-next-line react-hooks/refs -- см. комментарий выше
          render: createPageLinkSuggestionRenderer(suggestionOpenRef),
        },
      }),
    ],
    content: content as JSONContent | undefined,
    editable,
    immediatelyRender: true,
    onUpdate: ({ editor: e }) => onChange?.(e.getJSON()),
    editorProps: {
      attributes: {
        class: cn(
          "tiptap min-h-[240px] rounded-md px-3 py-2 text-sm focus:outline-none",
          !editable && "px-0 py-0",
        ),
      },
      // Клик по wiki-ссылке — переход, не редактирование; data-type проставляет базовый
      // Mention.renderHTML ("pageLink" — имя extend'а), data-id — конкретная страница.
      handleClick: (_view, _pos, event) => {
        const target = (event.target as HTMLElement).closest('[data-type="pageLink"]');
        const id = target?.getAttribute("data-id");
        if (id) {
          onNavigateRef.current?.(id);
          return true;
        }
        return false;
      },
    },
  });

  useEffect(() => {
    if (editor && editor.isEditable !== editable) editor.setEditable(editable);
  }, [editor, editable]);

  if (!editor) return null;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {editable && (
        <RichTextToolbar editor={editor} showPageLink={onNavigateToPage !== undefined} labels={labels} />
      )}
      <EditorContent editor={editor} />
    </div>
  );
}

function RichTextToolbar({
  editor,
  showPageLink,
  labels,
}: {
  editor: Editor;
  showPageLink: boolean;
  labels: RichTextToolbarLabels;
}) {
  // useEditorState вместо editor.isActive() напрямую в теле рендера: toggleBold/toggleItalic на
  // пустом выделении меняют только storedMarks (транзакция без изменения doc) — onUpdate у useEditor
  // на это не срабатывает, поэтому без подписки на транзакции кнопка "не подсвечивалась сразу при
  // нажатии, только после того как начинаешь печатать" (design review).
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      heading: e.isActive("heading", { level: 2 }),
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      bulletList: e.isActive("bulletList"),
      orderedList: e.isActive("orderedList"),
      table: e.isActive("table"),
    }),
  });

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border pb-2">
      <ToolbarButton
        active={state.heading}
        label={labels.heading}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        active={state.bold}
        label={labels.bold}
        shortcut="Ctrl+B"
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        active={state.italic}
        label={labels.italic}
        shortcut="Ctrl+I"
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        active={state.bulletList}
        label={labels.bulletList}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        active={state.orderedList}
        label={labels.orderedList}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        active={state.table}
        label={labels.table}
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
      >
        <TableIcon className="h-4 w-4" />
      </ToolbarButton>
      {showPageLink && (
        <ToolbarButton
          active={false}
          label={labels.pageLink}
          tooltip={labels.pageLinkTooltip}
          onClick={() => editor.chain().focus().insertContent("[[").run()}
        >
          <Link2 className="h-4 w-4" />
        </ToolbarButton>
      )}
    </div>
  );
}

function ToolbarButton({
  active,
  label,
  shortcut,
  tooltip,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  shortcut?: string;
  tooltip?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          aria-pressed={active}
          // variant="secondary" (нейтральный серый) был неотличим от ghost:hover (тоже серый) —
          // design review: "непонятно, применяется или нет, отличается только при наведении".
          // primary-тонированная заливка однозначна независимо от курсора: hover всегда серый,
          // active всегда цветной, эти два состояния больше не могут визуально совпасть.
          className={cn(active && "bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary")}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip ?? (shortcut ? `${label} (${shortcut})` : label)}</TooltipContent>
    </Tooltip>
  );
}
