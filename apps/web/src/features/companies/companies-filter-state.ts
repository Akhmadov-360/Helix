export interface CompaniesFilterState {
  industries: Set<string>;
  minDeals: number | null;
}

export const initialCompaniesFilter: CompaniesFilterState = {
  industries: new Set(),
  minDeals: null,
};

export function isCompaniesFilterActive(state: CompaniesFilterState): boolean {
  return state.industries.size > 0 || state.minDeals !== null;
}
