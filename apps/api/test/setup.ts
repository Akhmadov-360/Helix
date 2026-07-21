import { afterAll, beforeEach } from "vitest";
import { prisma } from "@helix/db";

/**
 * Изоляция между тестами — TRUNCATE, а НЕ транзакция с откатом.
 *
 * Почему не откат: сценарии auth многотранзакционные по своей природе (ротация
 * refresh — своя транзакция, kill-family — своя, конкурентный refresh — вообще два
 * параллельных коннекта). Обёртка «весь тест в одной транзакции» такие сценарии
 * либо ломает, либо делает нереалистичными. TRUNCATE честнее: тест видит ровно то
 * же поведение БД, что и прод.
 *
 * Список таблиц читаем из pg_tables динамически — не придётся дописывать сюда
 * каждую новую модель. `_prisma_migrations` исключаем: снесём её — потеряем
 * применённые миграции, и следующий тест побежит по пустой схеме.
 */
beforeEach(async () => {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'
  `;

  if (tables.length === 0) return;

  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  // RESTART IDENTITY — сброс sequence'ов; CASCADE — чтобы FK не мешали порядку.
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await prisma.$disconnect();
});
