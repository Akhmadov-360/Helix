import type { ChatMessage } from "@helix/ai";

const CHARS_PER_TOKEN = 3;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

interface FitInput {
  budget: number;
  fixed: string[];
  history: ChatMessage[];
  excerpts: string[];
}

interface FitResult {
  history: ChatMessage[];
  excerpts: string[];
  tokens: number;
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

export function fitToTokenBudget({ budget, fixed, history, excerpts }: FitInput): FitResult {
  const historyCosts = history.map((message) => estimateTokens(message.content));
  const excerptCosts = excerpts.map(estimateTokens);
  let tokens = sum(fixed.map(estimateTokens)) + sum(historyCosts) + sum(excerptCosts);

  let historyStart = 0;
  while (tokens > budget && historyStart < history.length) {
    tokens -= historyCosts[historyStart]!;
    historyStart++;
  }

  let excerptEnd = excerpts.length;
  while (tokens > budget && excerptEnd > 0) {
    excerptEnd--;
    tokens -= excerptCosts[excerptEnd]!;
  }

  return { history: history.slice(historyStart), excerpts: excerpts.slice(0, excerptEnd), tokens };
}
