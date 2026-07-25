-- ВНИМАНИЕ: `prisma migrate` сгенерировал сюда `DROP INDEX "phase_ws_order_unique"` —
-- это manual point #1 (Phase DEFERRABLE unique), которого нет в schema.prisma. Строка УДАЛЕНА
-- вручную. НЕ возвращать: снос уронит инвариант порядка фаз. Страж — phase-order-invariant.spec.ts.
-- Урок: каждую новую миграцию после manual point'а вычитывать на предмет их сноса.

-- Project.rank — expand/contract (§9): NOT NULL сразу упал бы на непустой таблице.
ALTER TABLE "Project" ADD COLUMN "rank" VARCHAR(64);

-- Бэкфилл существующих строк — СКРИПТОМ через fractional-indexing
-- (packages/db/prisma/scripts/backfill-project-rank.ts), НЕ SQL-выражением: формат ранга задаёт
-- библиотека (SQL-строки «похожего вида» сортируются верно, но не парсятся ею). На этой вехе
-- Project пуст → no-op; на непустой таблице запускать скрипт ЗДЕСЬ, между ADD COLUMN и SET NOT NULL.
ALTER TABLE "Project" ALTER COLUMN "rank" SET NOT NULL;

-- MANUAL MIGRATION POINT #4 — байтовая коллация под fractional-indexing.
-- DO NOT let prisma regenerate: ALTER COLUMN ... TYPE сбрасывает коллацию молча (см. decisions.md).
ALTER TABLE "Project" ALTER COLUMN "rank" TYPE VARCHAR(64) COLLATE "C";

-- CreateIndex: рендер колонки + keyset-курсор. На C-коллированной колонке.
CREATE INDEX "Project_phaseId_rank_id_idx" ON "Project"("phaseId", "rank", "id");
