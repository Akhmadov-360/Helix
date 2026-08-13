import { Fragment, useRef } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
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
  type MentionTextareaHandle,
} from "@helix/ui";
import { useMe } from "../../shared/auth/session";
import { useT, useLocaleStore } from "../../shared/i18n";
import { orgMembersQueryOptions } from "../../shared/org/queries";
import { useAddPageComment, useDeletePageComment } from "./mutations";
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

export function PageComments({ orgId, pageId }: { orgId: string; pageId: string }) {
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);
  const me = useMe();
  const comments = useSuspenseQuery(pageCommentsQueryOptions(orgId, pageId)).data;
  const members = useSuspenseQuery(orgMembersQueryOptions(orgId)).data;
  const addComment = useAddPageComment(orgId, pageId);
  const deleteComment = useDeletePageComment(orgId, pageId);
  const inputRef = useRef<MentionTextareaHandle>(null);
  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

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
            {comments.map((comment) => {
              const authorName = comment.authorName ?? t("pages.comments.deletedAuthor");
              return (
                <Message key={comment.id}>
                  <MessageAvatar>
                    <Avatar name={authorName} size="sm" />
                  </MessageAvatar>
                  <MessageContent>
                    <MessageHeader>
                      <span>{authorName}</span>
                      <span className="ml-2">{dateFormatter.format(new Date(comment.createdAt))}</span>
                      {(canDelete || comment.authorId === me.id) && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={t("pages.comments.delete")}
                          className="ml-auto"
                          onClick={() => deleteComment.mutate({ commentId: comment.id })}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </MessageHeader>
                    <p className="whitespace-pre-wrap px-3 text-sm">
                      {highlightMentions(comment.body, memberNames).map((part, i) => (
                        <Fragment key={i}>{part}</Fragment>
                      ))}
                    </p>
                  </MessageContent>
                </Message>
              );
            })}
          </MessageGroup>
        </ScrollArea>
      )}
    </div>
  );
}
