// pages-kb.md §2 — в отличие от lead-created/assignment (только id, EmailWorker рефетчит на
// момент обработки), здесь поля резолвятся уже на enqueue: комментарий сам по себе — то, что
// произошло, повторный рефетч контента на момент обработки задачи не нужен и не более "свежий".
export interface MentionJobData {
  mentionedUserEmail: string;
  mentionedUserName: string;
  actorName: string;
  pageId: string;
  pageTitle: string;
  projectId: string;
  commentBody: string; // P3: обрезанное превью, не весь текст — см. MENTION_COMMENT_PREVIEW_LENGTH
}

export const MENTION_JOB = "page.mention";

// §2 — P3: превью комментария в письме, не весь текст (комментарий уже ограничен 5000 символами,
// но письмо не должно тащить это целиком).
export const MENTION_COMMENT_PREVIEW_LENGTH = 200;
