// Тип + инициализатор + предикат — отдельно от .tsx (react-refresh требует чтобы .tsx экспортил
// только компоненты; смешение non-component экспортов ломает HMR-обновление).
export interface ContactsFilterState {
  companies: Set<string>;
  minDeals: number | null;
}

export const initialContactsFilter: ContactsFilterState = {
  companies: new Set(),
  minDeals: null,
};

export function isContactsFilterActive(state: ContactsFilterState): boolean {
  return state.companies.size > 0 || state.minDeals !== null;
}
