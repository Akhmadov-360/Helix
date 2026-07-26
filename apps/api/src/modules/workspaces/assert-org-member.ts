import type { Prisma } from "@helix/db";
import { UserNotOrgMemberError } from "../../core/errors/domain-error";
import type { OrganizationsRepository } from "../organizations/organizations.repository";

/**
 * Общий guard «назначаемый пользователь — член этой орги» (project-links.md §6.3). Два потребителя:
 * reassign (owner) и assignee (co-worker) — обе операции назначают User орги на лид. Composite-FK
 * не спасает: Project.owner/ProjectAssignee.user ссылаются на User(id), не на Membership → членство
 * проверяем прикладно. Нет членства → 400 (дыра tenant-изоляции, не 404).
 */
export async function assertOrgMember(
  orgs: OrganizationsRepository,
  userId: string,
  orgId: string,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  if ((await orgs.findMembershipRole(userId, orgId, tx)) === null) {
    throw new UserNotOrgMemberError();
  }
}
