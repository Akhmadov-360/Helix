import type { Locale } from "@helix/api-schemas";

// Каноничный каталог (ru) задаёт множество ключей; остальные локали обязаны его повторить (Messages).
// UI-микрокопия живёт ЗДЕСЬ (не хардкод по компонентам). Доменные строки (LocalizedName) — отдельно,
// через localize() (§6.5): два симметричных in-house механизма, без i18n-библиотеки (§1.2).
const ru = {
  "login.title": "Вход в Helix",
  "login.subtitle": "Войдите в свой рабочий аккаунт",
  "login.email": "Email",
  "login.password": "Пароль",
  "login.submit": "Войти",
  "login.submitting": "Вход…",
  "login.error.invalidCredentials": "Неверный email или пароль",
  "login.error.network": "Нет связи с сервером. Проверьте подключение",
  "login.error.generic": "Не удалось войти. Попробуйте ещё раз",
  "shell.logout": "Выйти",
  "home.welcome": "Добро пожаловать в Helix.",
  "role.OWNER": "Владелец",
  "role.ADMIN": "Администратор",
  "role.MANAGER": "Менеджер",
  "role.MEMBER": "Участник",
  "role.VIEWER": "Наблюдатель",
  "validation.email": "Неверный формат email",
  "validation.required": "Обязательное поле",
  "validation.tooShort": "Минимум {min} символов",
  "validation.tooLong": "Максимум {max} символов",
} as const;

export type MessageKey = keyof typeof ru;
export type Messages = Record<MessageKey, string>;

const en: Messages = {
  "login.title": "Sign in to Helix",
  "login.subtitle": "Sign in to your workspace account",
  "login.email": "Email",
  "login.password": "Password",
  "login.submit": "Sign in",
  "login.submitting": "Signing in…",
  "login.error.invalidCredentials": "Invalid email or password",
  "login.error.network": "No connection to the server. Check your network",
  "login.error.generic": "Could not sign in. Please try again",
  "shell.logout": "Sign out",
  "home.welcome": "Welcome to Helix.",
  "role.OWNER": "Owner",
  "role.ADMIN": "Admin",
  "role.MANAGER": "Manager",
  "role.MEMBER": "Member",
  "role.VIEWER": "Viewer",
  "validation.email": "Invalid email address",
  "validation.required": "This field is required",
  "validation.tooShort": "At least {min} characters",
  "validation.tooLong": "At most {max} characters",
};

const uz: Messages = {
  "login.title": "Helix'ga kirish",
  "login.subtitle": "Ish hisobingizga kiring",
  "login.email": "Email",
  "login.password": "Parol",
  "login.submit": "Kirish",
  "login.submitting": "Kirilmoqda…",
  "login.error.invalidCredentials": "Email yoki parol noto‘g‘ri",
  "login.error.network": "Server bilan aloqa yo‘q. Ulanishni tekshiring",
  "login.error.generic": "Kirib bo‘lmadi. Qaytadan urinib ko‘ring",
  "shell.logout": "Chiqish",
  "home.welcome": "Helix'ga xush kelibsiz.",
  "role.OWNER": "Egasi",
  "role.ADMIN": "Administrator",
  "role.MANAGER": "Menejer",
  "role.MEMBER": "A'zo",
  "role.VIEWER": "Kuzatuvchi",
  "validation.email": "Email formati noto‘g‘ri",
  "validation.required": "Majburiy maydon",
  "validation.tooShort": "Kamida {min} ta belgi",
  "validation.tooLong": "Ko‘pi bilan {max} ta belgi",
};

export const DEFAULT_LOCALE: Locale = "ru";
const catalogs: Record<Locale, Messages> = { ru, en, uz };

type Params = Record<string, string | number>;

function format(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    params[key] === undefined ? `{${key}}` : String(params[key]),
  );
}

// Ключ обязан существовать в каноне → нет «немого» пропуска строки; при отсутствии в локали
// откатываемся на DEFAULT_LOCALE (частичный перевод не ломает UI).
export function translate(locale: Locale, key: MessageKey, params?: Params): string {
  const template = catalogs[locale][key] ?? catalogs[DEFAULT_LOCALE][key];
  return format(template, params);
}
