import { Fragment, useRef, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Check, Clock } from "lucide-react";
import {
  Avatar,
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageGroup,
  MessageHeader,
  MentionTextarea,
  ScrollArea,
  Textarea,
  cn,
  type MentionTextareaHandle,
} from "@helix/ui";
import { useMe } from "../../shared/auth/session";
import { useT, useLocaleStore, type TFunction } from "../../shared/i18n";
import { orgMembersQueryOptions } from "../../shared/org/queries";
import { useAddPageComment, useDeletePageComment, useUpdatePageComment, type PendingPageComment } from "./mutations";
import { pageCommentsQueryOptions } from "./queries";

// pages-kb.md §4 — удалить комментарий может автор или Manager+ (не CASL-грант, сервер решает
// сам); фронт зеркалит то же правило только косметически, чтобы скрыть кнопку раньше 403.
const MANAGER_PLUS_ROLES = new Set(["OWNER", "ADMIN", "MANAGER"]);

// body — плоский текст с "@Имя" как обычной подстрокой (бэкенд не парсит @ сам, pages-kb.md §2);
// подсветка здесь — чисто визуальный хелпер по именам РОСТЕРА орги, не источник истины о том, кто
// реально упомянут (это mentionedUserIds на запись, недоступен в ответе списка комментариев).
// isMine — раньше подсветка ВСЕГДА была text-primary/bg-primary/10, но пузырь СВОЕГО сообщения
// тоже bg-primary: синий текст на синем фоне был фактически невидим (баг-репорт: "не видно, кого
// упомянули"). На чужом (сером) пузыре тот же класс был контрастным, поэтому баг не бросался в
// глаза сразу — проявлялся только в собственных сообщениях с упоминанием.
function highlightMentions(body: string, memberNames: string[], isMine: boolean): React.ReactNode[] {
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
      <span
        key={match.index}
        className={cn(
          "rounded px-1.5 py-0.5 font-medium",
          isMine ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary/10 text-primary",
        )}
      >
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

// Telegram-style группировка: подряд идущие сообщения ОДНОГО автора в пределах 5 минут — видимый
// ник+аватар только у первого, у продолжений — только пузырь (design review: "должны визуально
// объединиться как в тг"). Разрыв дня/смена автора/пауза >5 мин всегда начинают новую группу.
const GROUP_WINDOW_MS = 5 * 60_000;

function isGroupedWithPrevious(comments: PendingPageComment[], i: number): boolean {
  if (i === 0) return false;
  const prev = comments[i - 1]!;
  const cur = comments[i]!;
  if (prev.authorId !== cur.authorId) return false;
  if (!isSameDay(new Date(prev.createdAt), new Date(cur.createdAt))) return false;
  return new Date(cur.createdAt).getTime() - new Date(prev.createdAt).getTime() <= GROUP_WINDOW_MS;
}

// Telegram-style: разделитель "Сегодня"/"Вчера"/дата НАД первым комментарием дня — не повторяем
// полную дату на каждой строке (design review, #12), в footer остаётся только время.
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
  const updateComment = useUpdatePageComment(orgId, pageId);
  const deleteComment = useDeletePageComment(orgId, pageId);
  const inputRef = useRef<MentionTextareaHandle>(null);
  const timeFormatter = new Intl.DateTimeFormat(locale, { timeStyle: "short" });

  const candidates = members.map((m) => ({ id: m.userId, name: m.name }));
  const memberNames = members.map((m) => m.name);
  const canDelete = MANAGER_PLUS_ROLES.has(me.role);

  // Telegram-style: правка — не отдельная страница/диалог, а сам пузырь превращается в textarea
  // (ПКМ → "Изменить" открывает этот режим, Esc/Отмена выходит без сохранения).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  function startEdit(comment: PendingPageComment) {
    setEditingId(comment.id);
    setEditValue(comment.body);
  }

  function submitEdit(commentId: string) {
    const body = editValue.trim();
    if (!body) return;
    updateComment.mutate({ commentId, input: { body } }, { onSuccess: () => setEditingId(null) });
  }

  return (
    // flex-1 min-h-0 — тянется вместе с окном и схлопывается со скроллом внутри, а не наружу
    // (design review: "как таблица, которая используется по проекту" — тот же containerClassName
    // паттерн, что Table: родитель (PageDetailView) даёт h-full min-h-0, эта секция забирает
    // остаток высоты). Композер закреплён СНИЗУ (design review со Stitch-скрином) — лента
    // сообщений растёт вверх от него, как в Slack/Discord/iMessage, а не наоборот.
    // border-t (стек < lg) → border-l (сайдбар >= lg, design review: комментарии справа, фикс. ширина,
    // своя высота) — разделитель следует направлению, в котором реально стоит блок относительно редактора.
    <div className="flex min-h-0 flex-1 flex-col gap-3 border-t border-border pt-4 lg:border-t-0 lg:border-l lg:pl-4 lg:pt-0">
      <h2 className="shrink-0 text-sm font-medium text-muted-foreground">{t("pages.comments.title")}</h2>

      {/* Единая карточка-поверхность (design review: "иначе сливаются со страницей") — лента и
          композер визуально один блок, не два элемента с пустым фоном между ними. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
        {comments.length === 0 ? (
          <p className="flex-1 p-3 text-sm text-muted-foreground">{t("pages.comments.empty")}</p>
        ) : (
          // ScrollArea (shadcn) вместо голого overflow-y-auto — тонкий скроллбар в стиле остального UI.
          <ScrollArea className="min-h-[160px] flex-1">
            <MessageGroup className="gap-1 p-3">
              {comments.map((comment, i) => {
                const authorName = comment.authorName ?? t("pages.comments.deletedAuthor");
                const isMine = comment.authorId === me.id;
                const showDayDivider = i === 0 || !isSameDay(new Date(comment.createdAt), new Date(comments[i - 1]!.createdAt));
                const grouped = !showDayDivider && isGroupedWithPrevious(comments, i);

                return (
                  <Fragment key={comment.id}>
                    {showDayDivider && (
                      <div className="flex justify-center py-1">
                        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                          {dayLabel(comment.createdAt, locale, t)}
                        </span>
                      </div>
                    )}
                    <Message className={cn("group/comment", !grouped && "mt-2 first:mt-0")} align={isMine ? "end" : "start"}>
                      {/* Продолжение группы — аватар скрыт, но колонка сохраняет ширину (invisible
                          spacer), иначе пузырь съезжает и ломает выравнивание своих/чужих сообщений. */}
                      <MessageAvatar className={cn(!grouped ? undefined : "invisible")}>
                        <Avatar name={authorName} size="sm" />
                      </MessageAvatar>
                      <MessageContent>
                        {/* Ник — всегда видимый текст (не hover-тултип, как раньше) и только у
                            ПЕРВОГО сообщения группы (design review со Stitch/Telegram-скринами). */}
                        {!grouped && (
                          <MessageHeader className={cn(isMine && "justify-end")}>
                            <span className="font-medium text-foreground">{authorName}</span>
                          </MessageHeader>
                        )}

                        {editingId === comment.id ? (
                          <div className={cn("flex w-full max-w-[85%] flex-col gap-1.5", isMine ? "self-end" : "self-start")}>
                            <Textarea
                              autoFocus
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Escape") setEditingId(null);
                                if (e.key === "Enter" && !e.shiftKey) {
                                  e.preventDefault();
                                  submitEdit(comment.id);
                                }
                              }}
                              className="min-h-16 text-sm"
                            />
                            <div className="flex justify-end gap-1.5">
                              <Button type="button" variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                                {t("pages.comments.editCancel")}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                disabled={!editValue.trim() || updateComment.isPending}
                                onClick={() => submitEdit(comment.id)}
                              >
                                {t("pages.comments.editSave")}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          // Telegram-style: ПКМ → Popover(Изменить/Удалить) вместо постоянно
                          // видимой кнопки-корзины (design review). Меню недоступно на pending
                          // (ещё нет реального id) и когда у юзера нет ни одного из двух прав.
                          <ContextMenu>
                            <ContextMenuTrigger
                              disabled={comment.pending || !(isMine || canDelete)}
                              className={cn(
                                "w-fit max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-left text-sm",
                                isMine ? "self-end bg-primary text-primary-foreground" : "self-start bg-muted text-foreground",
                              )}
                            >
                              {highlightMentions(comment.body, memberNames, isMine).map((part, j) => (
                                <Fragment key={j}>{part}</Fragment>
                              ))}
                            </ContextMenuTrigger>
                            <ContextMenuContent>
                              {isMine && (
                                <ContextMenuItem onSelect={() => startEdit(comment)}>
                                  {t("pages.comments.edit")}
                                </ContextMenuItem>
                              )}
                              {(canDelete || isMine) && (
                                <ContextMenuItem
                                  variant="destructive"
                                  onSelect={() => deleteComment.mutate({ commentId: comment.id })}
                                >
                                  {t("pages.comments.delete")}
                                </ContextMenuItem>
                              )}
                            </ContextMenuContent>
                          </ContextMenu>
                        )}

                        {/* Время — ПОД пузырём, не в шапке рядом с ником (design review со
                            Stitch-скрином: имя опознаёт автора сверху, время — метаданные снизу). */}
                        {editingId !== comment.id && (
                          <MessageFooter className="gap-1">
                            <span>{timeFormatter.format(new Date(comment.createdAt))}</span>
                            {comment.editedAt && <span>{t("pages.comments.edited")}</span>}
                            {isMine &&
                              (comment.pending ? (
                                <Clock role="img" className="h-3 w-3" aria-label={t("pages.comments.sending")} />
                              ) : (
                                <Check role="img" className="h-3 w-3" aria-label={t("pages.comments.sent")} />
                              ))}
                          </MessageFooter>
                        )}
                      </MessageContent>
                    </Message>
                  </Fragment>
                );
              })}
            </MessageGroup>
          </ScrollArea>
        )}

        <div className="flex shrink-0 flex-col gap-1 border-t border-border bg-muted/40 p-3">
          {/* bg-background (не transparent, как раньше) — поле ввода читается отдельно от карточки
              ленты, не сливается с ней (design review). */}
          <MentionTextarea
            ref={inputRef}
            candidates={candidates}
            placeholder={t("pages.comments.placeholder")}
            sendLabel={t("pages.comments.send")}
            disabled={addComment.isPending}
            className="bg-background"
            onSubmit={({ body, mentionedUserIds }) => addComment.mutate({ body, mentionedUserIds })}
          />
          {/* Подсказка про @-упоминание — отдельной строкой, не частью placeholder: длинный placeholder
              в узком сайдбаре (360px) переносился на 2 строки и ломал высоту инпута рядом с кнопкой
              отправки (bug report); текст здесь не зависит от ширины contentEditable-плейсхолдера. */}
          <p className="text-xs text-muted-foreground">{t("pages.comments.mentionHint")}</p>
        </div>
      </div>
    </div>
  );
}
