import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";
import { describe, expect, it } from "vitest";

/**
 * §3.1 требует ПОДТВЕРДИТЬ поведение библиотеки эмпирически, а не по памяти —
 * от него зависит выбор base62 + байтовая коллация (manual point #4). Этот тест и
 * есть то подтверждение; заодно страж: смена/апгрейд библиотеки, меняющий формат,
 * покраснеет здесь, а не тихо поедет карточками в проде.
 */
describe("fractional-indexing — свойства, на которые опираемся", () => {
  it("первый ключ пустой колонки = 'a0'", () => {
    expect(generateKeyBetween(null, null)).toBe("a0");
    expect(generateKeyBetween("a0", null)).toBe("a1");
  });

  it("prepend перед первым даёт ключ с ЗАГЛАВНОЙ головой (несовместимость base36)", () => {
    // Знак целой части кодируется регистром головы: A-Z = отрицательная. Именно поэтому
    // lowercase-алфавит несовместим с библиотекой, и защита остаётся одна — коллация.
    const prepended = generateKeyBetween(null, "a0");
    expect(prepended).toBe("Zz");
    expect(prepended[0]).toMatch(/[A-Z]/);
  });

  it("байтовый порядок (COLLATE \"C\") согласован с логикой ранга", () => {
    // 'Z'(90) < 'a'(97) в байтах. JS-сортировка строк — по code units, т.е. байтовая
    // для ASCII → совпадает с COLLATE "C". Дефолтная коллация Postgres — НЕТ (§3.1).
    const first = generateKeyBetween(null, null); // "a0"
    const beforeFirst = generateKeyBetween(null, first); // "Zz"
    expect([first, beforeFirst].sort()).toEqual([beforeFirst, first]); // Zz < a0
  });

  it("плотный набор из N ключей отсортирован по возрастанию", () => {
    const keys = generateNKeysBetween(null, null, 5);
    expect(keys).toEqual(["a0", "a1", "a2", "a3", "a4"]);
    expect([...keys].sort()).toEqual(keys);
  });

  it("prepend НЕ растит длину неограниченно (§4.4: двигает целую часть)", () => {
    let key = generateKeyBetween(null, null);
    for (let i = 0; i < 100; i += 1) key = generateKeyBetween(null, key);
    expect(key.length).toBeLessThanOrEqual(4);
  });

  it("повторная вставка В ОДНУ щель растит длину → нужна рекомпакция", () => {
    let lo = "a0";
    const hi = "a1";
    for (let i = 0; i < 50; i += 1) lo = generateKeyBetween(lo, hi);
    expect(lo.length).toBeGreaterThan(10); // деградация длиной, не потерей порядка
    expect(generateKeyBetween(lo, hi) > lo).toBe(true); // порядок всё ещё корректен
  });
});
