import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  EditorContent,
  useEditor,
  useEditorState,
  ReactRenderer,
  Node,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  mergeAttributes,
  type Editor,
  type JSONContent,
  type NodeViewProps,
} from "@tiptap/react";
import { TableKit } from "@tiptap/extension-table";
import Placeholder from "@tiptap/extension-placeholder";
import Mention from "@tiptap/extension-mention";
import Heading from "@tiptap/extension-heading";
import StarterKit from "@tiptap/starter-kit";
import { Bold, FileText, Heading2, Italic, Link2, List, ListOrdered, Paperclip, Search, Table as TableIcon } from "lucide-react";
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import type { DOMOutputSpec, Node as ProseMirrorNode } from "@tiptap/pm/model";
import { cn } from "../lib/cn";
import { Button } from "./button";
import { Input } from "./input";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
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
  /** pages-kb.md §6 — embed-ссылки на файлы проекта: attachmentId+filename денормализованы в узел
   * (тот же приём, что label у wiki-ссылок), сам файл не резолвится при вставке/рендере. Кнопка в
   * тулбаре видна только когда проп передан (тот же гейт, что showPageLink у onNavigateToPage). */
  attachmentCandidates?: { id: string; filename: string }[];
  onDownloadAttachment?: (attachmentId: string) => void;
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
  insertFile: string;
  insertFileSearchPlaceholder: string;
  insertFileEmpty: string;
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
  insertFile: "Insert file",
  insertFileSearchPlaceholder: "Search files…",
  insertFileEmpty: "No files found",
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

// pages-kb.md §6 — embed-ссылка на файл: attachmentId+filename денормализованы в атрибуты узла
// (тот же приём, что label у wiki-ссылок), бэкенд content не парсит. Отдельная Node, не Mention.extend
// — вставляется явным выбором из пикера по клику на кнопку тулбара, не по триггер-символу при наборе
// текста (Suggestion здесь не нужен), поэтому не переиспользует Mention/Suggestion-инфраструктуру.
function AttachmentEmbedView({ node, extension }: NodeViewProps) {
  const attachmentId = node.attrs.attachmentId as string;
  const filename = node.attrs.filename as string;
  return (
    <NodeViewWrapper as="span" className="inline-block align-middle" contentEditable={false}>
      <button
        type="button"
        onClick={() => (extension.options.onDownload as (id: string) => void)(attachmentId)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1 text-sm hover:bg-accent"
      >
        <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="max-w-[220px] truncate">{filename}</span>
      </button>
    </NodeViewWrapper>
  );
}

const AttachmentEmbed = Node.create<{ onDownload: (attachmentId: string) => void }>({
  name: "attachmentEmbed",
  group: "inline",
  inline: true,
  atom: true,
  addOptions() {
    return { onDownload: () => {} };
  },
  addAttributes() {
    return {
      attachmentId: { default: null },
      filename: { default: "" },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-type="attachmentEmbed"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-type": "attachmentEmbed" })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(AttachmentEmbedView);
  },
});

interface AttachmentItem {
  id: string;
  filename: string;
}

// Кнопка тулбара → Popover-пикер (design review), не Suggestion-триггер по символу как у "[[":
// для файлов нет естественного текстового триггера, и список кандидатов приходит из отдельного
// запроса (Files-таб проекта), не из уже открытого документа — тот же Popover-паттерн, что
// TagFilterSelect в apps/web/features/kb.
function AttachmentPickerButton({
  editor,
  items,
  label,
  searchPlaceholder,
  emptyLabel,
}: {
  editor: Editor;
  items: AttachmentItem[];
  label: string;
  searchPlaceholder: string;
  emptyLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filtered = items.filter((item) => item.filename.toLowerCase().includes(query.toLowerCase()));

  function insert(item: AttachmentItem) {
    editor.chain().focus().insertContent({ type: "attachmentEmbed", attrs: { attachmentId: item.id, filename: item.filename } }).run();
    setOpen(false);
    setQuery("");
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        {/* onClick — no-op: открытие/закрытие ведёт PopoverTrigger (asChild клонирует свой onClick
            на этот span), ToolbarButton здесь — только визуальный триггер, не источник toggle. */}
        <span>
          <ToolbarButton active={open} label={label} onClick={() => {}}>
            <Paperclip className="h-4 w-4" />
          </ToolbarButton>
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-1.5" align="start">
        <div className="relative mb-1.5">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-8 pl-7"
            autoFocus
          />
        </div>
        <div className="scroll-slim max-h-56 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">{emptyLabel}</p>
          ) : (
            filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insert(item)}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{item.filename}</span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ProseMirror-дефолт на Enter внутри блока — splitBlock: делит узел на два ТОГО ЖЕ типа (heading
// → heading+heading), а не выходит в paragraph. Выход происходит только у ПУСТОГО блока (второй
// Enter) — с виду баг ("заголовок не деактивируется"), хотя это штатное поведение ProseMirror.
// Переопределяем Enter внутри heading — всегда сразу параграф, как в Notion/Confluence.
const HeadingExitOnEnter = Heading.extend({
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        if (!this.editor.isActive("heading")) return false;
        return this.editor.chain().focus().splitBlock().setNode("paragraph").run();
      },
    };
  },
});

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
  attachmentCandidates,
  onDownloadAttachment,
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
  // Тот же ref-приём: extension.options читается NodeView-компонентом вне цикла рендера React
  // (см. AttachmentEmbedView), конфигурируется один раз при создании editor.
  const onDownloadRef = useRef(onDownloadAttachment);
  useEffect(() => {
    onDownloadRef.current = onDownloadAttachment;
  }, [onDownloadAttachment]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false, // выключен здесь — свой HeadingExitOnEnter ниже, тот же levels-конфиг
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      HeadingExitOnEnter.configure({ levels: [1, 2, 3] }),
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
      // eslint-disable-next-line react-hooks/refs -- onDownloadRef читается только в NodeView-колбэке
      AttachmentEmbed.configure({ onDownload: (id: string) => onDownloadRef.current?.(id) }),
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
        // sticky, не fixed — держится за ближайшего скроллящегося предка (design review: "тело
        // документа не влезает на экран в большинстве случаев, тулбар не должен уезжать вместе с
        // ним"), какой бы это ни был — lg:overflow-y-auto колонка PageDetailView/KbDetailView или
        // <main> AppShell на мобильном/KB, где своей scroll-колонки нет.
        // top-2 + pb-2 (не top-0 впритык к краю) + рамка/тень/скругление — "парящая" пилюля
        // (design review, ui-ux-pro-max: elevation-consistent), не плоская полоса, прибитая к
        // самому верху. bg-card (не прозрачный) — текст под тулбаром при скролле не просвечивает.
        <div className="sticky top-2 z-10 pb-2">
          <RichTextToolbar
            editor={editor}
            showPageLink={onNavigateToPage !== undefined}
            attachmentCandidates={attachmentCandidates}
            labels={labels}
          />
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}

function RichTextToolbar({
  editor,
  showPageLink,
  attachmentCandidates,
  labels,
}: {
  editor: Editor;
  showPageLink: boolean;
  attachmentCandidates: AttachmentItem[] | undefined;
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
    <div className="flex w-fit flex-wrap items-center gap-0.5 rounded-xl border border-border bg-card p-1 shadow-sm">
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
      {attachmentCandidates !== undefined && (
        <AttachmentPickerButton
          editor={editor}
          items={attachmentCandidates}
          label={labels.insertFile}
          searchPlaceholder={labels.insertFileSearchPlaceholder}
          emptyLabel={labels.insertFileEmpty}
        />
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
