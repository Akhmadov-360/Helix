-- createdAt/updatedAt на Contact/Company (contacts.md §1/§3 — часть response-контракта).
-- NB: Prisma-сгенерированный `DROP INDEX "phase_ws_order_unique";` УДАЛЁН вручную (manual-point #1,
-- gotcha #4). updatedAt получает DEFAULT CURRENT_TIMESTAMP, чтобы ADD COLUMN был безопасен и на
-- непустой таблице (Prisma @updatedAt всё равно перезапишет значение на каждом write).

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
