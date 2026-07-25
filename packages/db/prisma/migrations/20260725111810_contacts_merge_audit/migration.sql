-- DropForeignKey
ALTER TABLE "Contact" DROP CONSTRAINT "Contact_companyId_orgId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectContact" DROP CONSTRAINT "ProjectContact_contactId_orgId_fkey";

-- NB: Prisma-сгенерированный `DROP INDEX "phase_ws_order_unique";` УДАЛЁН вручную.
-- Это manual-point #1 (DEFERRABLE unique на Phase(workspaceId, order), raw SQL) — Prisma его
-- не моделирует и на каждом diff предлагает уронить. Не давать пересоздать (gotcha #4).

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "mergedIntoId" TEXT;

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_orgId_createdAt_idx" ON "AuditLog"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_orgId_action_createdAt_idx" ON "AuditLog"("orgId", "action", "createdAt");

-- AddForeignKey
ALTER TABLE "ProjectContact" ADD CONSTRAINT "ProjectContact_contactId_orgId_fkey" FOREIGN KEY ("contactId", "orgId") REFERENCES "Contact"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- MANUAL POINT #5 (contacts.md §6/§9.1): partial SET NULL на composite-FK.
-- Prisma генерит полный `ON DELETE SET NULL` (обе колонки) → при удалении Company пытается
-- занулить и orgId (NOT NULL) → падает (эмпирически подтверждено). PG15+ умеет подмножество
-- колонок: зануляем ТОЛЬКО companyId, orgId цел. Prisma этот синтаксис НЕ выражает — не давать
-- migrate пересоздать этот FK как полный SET NULL. Guard-тест: delete-company-setnull.spec.
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_companyId_orgId_fkey" FOREIGN KEY ("companyId", "orgId") REFERENCES "Company"("id", "orgId") ON DELETE SET NULL ("companyId") ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_mergedIntoId_orgId_fkey" FOREIGN KEY ("mergedIntoId", "orgId") REFERENCES "Contact"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
