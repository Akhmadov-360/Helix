import type { Role } from "@helix/db";
import type { Capability } from "@helix/api-schemas";
import { APP_SUBJECTS, defineAbilityForRole, type AppAction } from "./app-ability";

/**
 * Поверхность API — какие операции ВООБЩЕ существуют для каждого subject, сверено с реальными
 * @CheckPolicy по всем контроллерам (apps/api/src/modules/**\/*.controller.ts). Это НЕ RBAC:
 * ниже не сказано, кому что можно — только то, что операция физически существует как эндпоинт.
 * RBAC по-прежнему полностью вычисляет CASL (ability.can) в listCapabilities. Добавили новый
 * эндпоинт — добавьте его action сюда один раз (не на каждую роль): без этого шага возможность
 * просто не появится ни у одной роли (fail-safe — не false positive).
 *
 * Явные пробелы (не забыты — API их действительно не имеет):
 * - Phase: нет "read" — отдельного GET /phases/:id нет, фазы читаются только вложенными в
 *   Workspace.read; отдельной capability на них незачем.
 * - ProjectAssignee: нет "update" — только assign(POST)/unassign(DELETE), PATCH не существует.
 * - "merge"/"reassign" — не generic-глаголы: merge существует только у Contact (Owner/Admin,
 *   decisions.md §7.7), reassign — только у Project (Manager+, project-links.md §6).
 *
 * Project.delete: ЕСТЬ (DELETE /v1/projects/:id, @CheckPolicy("delete","Project"),
 * projects.controller.ts) — O/A по app-ability.ts (MANAGER явно без delete, комментарий там же
 * «DELETE — только O/A»). Раньше этой строки не было (см. историю) — эндпоинт был добавлен уже
 * после того, как список поверхности API зафиксировали здесь, из-за чего OWNER/ADMIN физически
 * не могли получить Project.delete через /v1/auth/me, хотя API его разрешал.
 */
const SUBJECT_OPERATIONS = {
  Workspace: ["create", "read", "update", "delete"],
  Phase: ["create", "update", "delete"],
  FieldDefinition: ["create", "read", "update", "delete"],
  Project: ["create", "read", "update", "delete", "reassign"],
  Company: ["create", "read", "update", "delete"],
  Contact: ["create", "read", "update", "delete", "merge"],
  ProjectContact: ["create", "read", "update", "delete"],
  ProjectAssignee: ["create", "read", "delete"],
  Task: ["create", "read", "update", "delete"],
  // blueprints.md §0: без update (PRD не требует редактируемости — создал неправильно, удали).
  Blueprint: ["create", "read", "delete"],
  // Appendix B «Manage members & roles» = O/A only. update = смена роли участника,
  // delete = удаление из орги. read/create нет: ростер читают все (без @CheckPolicy,
  // см. organizations.controller.ts), создание — это POST /v1/organizations (новая
  // орга целиком, не Membership конкретного юзера) — отдельный сценарий без CASL-гейта.
  Membership: ["update", "delete"],
  // Читают все роли (app-ability.ts) — сегодняшний словарь не секретнее уже публичного ростера.
  AuditLog: ["read"],
  // invites.md §5: create/read/delete = O/A only, тот же паттерн, что Membership. "accept" —
  // публичный эндпоинт (владение токеном из письма = личность), не через CASL вообще.
  Invite: ["create", "read", "delete"],
  // FR-ORG-3: currency/timezone/branding/aiProvider. read — все роли (не секретнее ростера),
  // update — O/A only (Appendix B «Manage org settings»). create/delete нет: Organization.settings
  // всегда существует (default "{}" из схемы), отдельного create-эндпоинта не завели.
  Organization: ["read", "update"],
} as const satisfies Record<(typeof APP_SUBJECTS)[number], readonly AppAction[]>;

/**
 * Плоская проекция реального `AppAbility` в список "Subject.action" (frontend-architecture.md
 * §8.2). Цикл по APP_SUBJECTS × SUBJECT_OPERATIONS[subject] (не по всем AppAction поголовно) —
 * убирает CASL-коллатераль "manage" ⊇ любое действие, из-за которой наивный полный перебор
 * возвращал бы несуществующие операции (Project.delete, Task.merge и т.п.) там, где роли выдан
 * широкий "manage"-грант. RBAC не хардкожен: ability.can() по-прежнему единственный источник
 * "разрешено ли".
 */
export function listCapabilities(role: Role): Capability[] {
  const ability = defineAbilityForRole(role);
  const capabilities: Capability[] = [];

  for (const subject of APP_SUBJECTS) {
    for (const action of SUBJECT_OPERATIONS[subject]) {
      if (ability.can(action, subject)) capabilities.push(`${subject}.${action}`);
    }
  }

  return capabilities;
}
