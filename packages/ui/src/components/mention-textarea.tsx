import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { EditorContent, ReactRenderer, useEditor, type Editor, type JSONContent } from "@tiptap/react";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import StarterKit from "@tiptap/starter-kit";
import { Send } from "lucide-react";
import { cn } from "../lib/cn";
import { Button } from "./button";

export interface MentionCandidate {
  id: string;
  name: string;
}

export interface MentionTextareaHandle {
  clear: () => void;
  focus: () => void;
}

export interface MentionTextareaProps {
  /** Ростер орги для "@" — тот же список, что typeahead в assignee-пикерах (orgMembersQueryOptions). */
  candidates: MentionCandidate[];
  /** Enter отправляет (Shift+Enter — перенос строки), тот же приём, что чат-инпуты. */
  onSubmit: (value: { body: string; mentionedUserIds: string[] }) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** aria-label кнопки отправки — компонент без i18n, подпись приходит из вызывающего кода. */
  sendLabel?: string;
}

// pages-kb.md §2 — PageComment.body: простой текст с "@Имя" как обычной подстрокой; бэкенд НЕ
// парсит "@" сам, id упомянутых передаются отдельным полем (mentionedUserIds), которые фронт
// резолвит ЗДЕСЬ, в момент ввода. TipTap — не потому что комментарий rich-text (это не так, body
// плоский), а потому что инлайн "@"-автокомплит с попапом — ровно то, для чего существует
// @tiptap/extension-mention + @tiptap/suggestion; ручной трекинг курсора в <textarea> заново
// изобретал бы то же самое куда более хрупким кодом.
export const MentionTextarea = forwardRef<MentionTextareaHandle, MentionTextareaProps>(
  function MentionTextarea({ candidates, onSubmit, placeholder, className, disabled, sendLabel }, ref) {
    // Suggestion.items — не-реактивный колбэк TipTap-расширения (конфигурируется один раз при
    // создании editor); ref держит актуальный список кандидатов без пересоздания editor на каждый
    // рендер родителя.
    const candidatesRef = useRef(candidates);
    candidatesRef.current = candidates;
    // true, пока открыт popup подсказки — Enter в этот момент должен подтверждать выбор в списке,
    // не отправлять комментарий (см. handleKeyDown ниже).
    const suggestionOpenRef = useRef(false);

    const submitRef = useRef<() => void>(() => {});
    // Кнопка отправки должна реагировать на пустоту редактора — editor.isEmpty сам по себе не
    // реактивен для React (меняется внутри ProseMirror, не через props/state).
    const [isEmpty, setIsEmpty] = useState(true);

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: false,
          bulletList: false,
          orderedList: false,
          listItem: false,
          blockquote: false,
          codeBlock: false,
          horizontalRule: false,
          bold: false,
          italic: false,
          strike: false,
          code: false,
        }),
        Placeholder.configure({ placeholder: placeholder ?? "" }),
        Mention.configure({
          HTMLAttributes: { class: "mention" },
          suggestion: {
            char: "@",
            items: ({ query }: { query: string }) =>
              candidatesRef.current
                .filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
                .slice(0, 8),
            render: createSuggestionRenderer(suggestionOpenRef),
          },
        }),
      ],
      editable: !disabled,
      immediatelyRender: true,
      onUpdate: ({ editor: e }) => setIsEmpty(e.isEmpty),
      editorProps: {
        attributes: { class: "tiptap-mention min-h-6 text-sm focus:outline-none" },
        handleKeyDown: (_view, event) => {
          if (event.key === "Enter" && !event.shiftKey && !suggestionOpenRef.current) {
            event.preventDefault();
            submitRef.current();
            return true;
          }
          return false;
        },
      },
    });

    const handleSubmit = useCallback(() => {
      if (!editor || editor.isEmpty) return;
      const body = editor.getText({ blockSeparator: "\n" }).trim();
      if (!body) return;
      const mentionedUserIds = extractMentionIds(editor.getJSON());
      onSubmit({ body, mentionedUserIds });
      editor.commands.clearContent();
    }, [editor, onSubmit]);

    submitRef.current = handleSubmit;

    useImperativeHandle(
      ref,
      () => ({
        clear: () => editor?.commands.clearContent(),
        focus: () => editor?.commands.focus(),
      }),
      [editor],
    );

    useEffect(() => {
      if (editor && editor.isEditable === disabled) editor.setEditable(!disabled);
    }, [editor, disabled]);

    // Полный Enter/Shift+Enter уже обработан в editorProps.handleKeyDown (ProseMirror-уровень);
    // здесь только блокируем нативный submit формы, если инпут когда-нибудь окажется внутри <form>.
    const onContainerKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter") event.stopPropagation();
    };

    return (
      <div
        onKeyDown={onContainerKeyDown}
        className={cn(
          "flex min-h-10 w-full items-end gap-2 rounded-md border border-input bg-background px-3 py-2 ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
          disabled && "cursor-not-allowed opacity-50",
          className,
        )}
      >
        <EditorContent editor={editor} className="w-full" />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          aria-label={sendLabel ?? "Send"}
          disabled={disabled || isEmpty}
          onClick={() => submitRef.current()}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    );
  },
);

