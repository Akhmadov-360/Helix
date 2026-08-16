import { BookOpen, FileText, Paperclip } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@helix/ui";
import type { Citation, EmbeddingSourceType } from "@helix/api-schemas";

const SOURCE_ICON: Record<EmbeddingSourceType, typeof FileText> = {
  PAGE: FileText,
  KB_ARTICLE: BookOpen,
  ATTACHMENT: Paperclip,
};

// ai-chat.md §13.3 — max-w-[140px] truncate + Tooltip на полный текст: label — сырой текст чанка
// до 80 символов (§1.3 бэкенда), в чип целиком не помещается. Ряд — overflow-x-auto, НЕ flex-wrap:
// перенос на 2-3 строки отодвигал бы сам ответ вниз, цитаты вторичны по отношению к тексту ответа.
export function CitationsList({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) return null;

  return (
    <div className="scroll-slim flex gap-1.5 overflow-x-auto pb-0.5">
      {citations.map((citation) => {
        const Icon = SOURCE_ICON[citation.sourceType];
        return (
          <Tooltip key={`${citation.sourceType}:${citation.sourceId}`}>
            <TooltipTrigger asChild>
              <span className="flex max-w-[140px] shrink-0 items-center gap-1 truncate rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">
                <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{citation.label}</span>
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{citation.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
