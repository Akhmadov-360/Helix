import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@helix/ai";
import { estimateTokens, fitToTokenBudget } from "../../src/modules/ai/prompt-budget";

const text = (tokens: number) => "x".repeat(tokens * 3);
const message = (role: ChatMessage["role"], tokens: number, tag: string): ChatMessage => ({
  role,
  content: `${tag}${text(tokens)}`.slice(0, tokens * 3),
});

describe("estimateTokens", () => {
  it("пустая строка = 0 токенов", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("оценка — длина / 3, округление вверх", () => {
    expect(estimateTokens("abc")).toBe(1);
    expect(estimateTokens("abcd")).toBe(2);
    expect(estimateTokens("x".repeat(300))).toBe(100);
  });

  it("кириллица оценивается по тем же правилам, что и латиница", () => {
    expect(estimateTokens("привет")).toBe(estimateTokens("hellos"));
  });
});

describe("fitToTokenBudget", () => {
  it("всё помещается в бюджет — ничего не режет", () => {
    const history = [message("user", 50, "u1"), message("assistant", 50, "a1")];
    const excerpts = [text(100), text(100)];

    const result = fitToTokenBudget({ budget: 1000, fixed: [text(100)], history, excerpts });

    expect(result.history).toEqual(history);
    expect(result.excerpts).toEqual(excerpts);
    expect(result.tokens).toBe(400);
  });

  it("ровно в бюджет — не режет", () => {
    const history = [message("user", 100, "u1")];

    const result = fitToTokenBudget({ budget: 200, fixed: [text(100)], history, excerpts: [] });

    expect(result.history).toEqual(history);
    expect(result.tokens).toBe(200);
  });

  it("при превышении сначала режет самое старое сообщение истории, excerpts не трогает", () => {
    const [m1, m2, m3] = [message("user", 100, "m1"), message("assistant", 100, "m2"), message("user", 100, "m3")];
    const excerpts = [text(100)];

    const result = fitToTokenBudget({ budget: 400, fixed: [text(100)], history: [m1!, m2!, m3!], excerpts });

    expect(result.history).toEqual([m2, m3]);
    expect(result.excerpts).toEqual(excerpts);
  });

  it("историю режет целыми сообщениями с головы, свежие остаются в исходном порядке", () => {
    const [m1, m2, m3] = [message("user", 100, "m1"), message("assistant", 100, "m2"), message("user", 100, "m3")];

    const result = fitToTokenBudget({ budget: 350, fixed: [text(100)], history: [m1!, m2!, m3!], excerpts: [text(100)] });

    expect(result.history).toEqual([m3]);
  });

  it("когда история исчерпана — режет excerpts с хвоста, лучший остаётся последним", () => {
    const [e1, e2, e3] = [text(100) + "1", text(100) + "2", text(100) + "3"];

    const result = fitToTokenBudget({
      budget: 250,
      fixed: [text(100)],
      history: [message("user", 100, "m1")],
      excerpts: [e1, e2, e3],
    });

    expect(result.history).toEqual([]);
    expect(result.excerpts).toEqual([e1]);
  });

  it("фиксированная часть не режется, даже если сама превышает бюджет", () => {
    const result = fitToTokenBudget({
      budget: 100,
      fixed: [text(1000)],
      history: [message("user", 50, "m1")],
      excerpts: [text(50)],
    });

    expect(result.history).toEqual([]);
    expect(result.excerpts).toEqual([]);
    expect(result.tokens).toBe(1000);
  });

  it("tokens считает фиксированную часть, оставшуюся историю и excerpts", () => {
    const result = fitToTokenBudget({
      budget: 10_000,
      fixed: [text(10), text(20)],
      history: [message("user", 30, "m1")],
      excerpts: [text(40)],
    });

    expect(result.tokens).toBe(100);
  });

  it("пустые вход и история — только фиксированная часть", () => {
    const result = fitToTokenBudget({ budget: 500, fixed: [text(10)], history: [], excerpts: [] });

    expect(result).toEqual({ history: [], excerpts: [], tokens: 10 });
  });
});
