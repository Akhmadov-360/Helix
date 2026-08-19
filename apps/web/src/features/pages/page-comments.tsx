import { Fragment, useRef } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Check, Clock, Trash2 } from "lucide-react";
import {
  Avatar,
  Button,
  Message,
  MessageAvatar,
  MessageContent,
  MessageGroup,
  MessageHeader,
  MentionTextarea,
  ScrollArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  type MentionTextareaHandle,
} from "@helix/ui";
import { useMe } from "../../shared/auth/session";
import { useT, useLocaleStore, type TFunction } from "../../shared/i18n";
import { orgMembersQueryOptions } from "../../shared/org/queries";
import { useAddPageComment, useDeletePageComment, type PendingPageComment } from "./mutations";
import { pageCommentsQueryOptions } from "./queries";

// pages-kb.md §4 — удалить комментарий может автор или Manager+ (не CASL-грант, сервер решает
// сам); фронт зеркалит то же правило только косметически, чтобы скрыть кнопку раньше 403.
const MANAGER_PLUS_ROLES = new Set(["OWNER", "ADMIN", "MANAGER"]);

// body — плоский текст с "@Имя" как обычной подстрокой (бэкенд не парсит @ сам, pages-kb.md §2);
// подсветка здесь — чисто визуальный хелпер по именам РОСТЕРА орги, не источник истины о том, кто
// реально упомянут (это mentionedUserIds на запись, недоступен в ответе списка комментариев).
function highlightMentions(body: string, memberNames: string[]): React.ReactNode[] {
  if (memberNames.length === 0) return [body];
  const pattern = new RegExp(
    `@(${[...memberNames]
      .sort((a, b) => b.length - a.length)
      .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|")})`,
    "g",
  );

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body))) {
    if (match.index > lastIndex) parts.push(body.slice(lastIndex, match.index));
    parts.push(
      <span key={match.index} className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
        @{match[1]}
      </span>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < body.length) parts.push(body.slice(lastIndex));
  return parts;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Telegram-style: разделитель "Сегодня"/"Вчера"/дата НАД первым комментарием дня — не повторяем
// полную дату на каждой строке (design review, #12), в заголовке комментария остаётся только время.
function dayLabel(iso: string, locale: string, t: TFunction): string {
  const date = new Date(iso);
  const now = new Date();
  if (isSameDay(date, now)) return t("pages.comments.today");
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) return t("pages.comments.yesterday");
  return new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(date);
}

