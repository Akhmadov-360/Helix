-- PageComment.editedAt: nullable timestamp set when a comment's body is edited (author-only).
ALTER TABLE "PageComment" ADD COLUMN "editedAt" TIMESTAMP(3);
