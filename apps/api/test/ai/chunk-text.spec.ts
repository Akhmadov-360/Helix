import { describe, expect, it } from "vitest";
import { chunkBlocks, splitIntoBlocks } from "../../src/core/lib/chunk-text";

// ai-chat.md §10 (unit): "длинный текст → чанки ожидаемого размера с overlap, границы по параграфам".
describe("chunkBlocks (core/lib/chunk-text.ts)", () => {
  it("блок короче лимита → один чанк, без потери слов", () => {
    const chunks = chunkBlocks(["short paragraph with a few words"]);
    expect(chunks).toEqual(["short paragraph with a few words"]);
  });

  it("несколько коротких блоков умещаются в один чанк, пока не превышен лимит", () => {
    const chunks = chunkBlocks(["first paragraph", "second paragraph", "third paragraph"]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe("first paragraph second paragraph third paragraph");
  });

  it("блок, из-за которого суммарно превышается 500 слов, уходит в НОВЫЙ чанк с overlap в 50 слов из предыдущего", () => {
    const firstBlock = Array.from({ length: 480 }, (_, i) => `w${i}`).join(" ");
    const secondBlock = Array.from({ length: 100 }, (_, i) => `x${i}`).join(" ");
    const chunks = chunkBlocks([firstBlock, secondBlock]);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.split(" ")).toHaveLength(480);
    // Overlap: последние 50 слов первого блока (w430..w479) открывают второй чанк.
    const secondWords = chunks[1]!.split(" ");
    expect(secondWords.slice(0, 50)).toEqual(Array.from({ length: 50 }, (_, i) => `w${430 + i}`));
    expect(secondWords.slice(50)).toEqual(Array.from({ length: 100 }, (_, i) => `x${i}`));
  });

  it("один блок длиннее 500 слов сам по себе — хард-сплит внутри него (шаг 450 слов = 500-50 overlap)", () => {
    const words = Array.from({ length: 1200 }, (_, i) => `w${i}`);
    const chunks = chunkBlocks([words.join(" ")]);

    // step = 500 - 50 = 450; чанки начинаются на индексах 0, 450, 900.
    expect(chunks).toHaveLength(3);
    expect(chunks[0]!.split(" ")).toEqual(words.slice(0, 500));
    expect(chunks[1]!.split(" ")).toEqual(words.slice(450, 950));
    expect(chunks[2]!.split(" ")).toEqual(words.slice(900, 1200));
  });

  it("никогда не теряет слова — конкатенация всех чанков (без overlap-дублей) покрывает исходный текст", () => {
    const words = Array.from({ length: 1000 }, (_, i) => `w${i}`);
    const chunks = chunkBlocks([words.join(" ")]);

    const seen = new Set<string>();
    for (const chunk of chunks) for (const w of chunk.split(" ")) seen.add(w);
    expect(seen.size).toBe(1000); // каждое исходное слово встретилось хотя бы раз
  });

  it("пустые/whitespace-блоки игнорируются, не создают пустых чанков", () => {
    expect(chunkBlocks(["", "   ", "real content"])).toEqual(["real content"]);
    expect(chunkBlocks(["", "   "])).toEqual([]);
  });

  it("пустой массив блоков → пустой массив чанков", () => {
    expect(chunkBlocks([])).toEqual([]);
  });
});

describe("splitIntoBlocks (attachment plain-text → параграфы)", () => {
  it("делит по двойным переносам строк, тримит и отбрасывает пустые", () => {
    const text = "First paragraph.\n\n\nSecond paragraph.\n\n  \n\nThird.";
    expect(splitIntoBlocks(text)).toEqual(["First paragraph.", "Second paragraph.", "Third."]);
  });

  it("одиночный перенос строки НЕ считается границей параграфа", () => {
    expect(splitIntoBlocks("line one\nline two")).toEqual(["line one\nline two"]);
  });
});
