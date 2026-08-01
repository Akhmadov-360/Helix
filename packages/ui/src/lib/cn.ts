import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// clsx собирает условные классы, twMerge разруливает конфликты Tailwind (последний выигрывает).
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
