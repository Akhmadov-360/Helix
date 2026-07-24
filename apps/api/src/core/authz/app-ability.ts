import { AbilityBuilder, createMongoAbility, type MongoAbility } from "@casl/ability";
import type { Role } from "@helix/db";

export type AppAction = "manage" | "create" | "read" | "update" | "delete";
export type AppSubject = "Workspace" | "Phase" | "all";
export type AppAbility = MongoAbility<[AppAction, AppSubject]>;

/**
 * Права по org-роли (§8 спеки, Appendix B). Строятся из роли, прочитанной guard'ом
 * из Membership на КАЖДОМ запросе — поэтому всегда актуальны.
 *
 * DELETE workspace — только OWNER/ADMIN (`manage all`); MANAGER правит доски и
 * полностью владеет фазами, но доску не удаляет; MEMBER/VIEWER — только чтение.
 */
export function defineAbilityForRole(role: Role): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

  switch (role) {
    case "OWNER":
    case "ADMIN":
      can("manage", "all");
      break;
    case "MANAGER":
      can("read", "Workspace");
      can("create", "Workspace");
      can("update", "Workspace");
      can("manage", "Phase");
      break;
    case "MEMBER":
    case "VIEWER":
      can("read", "Workspace");
      can("read", "Phase");
      break;
  }

  return build();
}
