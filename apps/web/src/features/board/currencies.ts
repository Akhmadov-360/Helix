// Закрытый список — удобство ввода для частых валют (currency жёстко типизирован ISO-4217,
// decisions.md §currency), НЕ ограничение контракта: бэк по-прежнему принимает любой ISO-код.
export const CURRENCIES = ["USD", "EUR", "RUB", "UZS"] as const;
