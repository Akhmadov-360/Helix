import { AbilityBuilder, createMongoAbility, type MongoAbility } from "@casl/ability";
import type { Role } from "@helix/db";

export type AppAction = "manage" | "create" | "read" | "update" | "delete";
export type AppSubject = "Workspace" | "Phase" | "Project" | "Company" | "Contact" | "all";
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
      // Проекты: create/read/update (move/archive/restore — это update), но НЕ delete (§1: delete = O/A).
      can("read", "Project");
      can("create", "Project");
      can("update", "Project");
      // Контакты/компании: create/read/update, но НЕ delete и НЕ merge (contacts.md §2: delete/merge = O/A).
      can("read", "Company");
      can("create", "Company");
      can("update", "Company");
      can("read", "Contact");
      can("create", "Contact");
      can("update", "Contact");
      break;
    case "MEMBER":
      can("read", "Workspace");
      can("read", "Phase");
      can("read", "Project");
      can("read", "Company");
      // Контакты — общая адресная книга (contacts.md §10): Member заводит и правит контакты,
      // но НЕ удаляет и НЕ мёржит (delete/merge = O/A). Компании create/update Member не может (§2).
      can("read", "Contact");
      can("create", "Contact");
      can("update", "Contact");
      break;
    case "VIEWER":
      can("read", "Workspace");
      can("read", "Phase");
      can("read", "Project");
      can("read", "Company");
      can("read", "Contact");
      break;
  }

  return build();
}
