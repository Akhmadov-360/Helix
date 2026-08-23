import type { Role } from "@helix/api-schemas";

// Тип + инициализатор + предикат "фильтр активен" — в отдельном файле от MembersFilterChips
// (react-refresh требует чтобы .tsx экспортил только компоненты; смешение non-component экспортов
// ломает HMR-обновление).
export interface MembersFilterState {
  roles: Set<Role>;
  minLeads: number | null;
  minTasks: number | null;
}

export const initialMembersFilter: MembersFilterState = {
  roles: new Set(),
  minLeads: null,
  minTasks: null,
};

export function isMembersFilterActive(state: MembersFilterState): boolean {
  return state.roles.size > 0 || state.minLeads !== null || state.minTasks !== null;
}