export function PageComments({ orgId, pageId }: { orgId: string; pageId: string }) {
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);
  const me = useMe();
  // pending:true подмешивается локально мутацией (см. mutations.ts) — не часть серверного ответа.
  const comments = useSuspenseQuery(pageCommentsQueryOptions(orgId, pageId)).data as PendingPageComment[];
  const members = useSuspenseQuery(orgMembersQueryOptions(orgId)).data;
  const addComment = useAddPageComment(orgId, pageId, { id: me.id, name: me.name });
  const deleteComment = useDeletePageComment(orgId, pageId);
  const inputRef = useRef<MentionTextareaHandle>(null);
  const timeFormatter = new Intl.DateTimeFormat(locale, { timeStyle: "short" });

  const candidates = members.map((m) => ({ id: m.userId, name: m.name }));
  const memberNames = members.map((m) => m.name);
  const canDelete = MANAGER_PLUS_ROLES.has(me.role);

  return (
    // flex-1 min-h-0 — тянется вместе с окном и схлопывается со скроллом внутри, а не наружу
    // (design review: "как таблица, которая используется по проекту" — тот же containerClassName
    // паттерн, что Table: родитель (PageDetailView) даёт h-full min-h-0, эта секция забирает
    // остаток высоты, ScrollArea ниже скроллится сама, не раздувая всю страницу).
    // border-t (стек < lg) → border-l (сайдбар >= lg, design review: комментарии справа, фикс. ширина,
    // своя высота) — разделитель следует направлению, в котором реально стоит блок относительно редактора.
    <div className="flex min-h-0 flex-1 flex-col gap-3 border-t border-border pt-4 lg:border-t-0 lg:border-l lg:pl-4 lg:pt-0">
      <h2 className="shrink-0 text-sm font-medium text-muted-foreground">{t("pages.comments.title")}</h2>

      <MentionTextarea
        ref={inputRef}
        candidates={candidates}
        placeholder={t("pages.comments.placeholder")}
        sendLabel={t("pages.comments.send")}
        disabled={addComment.isPending}
        className="shrink-0"
        onSubmit={({ body, mentionedUserIds }) => addComment.mutate({ body, mentionedUserIds })}
      />
      {/* Подсказка про @-упоминание — отдельной строкой, не частью placeholder: длинный placeholder
          в узком сайдбаре (360px) переносился на 2 строки и ломал высоту инпута рядом с кнопкой
          отправки (bug report); текст здесь не зависит от ширины contentEditable-плейсхолдера. */}
      <p className="-mt-1 shrink-0 text-xs text-muted-foreground">{t("pages.comments.mentionHint")}</p>

      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("pages.comments.empty")}</p>
      ) : (
        // ScrollArea (shadcn) вместо голого overflow-y-auto — тонкий скроллбар в стиле остального UI.
        <ScrollArea className="min-h-[160px] flex-1 rounded-md border border-border">
          <MessageGroup className="p-3">
            {comments.map((comment, i) => {
              const authorName = comment.authorName ?? t("pages.comments.deletedAuthor");
              const isMine = comment.authorId === me.id;
              const showDayDivider = i === 0 || !isSameDay(new Date(comment.createdAt), new Date(comments[i - 1]!.createdAt));

              return (
                <Fragment key={comment.id}>
                  {showDayDivider && (
                    <div className="flex justify-center py-1">
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                        {dayLabel(comment.createdAt, locale, t)}
                      </span>
                    </div>
                  )}
                  <Message className="group/comment">
                    <MessageAvatar>
                      {/* Имя убрано из вечно видимого текста (design review, #12) — теперь по
                          hover/focus на аватар, tooltip. button+tabIndex — не только hover: без
                          фокусируемого элемента клавиатурный пользователь подсказку не увидел бы
                          вообще (Radix Tooltip показывает и на focus, не только на hover). */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <Avatar name={authorName} size="sm" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{authorName}</TooltipContent>
                      </Tooltip>
                    </MessageAvatar>
                    <MessageContent>
                      <MessageHeader>
                        <span>{timeFormatter.format(new Date(comment.createdAt))}</span>
                        {/* Статус — только для СВОИХ сообщений (Telegram-конвенция: read receipt
                            имеет смысл только для того, кто отправил), часы во время полёта запроса
                            меняются на галочку сразу по ответу сервера (onSuccess в mutations.ts). */}
                        {isMine &&
                          (comment.pending ? (
                            <Clock
                              role="img"
                              className="ml-1 h-3 w-3 text-muted-foreground"
                              aria-label={t("pages.comments.sending")}
                            />
                          ) : (
                            <Check
                              role="img"
                              className="ml-1 h-3 w-3 text-muted-foreground"
                              aria-label={t("pages.comments.sent")}
                            />
                          ))}
                        {!comment.pending && (canDelete || comment.authorId === me.id) && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label={t("pages.comments.delete")}
                            className="ml-auto opacity-0 transition-opacity focus-visible:opacity-100 group-hover/comment:opacity-100"
                            onClick={() => deleteComment.mutate({ commentId: comment.id })}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </MessageHeader>
                      <p className="whitespace-pre-wrap px-3 text-sm">
                        {highlightMentions(comment.body, memberNames).map((part, j) => (
                          <Fragment key={j}>{part}</Fragment>
                        ))}
                      </p>
                    </MessageContent>
                  </Message>
                </Fragment>
              );
            })}
          </MessageGroup>
        </ScrollArea>
      )}
    </div>
  );
}
