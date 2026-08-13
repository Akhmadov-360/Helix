-- CLAUDE.md manual-migration point #7: функциональный GIN-индекс, Prisma schema его не выражает.
-- Не давать `prisma migrate dev` перегенерить/уронить этот индекс.

ALTER TABLE "KBArticle" ADD COLUMN "icon" TEXT;
ALTER TABLE "KBArticle" ADD COLUMN "authorId" TEXT;
ALTER TABLE "KBArticle" ADD COLUMN "searchText" TEXT NOT NULL DEFAULT '';

ALTER TABLE "KBArticle" ADD CONSTRAINT "KBArticle_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Бэкфилл для статей, созданных до этой миграции — тот же приём, что 20260812120000_page_search_text.
UPDATE "KBArticle" SET "searchText" = trim(title || ' ' || COALESCE((
  SELECT string_agg(txt, ' ') FROM jsonb_array_elements_text(jsonb_path_query_array(content, '$.**.text')) AS txt
), ''));

CREATE INDEX "KBArticle_searchText_gin_idx" ON "KBArticle" USING GIN (to_tsvector('simple', "searchText"));
