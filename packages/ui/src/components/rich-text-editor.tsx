import { useEffect } from "react";
import { EditorContent, useEditor, type Editor, type JSONContent } from "@tiptap/react";
import { TableKit } from "@tiptap/extension-table";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Heading2, Italic, List, ListOrdered, Table as TableIcon } from "lucide-react";
import { cn } from "../lib/cn";
import { Button } from "./button";

export interface RichTextEditorProps {
  /** pages-kb.md §1 — TipTap-документ как есть, форма не валидируется на фронте (источник — TipTap). */
  content?: Record<string, unknown>;
  onChange?: (content: Record<string, unknown>) => void;
  editable?: boolean;
  placeholder?: string;
  className?: string;
}

// Заголовки/списки/таблица/bold/italic — ровно то, что просит FR-PG-1 ("headings/lists/tables"),
// НЕ весь StarterKit-набор: blockquote/codeBlock/horizontalRule выключены — нет запроса на них,
// заводить площадь редактора "на всякий случай" незачем (CLAUDE.md — не создавать спекулятивно).
//
// key={pageId}-паттерн у вызывающего кода: content — только НАЧАЛЬНОЕ содержимое (useEditor читает
// его один раз при монтировании). Переключение на другой Page/KBArticle должно ремонтировать
// компонент новым key, а не полагаться на реактивное обновление content-пропа.
export function RichTextEditor({ content, onChange, editable = true, placeholder, className }: RichTextEditorProps) {
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
    },
  });

  useEffect(() => {
    if (editor && editor.isEditable !== editable) editor.setEditable(editable);
  }, [editor, editable]);

  if (!editor) return null;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {editable && <RichTextToolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}

function RichTextToolbar({ editor }: { editor: Editor }) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border pb-2">
      <ToolbarButton
        active={editor.isActive("heading", { level: 2 })}
        label="Heading"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("bold")}
        label="Bold"
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("italic")}
        label="Italic"
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("bulletList")}
        label="Bullet list"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("orderedList")}
        label="Numbered list"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("table")}
        label="Insert table"
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
      >
        <TableIcon className="h-4 w-4" />
      </ToolbarButton>
    </div>
  );
}

function ToolbarButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      size="icon-sm"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
