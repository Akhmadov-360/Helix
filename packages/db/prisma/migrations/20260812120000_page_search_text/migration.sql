-- CLAUDE.md manual-migration point #6: функциональный GIN-индекс, Prisma schema его не выражает.
-- Не давать `prisma migrate dev` перегенерить/уронить этот индекс.

ALTER TABLE "Page" ADD COLUMN "searchText" TEXT NOT NULL DEFAULT '';

-- Бэкфилл для строк, созданных до этой миграции — иначе они выпадают из полнотекстового поиска
-- до первого редактирования. jsonpath '$.**.text' рекурсивно собирает все text-узлы TipTap JSON
-- на любой глубине — тот же обход, что extractPlainText() в apps/api/src/core/lib/full-text-search.ts.
UPDATE "Page" SET "searchText" = trim(title || ' ' || COALESCE((
  SELECT string_agg(txt, ' ') FROM jsonb_array_elements_text(jsonb_path_query_array(content, '$.**.text')) AS txt
), ''));

CREATE INDEX "Page_searchText_gin_idx" ON "Page" USING GIN (to_tsvector('simple', "searchText"));
