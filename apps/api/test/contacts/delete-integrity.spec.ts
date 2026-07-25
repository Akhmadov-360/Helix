import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";

/**
 * Стражи ссылочной целостности contacts.md §6 — оба живут в raw SQL миграции, Prisma их не
 * выражает. Тесты краснеют, если migrate пересоздаст FK в дефолтном виде:
 *
 *  - manual-point #5: Contact.company composite-FK → ON DELETE SET NULL ("companyId").
 *    Полный SET NULL (что генерит Prisma) занулил бы и orgId (NOT NULL) → падение при удалении
 *    компании. Партиальный набор колонок (PG15+) зануляет только companyId.
 *  - D2: ProjectContact.contact → ON DELETE RESTRICT (init-схема ставила Cascade). Нельзя тихо
 *    потерять участника сделки при удалении контакта.
 */
describe("contacts — ссылочная целостность (§6, manual-point #5 / D2)", () => {
  let orgId: string;

  beforeEach(async () => {
    const org = await prisma.organization.create({ data: { name: "Org" } });
    orgId = org.id;
  });

  describe("#5: Company delete → Contact.companyId NULL, orgId цел", () => {
    it("удаление компании зануляет только companyId, контакт жив, orgId сохранён", async () => {
      const company = await prisma.company.create({ data: { orgId, name: "Acme" } });
      const contact = await prisma.contact.create({
        data: { orgId, name: "John", companyId: company.id },
      });

      await prisma.company.delete({ where: { id: company.id } });

      const after = await prisma.contact.findUnique({ where: { id: contact.id } });
      expect(after).not.toBeNull();
      expect(after?.companyId).toBeNull(); // занулён
      expect(after?.orgId).toBe(orgId); // цел (иначе полный SET NULL — регрессия #5)
    });
  });

  describe("D2: ProjectContact.contact → Restrict", () => {
    async function seedProjectWithContact() {
      const ws = await prisma.workspace.create({ data: { orgId, name: "Board" } });
      const phase = await prisma.phase.create({
        data: { workspaceId: ws.id, key: "open", name: { en: "Open" }, type: "OPEN", order: 1 },
      });
      const project = await prisma.project.create({
        data: { orgId, workspaceId: ws.id, phaseId: phase.id, title: "Lead", rank: "a0" },
      });
      const contact = await prisma.contact.create({ data: { orgId, name: "John" } });
      await prisma.projectContact.create({
        data: { projectId: project.id, contactId: contact.id, orgId },
      });
      return contact.id;
    }

    it("удаление контакта, участвующего в сделке, отвергается (Restrict)", async () => {
      const contactId = await seedProjectWithContact();
      await expect(prisma.contact.delete({ where: { id: contactId } })).rejects.toThrow();
      // контакт жив
      expect(await prisma.contact.findUnique({ where: { id: contactId } })).not.toBeNull();
    });

    it("удаление контакта БЕЗ связей проходит", async () => {
      const contact = await prisma.contact.create({ data: { orgId, name: "Solo" } });
      await expect(prisma.contact.delete({ where: { id: contact.id } })).resolves.toBeDefined();
    });
  });
});
