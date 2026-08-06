import { AbilityBuilder, createMongoAbility, type MongoAbility } from "@casl/ability";
import type { Role } from "@helix/db";

// merge — отдельный action (не delete): merge=Owner/Admin, а delete Contact/Company=Manager+.
// Если бы merge гейтился через "delete", Manager получил бы merge — нарушение матрицы.
// reassign — отдельный action (не update): смена ownerId лида = Manager+ (матрица «Reassign
// leads»), тогда как edit лида = Member+. Поле-в-PATCH не выразило бы разные права (action-level
// CASL не видит полей) → отдельная операция POST /:id/reassign, как move вынесен из PATCH.
// Массивы, не только типы: capabilities.ts итерирует их механически (§8.2) — единственный
// источник, откуда типы ВЫВОДЯТСЯ, чтобы список действий/субъектов не дублировался вручную.
export const APP_ACTIONS = ["manage", "create", "read", "update", "delete", "merge", "reassign"] as const;
export type AppAction = (typeof APP_ACTIONS)[number];

export const APP_SUBJECTS = [
  "Workspace",
  "Phase",
  "FieldDefinition",
  "Project",
  "Company",
  "Contact",
  "ProjectContact",
  "ProjectAssignee",
  "Task",
  "Blueprint",
] as const;
export type AppSubject = (typeof APP_SUBJECTS)[number] | "all";
export type AppAbility = MongoAbility<[AppAction, AppSubject]>;

/**
 * Права по org-роли (PRD Appendix B + decisions.md ADR «RBAC — две оси»).
 * Строятся из роли, прочитанной guard'ом из Membership на КАЖДОМ запросе.
 *
 * ДВЕ ОСИ (decisions.md): capability (разрешено ли действие роли) и scope (над какими
 * объектами: ALL/ASSIGNED). M1 реализует ТОЛЬКО capability; scope временно = ORG. △-строки
 * матрицы (Member «own/assigned») в M1 = capability allow, сужение до assigned — M6 (условие
 * на объект в CASL, БЕЗ переписывания capability). Поэтому тесты M1 проверяют capability
 * («Member может X»), а НЕ org-wide видимость — последнее временно и не контракт.
 *
 * blast-radius асимметрия для Contact/Company (shared org-ресурс, правка видна всем):
 * create=Member+, read=Member+ (Viewer тоже — глобальный read-only), update/delete=Manager+,
 * merge=Owner/Admin (необратим по связям, §7.7).
 */
export function defineAbilityForRole(role: Role): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

  switch (role) {
    case "OWNER":
    case "ADMIN":
      can("manage", "all"); // включает merge/delete/reassign по всем сущностям
      break;
    case "MANAGER":
      can("read", "Workspace");
      can("create", "Workspace");
      can("update", "Workspace");
      can("read", "Blueprint"); // blueprints.md §6: список читают все — управление (create/delete) = O/A only
      can("manage", "Phase");
      can("manage", "FieldDefinition"); // custom-fields.md §1: те же роли, что «Create/configure workspaces & phases»
      // Лиды: create/read/update (move/archive/restore — update) + reassign, но НЕ delete (O/A).
      can("read", "Project");
      can("create", "Project");
      can("update", "Project");
      can("reassign", "Project"); // «Reassign leads» = Manager+ (Member — нет)
      can("manage", "ProjectContact"); // состав сделки — Manager+ тоже (⊃ Member+)
      can("manage", "ProjectAssignee"); // co-workers — управленческое действие, Manager+
      can("manage", "Task"); // чеклист — Manager+ тоже (⊃ Member+)
      // Contact/Company: полный CRUD-мутатор (update/delete=Manager+), но НЕ merge (=O/A).
      can("read", "Company");
      can("create", "Company");
      can("update", "Company");
      can("delete", "Company");
      can("read", "Contact");
      can("create", "Contact");
      can("update", "Contact");
      can("delete", "Contact");
      break;
    case "MEMBER":
      can("read", "Workspace");
      can("read", "Phase");
      can("read", "FieldDefinition"); // custom-fields.md §1: список полей — «все» роли
      can("read", "Blueprint");
      // Лиды: create/edit/move — Member△ (PRD «Create/edit leads», «Move phases»). Scope=ORG в M1.
      // NB: reassign (смена ownerId) по матрице = Manager+, но это field-level различие внутри
      // update — не выражается action-level CASL. Отложено (field-level policy, M6-adjacent).
      can("read", "Project");
      can("create", "Project");
      can("update", "Project");
      // Contact/Company: create — да (добавление не ломает чужое), update/delete — нет (Manager+).
      can("read", "Company");
      can("create", "Company");
      can("read", "Contact");
      can("create", "Contact");
      // Состав сделки — часть «edit leads» (§2): Member привязывает/правит роли/отвязывает.
      can("manage", "ProjectContact");
      can("read", "ProjectAssignee"); // видит co-workers, но назначение — Manager+ (§2)
      can("manage", "Task"); // чеклист — часть «edit leads» (§2): Member ведёт таски
      break;
    case "VIEWER":
      // Глобальный read-only: видит всё, не меняет ничего.
      can("read", "Workspace");
      can("read", "Phase");
      can("read", "FieldDefinition");
      can("read", "Blueprint");
      can("read", "Project");
      can("read", "Company");
      can("read", "Contact");
      can("read", "ProjectContact");
      can("read", "ProjectAssignee");
      can("read", "Task");
      break;
  }

  return build();
}
