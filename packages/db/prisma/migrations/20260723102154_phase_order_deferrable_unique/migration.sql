-- Manual migration point #1 (docs/decisions.md → "Manual migration points").
-- DEFERRABLE не выражается в schema.prisma, поэтому @@unique([workspaceId, order])
-- НАМЕРЕННО отсутствует в схеме — иначе prisma migrate создал бы обычный (немедленный)
-- UNIQUE, и перенумерация фаз внутри транзакции падала бы на промежуточных дублях order.
-- НЕ давать prisma пересоздать этот констрейнт как не-DEFERRABLE. Страж — тест
-- apps/api/test/workspaces/phase-order-invariant.spec.ts.

ALTER TABLE "Phase"
  ADD CONSTRAINT "phase_ws_order_unique"
  UNIQUE ("workspaceId", "order") DEFERRABLE INITIALLY DEFERRED;
