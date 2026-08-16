import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bot, ChevronDown, Plus, Send, X } from "lucide-react";
import {
  Avatar,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Message,
  MessageAvatar,
  MessageContent,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@helix/ui";
import type { AiMessageResponse, ToolCall } from "@helix/api-schemas";
import { TransportError } from "../../shared/api";
import { useMe } from "../../shared/auth/session";
import { useT } from "../../shared/i18n";
import { toAiChatError } from "./ai-chat-error";
import { ActionCard } from "./action-card";
import { CitationsList } from "./citations-list";
import { useConfirmToolCall, useCreateAiThread, useDeleteAiThread, useRejectToolCall } from "./mutations";
import { aiThreadMessagesQueryOptions, projectAiThreadsQueryOptions } from "./queries";
import { streamAiMessage } from "./stream-chat";

interface StreamingState {
  // code review: без этого поля стрим одного треда, ещё не завершившийся, продолжал бы рендериться
  // ПОД сообщениями другого треда после переключения в дропдауне — streaming не был привязан к
  // конкретному threadId, только глобальный "что-то стримится" флаг.
  threadId: string;
  userContent: string;
  assistantContent: string;
}

interface PendingToolCall {
  callId: string;
  action: "confirm" | "reject";
}

export function ChatDrawer({
  orgId,
  projectId,
  open,
  onOpenChange,
}: {
  orgId: string;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const me = useMe();
  const queryClient = useQueryClient();

  const threadsQuery = useQuery(projectAiThreadsQueryOptions(orgId, projectId));
  // undefined — юзер ещё не сделал явный выбор → дефолт на самый свежий тред (updatedAt desc, §13.2);
  // null — юзер явно нажал "New chat" → пустой экран, НЕ откатывается обратно на дефолт (иначе
  // useEffect+setState на каждый рендер каскадил бы лишний re-render — react-hooks/set-state-in-effect).
  const [explicitThreadId, setExplicitThreadId] = useState<string | null | undefined>(undefined);
  const selectedThreadId = explicitThreadId !== undefined ? explicitThreadId : (threadsQuery.data?.[0]?.id ?? null);
  const setSelectedThreadId = setExplicitThreadId;
  const messagesQuery = useQuery({
    ...aiThreadMessagesQueryOptions(orgId, selectedThreadId ?? ""),
    enabled: selectedThreadId !== null,
  });

  const createThread = useCreateAiThread(orgId, projectId);
  const deleteThread = useDeleteAiThread(orgId, projectId);
  const confirmToolCall = useConfirmToolCall(orgId, selectedThreadId ?? "");
  const rejectToolCall = useRejectToolCall(orgId, selectedThreadId ?? "");

  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState<StreamingState | null>(null);
  const [pending, setPending] = useState<PendingToolCall | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const liveRegionRef = useRef<HTMLDivElement>(null);
  const streamControllerRef = useRef<AbortController | null>(null);

  // code review: обрывает фоновый fetch, если он есть — переключение треда/New chat/размонтирование
  // дровера больше не оставляют висящий SSE-коннекшн, за которым никто уже не следит.
  function cancelActiveStream() {
    streamControllerRef.current?.abort();
    streamControllerRef.current = null;
  }

  useEffect(() => cancelActiveStream, []);

  const selectedThread = threadsQuery.data?.find((th) => th.id === selectedThreadId) ?? null;
  const threadTitle = selectedThread?.title ?? t("aiChat.header.untitled");

  const messages = messagesQuery.data ?? [];
  // Стрим другого треда (переключились до его завершения) — не считается "активным" для ЭТОГО
  // экрана: не блокирует ввод/пустое состояние и не рендерится здесь (см. streaming.threadId).
  const activeStreaming = streaming && streaming.threadId === selectedThreadId ? streaming : null;
  const isEmpty = !activeStreaming && messages.length === 0;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messagesQuery.data, activeStreaming]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }, [input]);

  async function handleSend() {
    const content = input.trim();
    // activeStreaming, не streaming — блокируем повторную отправку в ЭТОМ треде, но не тогда, когда
    // висит только фоновый (уже покинутый) стрим другого треда, ожидающий завершения/невидимого cancel.
    if (!content || activeStreaming) return;

    let threadId = selectedThreadId;
    if (!threadId) {
      try {
        const thread = await createThread.mutateAsync();
        threadId = thread.id;
        setSelectedThreadId(threadId);
      } catch {
        return; // useCreateAiThread уже показал toast
      }
    }

    setInput("");
    // code review: threadId привязан к самому StreamingState — рендер и апдейтеры ниже сверяются
    // с АКТУАЛЬНЫМ selectedThreadId, а не просто "что-то стримится", иначе ответ треда A мог бы
    // дорисоваться под сообщениями треда B после переключения в дропдауне.
    setStreaming({ threadId, userContent: content, assistantContent: "" });
    cancelActiveStream();
    const controller = new AbortController();
    streamControllerRef.current = controller;

    try {
      for await (const event of streamAiMessage(threadId, content, controller.signal)) {
        if (event.type === "text_delta") {
          setStreaming((s) => (s && s.threadId === threadId ? { ...s, assistantContent: s.assistantContent + event.text } : s));
        } else if (event.type === "error") {
          toast.error(event.message);
        } else if (event.type === "message_saved") {
          queryClient.setQueryData<AiMessageResponse[]>(
            aiThreadMessagesQueryOptions(orgId, threadId).queryKey,
            (current) => [...(current ?? []), event.message],
          );
          if (liveRegionRef.current) liveRegionRef.current.textContent = t("aiChat.streaming.responseReady");
        }
      }
    } catch (error) {
      if (controller.signal.aborted) return; // юзер сам оборвал (сменил тред/закрыл) — не ошибка
      // §13.5/§4 — 404/422 из prepareChat() приходят ДО первого события (обычная HTTP-ошибка,
      // не SSE) — стрим ни разу не начался, catch здесь ловит именно её.
      const kind = toAiChatError(error);
      toast.error(t(kind === "unexpected" && error instanceof TransportError ? "aiChat.error.unexpected" : `aiChat.error.${kind}`));
    } finally {
      if (streamControllerRef.current === controller) streamControllerRef.current = null;
      setStreaming((s) => (s && s.threadId === threadId ? null : s));
      await queryClient.invalidateQueries({ queryKey: aiThreadMessagesQueryOptions(orgId, threadId).queryKey });
      await queryClient.invalidateQueries({ queryKey: projectAiThreadsQueryOptions(orgId, projectId).queryKey });
    }
  }

  function handleNewChat() {
    cancelActiveStream();
    setSelectedThreadId(null);
    setStreaming(null);
    setInput("");
  }

  function handleSelectThread(threadId: string) {
    if (threadId !== selectedThreadId) cancelActiveStream();
    setSelectedThreadId(threadId);
  }

  function handleConfirm(callId: string) {
    setPending({ callId, action: "confirm" });
    confirmToolCall.mutate({ callId }, { onSettled: () => setPending(null) });
  }

  function handleReject(callId: string) {
    setPending({ callId, action: "reject" });
    rejectToolCall.mutate({ callId }, { onSettled: () => setPending(null) });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="p-0">
        <SheetHeader>
          <SheetTitle className="sr-only">{t("aiChat.trigger")}</SheetTitle>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm font-medium hover:bg-muted"
              >
                <span className="min-w-0 flex-1 truncate">{threadTitle}</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              {(threadsQuery.data ?? []).length === 0 && (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">{t("aiChat.empty.title")}</div>
              )}
              {(threadsQuery.data ?? []).map((thread) => (
                <DropdownMenuItem
                  key={thread.id}
                  className="justify-between gap-2"
                  onSelect={() => handleSelectThread(thread.id)}
                >
                  <span className="min-w-0 flex-1 truncate">{thread.title ?? t("aiChat.header.untitled")}</span>
                  <button
                    type="button"
                    aria-label={t("aiChat.header.deleteThread")}
                    className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteThread.mutate({ threadId: thread.id });
                      if (thread.id === selectedThreadId) {
                        cancelActiveStream();
                        setSelectedThreadId(null);
                      }
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t("aiChat.header.newChat")} onClick={handleNewChat}>
            <Plus className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t("aiChat.header.close")} onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
          </Button>
        </SheetHeader>

        <div ref={scrollRef} className="scroll-slim flex-1 overflow-y-auto px-3.5 py-4">
          {isEmpty ? (
            <div className="flex h-full flex-col items-center justify-center gap-1.5 px-6 text-center">
              <Bot className="mb-1 h-6 w-6 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium">{t("aiChat.empty.title")}</p>
              <p className="text-xs text-muted-foreground">{t("aiChat.empty.body")}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {messages.map((message) => (
                <ChatBubble
                  key={message.id}
                  message={message}
                  userName={me.name}
                  pending={pending}
                  onConfirm={handleConfirm}
                  onReject={handleReject}
                />
              ))}
              {activeStreaming && (
                <>
                  <Message align="end">
                    <MessageAvatar>
                      <Avatar name={me.name} size="sm" />
                    </MessageAvatar>
                    <MessageContent>
                      <div className="w-fit max-w-[85%] self-end rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">{activeStreaming.userContent}</div>
                    </MessageContent>
                  </Message>
                  <Message align="start">
                    <MessageAvatar>
                      <AssistantAvatar />
                    </MessageAvatar>
                    <MessageContent>
                      <div className="w-fit max-w-[85%] self-start rounded-lg bg-secondary px-3 py-2 text-sm text-secondary-foreground">
                        {activeStreaming.assistantContent || <TypingIndicator />}
                      </div>
                    </MessageContent>
                  </Message>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5 border-t border-border px-3 py-2.5">
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder={t("aiChat.input.placeholder")}
              disabled={Boolean(activeStreaming) || createThread.isPending}
              rows={1}
              className="max-h-24 min-h-9 flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            />
            <Button
              type="button"
              size="icon"
              aria-label={t("aiChat.input.send")}
              disabled={!input.trim() || Boolean(activeStreaming) || createThread.isPending}
              onClick={() => void handleSend()}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <span className="text-[10.5px] text-muted-foreground">{t("aiChat.input.hint")}</span>
        </div>

        {/* §13.5 — один анонс на завершение ответа, не на каждый токен (шум для скринридера). */}
        <div ref={liveRegionRef} aria-live="polite" className="sr-only" />
      </SheetContent>
    </Sheet>
  );
}

function AssistantAvatar() {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
      <Bot className="h-3.5 w-3.5" aria-hidden="true" />
    </span>
  );
}

function TypingIndicator() {
  return (
    <span className="inline-flex items-center gap-0.5 py-0.5">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
    </span>
  );
}

function ChatBubble({
  message,
  userName,
  pending,
  onConfirm,
  onReject,
}: {
  message: AiMessageResponse;
  userName: string;
  pending: PendingToolCall | null;
  onConfirm: (callId: string) => void;
  onReject: (callId: string) => void;
}) {
  const isUser = message.role === "USER";

  return (
    <Message align={isUser ? "end" : "start"}>
      <MessageAvatar>{isUser ? <Avatar name={userName} size="sm" /> : <AssistantAvatar />}</MessageAvatar>
      <MessageContent>
        <div
          className={
            isUser
              ? "w-fit max-w-[85%] self-end rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
              : "w-fit max-w-[85%] self-start rounded-lg bg-secondary px-3 py-2 text-sm text-secondary-foreground"
          }
        >
          {message.content}
        </div>
        {!isUser && message.citations && message.citations.length > 0 && <CitationsList citations={message.citations} />}
        {!isUser &&
          message.toolCalls?.map((toolCall: ToolCall) => (
            <ActionCard
              key={toolCall.id}
              toolCall={toolCall}
              onConfirm={() => onConfirm(toolCall.id)}
              onReject={() => onReject(toolCall.id)}
              isConfirming={pending?.callId === toolCall.id && pending.action === "confirm"}
              isRejecting={pending?.callId === toolCall.id && pending.action === "reject"}
            />
          ))}
      </MessageContent>
    </Message>
  );
}
