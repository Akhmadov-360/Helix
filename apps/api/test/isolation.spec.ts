import { describe, expect, it } from "vitest";
import { prisma } from "@helix/db";

/**
 * Тест НА САМ ХАРНЕСС, а не на продукт.
 *
 * Оба теста пишут в одну и ту же таблицу и оба ожидают увидеть ровно одну строку.
 * Это проходит ТОЛЬКО если beforeEach действительно вычистил БД между ними.
 * Сломается TRUNCATE — второй тест увидит 2 и покраснеет.
 *
 * Без такой проверки «зелёные» тесты auth ничего не стоят: протёкшее между
 * тестами состояние даёт и ложные проходы, и ложные падения.
 */
describe("изоляция тестов (TRUNCATE в beforeEach)", () => {
  it("первый тест создаёт организацию и видит ровно одну", async () => {
    await prisma.organization.create({ data: { name: "Org from test #1" } });
    expect(await prisma.organization.count()).toBe(1);
  });

  it("второй тест стартует с чистой БД, а не видит данные первого", async () => {
    expect(await prisma.organization.count()).toBe(0);

    await prisma.organization.create({ data: { name: "Org from test #2" } });
    expect(await prisma.organization.count()).toBe(1);
  });

  it("TRUNCATE ... CASCADE справляется со связанными таблицами", async () => {
    const org = await prisma.organization.create({ data: { name: "Org with children" } });
    await prisma.workspace.create({ data: { orgId: org.id, name: "WS" } });

    expect(await prisma.workspace.count()).toBe(1);
    // Сам факт, что beforeEach следующего теста не упадёт на FK — часть проверки.
  });
});
