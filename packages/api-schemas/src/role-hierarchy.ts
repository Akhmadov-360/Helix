import type { Role } from "./auth";

/**
 * Ранжирование org-ролей (invites.md §4). Общий модуль, который используют И бэкенд
 * (InvitesService, OrganizationsService, ai-threads.service, pages.service), И фронт
 * (MembersPage — скрыть affordance'ы на строках, где actor не может ничего сделать
 * с target'ом). Живёт в api-schemas, а не в apps/api, ровно чтобы не дублировать
 * иерархию в двух местах — расхождение UI и сервера в этой матрице = дыра.
 */
const ROLE_RANK: Record<Role, number> = { VIEWER: 0, MEMBER: 1, MANAGER: 2, ADMIN: 3, OWNER: 4 };

export function roleRank(role: Role): number {
  return ROLE_RANK[role];
}

export function compareRoles(a: Role, b: Role): number {
  return roleRank(a) - roleRank(b);
}

/**
 * true, если granter вправе выдать role (role не выше его собственного ранга).
 * Используется в InvitesService (нельзя пригласить роль выше своей) и в
 * OrganizationsService.changeMemberRole (нельзя промоут'нуть кого-либо выше себя,
 * включая себя же — путь Admin → self → OWNER).
 */
export function canGrantRole(granterRole: Role, role: Role): boolean {
  return roleRank(role) <= roleRank(granterRole);
}

/**
 * true, если actor может **менять/удалять** membership с ролью target. Строго `>`, не `>=`
 * — Admin не может трогать другого Admin'а (симметричное действие = хаос: два Admin'а
 * могли бы взаимно понижать друг друга). Owner может трогать кого угодно (кроме сохранности
 * последнего Owner'а — это отдельный инвариант, LastOwnerError, не иерархия).
 */
export function canManageMember(actorRole: Role, targetRole: Role): boolean {
  return roleRank(actorRole) > roleRank(targetRole);
}
