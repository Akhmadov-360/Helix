import { useLocaleStore } from "./store";
import { translate, type MessageKey } from "./messages";

type Params = Record<string, string | number>;
export type TFunction = (key: MessageKey, params?: Params) => string;

// React-хук: перевод реактивно следует за текущей локалью (ре-рендер при смене).
export function useT(): TFunction {
  const locale = useLocaleStore((state) => state.locale);
  return (key, params) => translate(locale, key, params);
}

// Не-React перевод (zod error-map, вне рендера): читает локаль из стора на момент вызова.
export function t(key: MessageKey, params?: Params): string {
  return translate(useLocaleStore.getState().locale, key, params);
}
