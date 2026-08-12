import { useRef } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import {
  Button,
  Message,
  MessageContent,
  MessageGroup,
  MessageHeader,
  MentionTextarea,
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
  const canDelete = MANAGER_PLUS_ROLES.has(me.role);

  return (
    <div className="flex flex-col gap-4 border-t border-border pt-4">
      <h2 className="text-sm font-medium text-muted-foreground">{t("pages.comments.title")}</h2>

      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("pages.comments.empty")}</p>
      ) : (
        <MessageGroup>
          {comments.map((comment) => (
            <Message key={comment.id}>
              <MessageContent>
                <MessageHeader>
                  <span>{comment.authorName ?? t("pages.comments.deletedAuthor")}</span>
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
                <p className="whitespace-pre-wrap px-3 text-sm">{comment.body}</p>
              </MessageContent>
            </Message>
          ))}
        </MessageGroup>
      )}

      <MentionTextarea
        ref={inputRef}
        candidates={candidates}
        placeholder={t("pages.comments.placeholder")}
        disabled={addComment.isPending}
        onSubmit={({ body, mentionedUserIds }) => addComment.mutate({ body, mentionedUserIds })}
      />
    </div>
  );
}