function extractMentionIds(json: JSONContent): string[] {
  const ids = new Set<string>();
  const walk = (node: JSONContent | undefined): void => {
    if (!node) return;
    if (node.type === "mention" && typeof node.attrs?.id === "string") ids.add(node.attrs.id);
    node.content?.forEach(walk);
  };
  walk(json);
  return [...ids];
}

interface MentionListProps {
  items: MentionCandidate[];
  command: (item: { id: string; label: string }) => void;
}

interface MentionListHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

// forwardRef, не hooks-компонент напрямую — ReactRenderer (см. createSuggestionRenderer) держит
// ref на инстанс, чтобы прокинуть keydown из ProseMirror в React-список (стандартный TipTap-приём
// для inline-suggestion UI, тот же, что в официальных примерах mention/emoji).
const MentionList = forwardRef<MentionListHandle, MentionListProps>(function MentionList(
  { items, command },
  ref,
) {
  const [selected, setSelected] = useState(0);

  useEffect(() => setSelected(0), [items]);

  const select = useCallback(
    (index: number) => {
      const item = items[index];
      if (item) command({ id: item.id, label: item.name });
    },
    [items, command],
  );

  useImperativeHandle(
    ref,
    () => ({
      onKeyDown: ({ event }) => {
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
    <div className="w-56 overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
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
          {item.name}
        </button>
      ))}
    </div>
  );
});

// popup — обычный div на document.body с fixed-позиционированием по clientRect suggestion'а, БЕЗ
// tippy.js: единственный потребитель, добавлять ещё одну библиотеку позиционирования ради одного
// попапа не оправдано (в проекте уже есть свой Popover на Radix, но он требует React-дерева триггера
// — здесь триггер живёт внутри ProseMirror DOM, не в React, поэтому ручной portal-div проще).
function createSuggestionRenderer(suggestionOpenRef: { current: boolean }) {
  return () => {
    let component: ReactRenderer<MentionListHandle, MentionListProps>;
    let popup: HTMLDivElement;

    // Список — до 8 кандидатов (см. items.slice(0,8) выше), ~36px строка + паддинг попапа —
    // достаточная верхняя оценка высоты без ожидания реального layout попапа.
    const POPUP_MAX_HEIGHT = 260;

    const position = (clientRect: (() => DOMRect | null) | null | undefined) => {
      const rect = clientRect?.();
      if (!rect || !popup) return;
      // Попап рядом с полем ввода внизу страницы (комментарии) упирался в низ вьюпорта —
      // переворачиваем вверх, если снизу тесно, а сверху реально просторнее.
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
      onStart: (props: SuggestionProps<MentionCandidate>) => {
        suggestionOpenRef.current = true;
        component = new ReactRenderer(MentionList, {
          props: { items: props.items as MentionCandidate[], command: props.command },
          editor: props.editor as Editor,
        });
        popup = document.createElement("div");
        popup.style.position = "fixed";
        popup.style.zIndex = "50";
        document.body.appendChild(popup);
        popup.appendChild(component.element);
        position(props.clientRect);
      },
      onUpdate: (props: SuggestionProps<MentionCandidate>) => {
        component.updateProps({ items: props.items as MentionCandidate[], command: props.command });
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
