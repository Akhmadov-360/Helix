import ReactMarkdown from "react-markdown";

// LLM'ы отвечают markdown'ом (Gemini/Anthropic/OpenAI — все): **bold**, списки, `code`, заголовки.
// Рендерим через react-markdown; @tailwindcss/typography (prose-классы) сюда не берём — под чат-пузырь
// его дефолтные margin'ы велики, а тащить плагин ради одного компонента избыточно. Точечные стили ниже —
// именно то, что Gemini обычно и выдаёт (bold/italic/списки/inline-code/заголовки).
// Пользовательские сообщения через этот компонент НЕ пропускаем — пользователь пишет plain-текст,
// парсить `**` или `_` в его сообщении как форматирование = сюрприз для автора.
export function AssistantMarkdown({ content }: { content: string }) {
  return (
    <div className="text-sm leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_h1]:mb-1 [&_h1]:mt-2 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mb-1 [&_h2]:mt-2 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:mb-1 [&_h3]:mt-2 [&_h3]:text-sm [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-2 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_strong]:font-semibold [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
