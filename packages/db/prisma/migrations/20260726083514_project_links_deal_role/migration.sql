/*
  Warnings:

  - The `roles` column on the `ProjectContact` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "DealRole" AS ENUM ('CHAMPION', 'DECISION_MAKER', 'ECONOMIC_BUYER', 'TECHNICAL_BUYER', 'INFLUENCER', 'BLOCKER');

-- NB: Prisma-сгенерированный `DROP INDEX "phase_ws_order_unique";` УДАЛЁН вручную (manual-point #1,
-- gotcha #4) — DEFERRABLE unique на Phase живёт в raw SQL, не давать пересоздать.

-- AlterTable: roles String[] → DealRole[]. Prisma делает DROP+ADD (не ALTER TYPE ... USING) для
-- несовместимой смены типа массива. ProjectContact пуст в этом срезе → потери данных нет.
ALTER TABLE "ProjectContact" DROP COLUMN "roles",
ADD COLUMN     "roles" "DealRole"[] DEFAULT ARRAY[]::"DealRole"[];

-- CreateIndex
CREATE INDEX "ProjectContact_contactId_orgId_idx" ON "ProjectContact"("contactId", "orgId");
