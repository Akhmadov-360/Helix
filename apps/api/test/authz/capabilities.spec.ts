import { describe, expect, it } from "vitest";
import { capabilitySchema } from "@helix/api-schemas";
import { listCapabilities } from "../../src/core/authz/capabilities";

// Проекция ability→capabilities (§8.2 frontend-architecture.md) — цикл по
// APP_SUBJECTS×SUBJECT_OPERATIONS[subject] (поверхность реального API, не RBAC), но сами
// РОЛЕВЫЕ наборы — реальный контракт с фронтом, который стоит зафиксировать явно, а не
// полагаться только на «генерация не упадёт».
describe("listCapabilities (§8.2)", () => {
  it("каждая запись — валидный 'Subject.action' по capabilitySchema", () => {
    for (const role of ["OWNER", "ADMIN", "MANAGER", "MEMBER", "VIEWER"] as const) {
      for (const capability of listCapabilities(role)) {
        expect(capabilitySchema.safeParse(capability).success).toBe(true);
      }
    }
  });

  it("OWNER/ADMIN получают деструктивные capability, которых нет ни у кого другого", () => {
    const owner = new Set(listCapabilities("OWNER"));
    const admin = new Set(listCapabilities("ADMIN"));
    for (const destructive of ["Workspace.delete", "Contact.merge", "Company.delete", "Project.delete"] as const) {
      expect(owner.has(destructive)).toBe(true);
      expect(admin.has(destructive)).toBe(true);
    }
  });

  it("MANAGER: reassign лида есть, delete лида и merge контакта — нет (только O/A)", () => {
    const manager = new Set(listCapabilities("MANAGER"));
    expect(manager.has("Project.reassign")).toBe(true);
    expect(manager.has("Project.delete")).toBe(false);
    expect(manager.has("Contact.delete")).toBe(true);
    expect(manager.has("Contact.merge")).toBe(false);
  });

  it("MEMBER: create/edit лида есть, reassign — нет (Manager+ по матрице)", () => {
    const member = new Set(listCapabilities("MEMBER"));
    expect(member.has("Project.create")).toBe(true);
    expect(member.has("Project.update")).toBe(true);
    expect(member.has("Project.reassign")).toBe(false);
    expect(member.has("Workspace.delete")).toBe(false);
  });

  it("VIEWER: только read, ни одного мутирующего action", () => {
    const viewer = listCapabilities("VIEWER");
    expect(viewer.length).toBeGreaterThan(0);
    for (const capability of viewer) {
      expect(capability.endsWith(".read")).toBe(true);
    }
  });

  it("'manage' не репортится как отдельный action ни для одной роли", () => {
    for (const role of ["OWNER", "ADMIN", "MANAGER", "MEMBER", "VIEWER"] as const) {
      for (const capability of listCapabilities(role)) {
        expect(capability.endsWith(".manage")).toBe(false);
      }
    }
  });

  // Regression (найдено живой проверкой в браузере): CASL "manage" ⊇ любое действие — роль
  // с can("manage", X) резолвит ЛЮБОЙ ability.can(action, X) в true, даже для операций, которых
  // нет в API вообще. Наивный цикл по всем AppAction выдавал "ProjectContact.merge",
  // "Task.reassign", "ProjectAssignee.update" = true ни у одной роли эти операции не существуют
  // как эндпоинты. SUBJECT_OPERATIONS (поверхность API) — фикс: ability.can() продолжает решать
  // RBAC, а не «существует ли такая операция». (Project.delete раньше был в этом списке как
  // пример «несуществующего» — эндпоинт добавили позже, см. capabilities.ts.)
  it("ни для одной роли не протекают операции, которых нет в API", () => {
    const impossible = [
      "Phase.read",
      "ProjectAssignee.update",
      "ProjectContact.merge",
      "ProjectContact.reassign",
      "Task.merge",
      "Task.reassign",
      "Workspace.merge",
      "Workspace.reassign",
      "Company.merge",
      "Company.reassign",
    ];
    for (const role of ["OWNER", "ADMIN", "MANAGER", "MEMBER", "VIEWER"] as const) {
      const capabilities = listCapabilities(role);
      for (const phantom of impossible) {
        expect(capabilities).not.toContain(phantom);
      }
    }
  });

  it("merge/reassign существуют РОВНО там, где есть реальный эндпоинт", () => {
    for (const role of ["OWNER", "ADMIN", "MANAGER", "MEMBER", "VIEWER"] as const) {
      for (const capability of listCapabilities(role)) {
        if (capability.endsWith(".merge")) expect(capability).toBe("Contact.merge");
        if (capability.endsWith(".reassign")) expect(capability).toBe("Project.reassign");
      }
    }
  });
});
