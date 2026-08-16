import { Badge, Button } from "@helix/ui";
import { READ_ONLY_TOOL_NAMES, type ToolCall } from "@helix/api-schemas";
import { useT, type MessageKey } from "../../shared/i18n";

// ai-chat.md §13.4 — два разных "готово", не одно: read-only-результат (draft_email/summarize_files)
// приходит уже EXECUTED без propose (§6 бэкенда), но НЕ мутировал CRM — рисовать его тем же зелёным
// "✓ Executed", что реальный move_phase/update_field/create_task, приучило бы не читать карточки
// внимательно ещё до первого настоящего confirm. Различаем по READ_ONLY_TOOL_NAMES (api-schemas —
// единственный источник истины, тот же список, что apps/api/tool-schema.ts TOOL_POLICY).
function summaryReadyKey(tool: ToolCall["tool"]): MessageKey {
  return tool === "draft_email" ? "aiChat.actionCard.draftReady" : "aiChat.actionCard.summaryReady";
}

// Честный рендер того, что реально есть в args/result — без выдуманных "старое→новое" человеческих
// имён там, где бэкенд их не отдаёт (move_phase: args несёт только toPhaseId, не имя фазы; красивый
// диф потребовал бы отдельного lookup по board/phases, которого у ActionCard нет и заводить его
// здесь — за рамки этой карточки, не строим лишнего ради визуальной красоты одного поля).
function renderArgsSummary(tool: ToolCall["tool"], args: Record<string, unknown>): string {
  switch (tool) {
    case "move_phase":
      return typeof args.toPhaseId === "string" ? `→ phase ${args.toPhaseId.slice(0, 10)}…` : "";
    case "update_field": {
      const entries = Object.entries(args).filter(([, v]) => v !== undefined);
      return entries.map(([key, value]) => `${key}: ${String(value)}`).join(" · ");
    }
    case "create_task":
      return typeof args.title === "string" ? String(args.title) : "";
    case "draft_email":
      return typeof args.subject === "string" ? String(args.subject) : "";
    case "summarize_files":
      return Array.isArray(args.attachmentIds) ? `${args.attachmentIds.length} file(s)` : "";
    default:
      return "";
  }
}

function rejectReason(result: unknown): string | undefined {
  if (result && typeof result === "object" && "error" in result && typeof result.error === "string") {
    return result.error;
  }
  return undefined;
}

export function ActionCard({
  toolCall,
  onConfirm,
  onReject,
  isConfirming,
  isRejecting,
}: {
  toolCall: ToolCall;
  onConfirm: () => void;
  onReject: () => void;
  isConfirming: boolean;
  isRejecting: boolean;
}) {
  const t = useT();
  const isReadOnly = READ_ONLY_TOOL_NAMES.includes(toolCall.tool);
  const summary = renderArgsSummary(toolCall.tool, toolCall.args);
  const isPending = isConfirming || isRejecting;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold">{t(`aiChat.actionCard.tool.${toolCall.tool}`)}</span>
        {toolCall.status === "EXECUTED" && isReadOnly && <Badge variant="outline">{t(summaryReadyKey(toolCall.tool))}</Badge>}
        {toolCall.status === "EXECUTED" && !isReadOnly && <Badge variant="success">✓ {t("aiChat.actionCard.executed")}</Badge>}
        {toolCall.status === "REJECTED" && <Badge variant="destructive">{t("aiChat.actionCard.rejected")}</Badge>}
        {(toolCall.status === "PROPOSED" || toolCall.status === "CONFIRMED") && (
          <Badge variant="outline">{t("aiChat.actionCard.awaitingConfirmation")}</Badge>
        )}
      </div>

      {summary && <p className="truncate text-xs text-muted-foreground">{summary}</p>}

      {toolCall.status === "REJECTED" && rejectReason(toolCall.result) && (
        <p className="text-xs text-destructive">{rejectReason(toolCall.result)}</p>
      )}

      {(toolCall.status === "PROPOSED" || toolCall.status === "CONFIRMED") && (
        <div className="flex gap-2">
          <Button size="sm" className="flex-1" onClick={onConfirm} disabled={isPending}>
            {isConfirming ? t("aiChat.actionCard.confirming") : t("aiChat.actionCard.confirm")}
          </Button>
          <Button size="sm" variant="outline" className="flex-1" onClick={onReject} disabled={isPending}>
            {isRejecting ? t("aiChat.actionCard.rejecting") : t("aiChat.actionCard.reject")}
          </Button>
        </div>
      )}
    </div>
  );
}
