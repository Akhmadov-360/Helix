import { generateNKeysBetween } from "fractional-indexing";
import { PrismaClient } from "@prisma/client";

/**
 * Бэкфилл Project.rank для миграции project_rank (§9). Запускать ВРУЧНУЮ на непустой
 * таблице между `ADD COLUMN rank` и `SET NOT NULL`. На вехе projects/slice-2 таблица
 * пуста → скрипт не нужен; хранится как runbook и как фиксация правила.
 *
 * ПРАВИЛО (выведено из ошибки первого прогона): если формат значения задаёт библиотека,
 * бэкфилл генерирует его ТОЙ ЖЕ библиотекой, а не SQL-выражением «похожего вида».
 * `lpad(to_hex(...))` даёт строки, которые сортируются верно, но не парсятся
 * fractional-indexing (голова '0' не буква) → карточки поедут при первой же вставке.
 *
 * Порядок внутри фазы = createdAt, id (детерминированный tie-break).
 */
async function backfillProjectRank(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const phases = await prisma.phase.findMany({ select: { id: true } });

    for (const { id: phaseId } of phases) {
      const projects = await prisma.project.findMany({
        where: { phaseId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true },
      });
      if (projects.length === 0) continue;

      const keys = generateNKeysBetween(null, null, projects.length); // "a0","a1",…
      await prisma.$transaction(
        projects.map((p, i) =>
          prisma.project.update({ where: { id: p.id }, data: { rank: keys[i] } }),
        ),
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

void backfillProjectRank();
