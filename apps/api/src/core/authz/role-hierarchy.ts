import type { Role } from "@helix/db";

/**
 * Ранжирование org-ролей (invites.md §4) — общий модуль, не приватная константа одного
 * потребителя: появится новая роль — обновить один раз здесь, а не в каждом месте, которое
 * решило посчитать ранги самостоятельно. Сегодняшний единственный потребитель — InvitesService
 * (нельзя пригласить роль выше своей), но `changeMemberRole` — кандидат на переиспользование
 * (сейчас там иерархии нет вообще, сознательно, см. invites.md §4).
 */
const ROLE_RANK: Record<Role, number> = { VIEWER: 0, MEMBER: 1, MANAGER: 2, ADMIN: 3, OWNER: 4 };

export function roleRank(role: Role): number {
  return ROLE_RANK[role];
}

export function compareRoles(a: Role, b: Role): number {
  return roleRank(a) - roleRank(b);
}

/** true, если granter вправе выдать role (role не выше его собственного ранга). */
export function canGrantRole(granterRole: Role, role: Role): boolean {
  return roleRank(role) <= roleRank(granterRole);
}
