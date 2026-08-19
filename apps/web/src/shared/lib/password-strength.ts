// passwordSchema (api-schemas) реально проверяет только длину (min 12) — это единственное, что
// сервер валидирует. Индикатор/чек-лист ниже — не замена валидации (та уже есть через
// zod/errors.password), а честная подсказка о запасе прочности сверх минимума.

export type PasswordRequirementKey = "length" | "case" | "symbols";

// Порядок фиксирован — тот же порядок и в чек-листе, и в расчёте score ниже (симметрия).
const REQUIREMENTS: { key: PasswordRequirementKey; test: (p: string) => boolean }[] = [
  { key: "length", test: (p) => p.length >= 12 },
  { key: "case", test: (p) => /[a-z]/.test(p) && /[A-Z]/.test(p) },
  { key: "symbols", test: (p) => /\d/.test(p) && /[^a-zA-Z0-9]/.test(p) },
];

export function passwordRequirementsMet(password: string): Record<PasswordRequirementKey, boolean> {
  return Object.fromEntries(REQUIREMENTS.map((r) => [r.key, r.test(password)])) as Record<
    PasswordRequirementKey,
    boolean
  >;
}

export function passwordStrength(password: string): 0 | 1 | 2 | 3 | 4 {
  if (password.length < 12) return 0;
  let score = 1;
  if (password.length >= 16) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password) && /[^a-zA-Z0-9]/.test(password)) score++;
  return score as 1 | 2 | 3 | 4;
}
