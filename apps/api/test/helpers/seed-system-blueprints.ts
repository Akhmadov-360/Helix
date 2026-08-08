import { prisma } from "@helix/db";

/**
 * Тестовая БД truncate'ится перед КАЖДЫМ тестом (test/setup.ts beforeEach) — системные блюпринты
 * из packages/db/prisma/seed.ts туда не попадают сами по себе (seed — не часть test-harness).
 * Минимальный дубль двух системных блюпринтов ровно с теми id/definition, что реальный сид —
 * тесты про инстанцирование/видимость завязаны на конкретные id/ключи полей.
 */
export async function seedSystemBlueprints(): Promise<void> {
  await prisma.blueprint.createMany({
    data: [
      {
        id: "bp-b2b-software-agency",
        orgId: null,
        audience: "B2B",
        name: "Software Agency Client Pipeline",
        definition: {
          phases: [
            { key: "call_request", name: { en: "Call Request" }, type: "OPEN", order: 1 },
            { key: "discovery", name: { en: "Discovery" }, type: "OPEN", order: 2 },
            { key: "planning", name: { en: "Planning" }, type: "OPEN", order: 3 },
            { key: "contract", name: { en: "Contract" }, type: "OPEN", order: 4 },
            { key: "won", name: { en: "Won" }, type: "WON", order: 5 },
            { key: "lost", name: { en: "Lost" }, type: "LOST", order: 6 },
          ],
          projectFields: [
            { key: "budget", label: { en: "Budget" }, type: "currency" },
            { key: "tech_stack", label: { en: "Preferred Stack" }, type: "multiselect", options: ["TS", "Python", "Go"] },
            { key: "target_start", label: { en: "Target Start" }, type: "date" },
          ],
          notificationDefaults: { newLead: { email: true, recipients: ["owner", "assignees"] } },
        },
      },
      {
        id: "bp-b2c-real-estate",
        orgId: null,
        audience: "B2C",
        name: "Real Estate Buyer",
        definition: {
          phases: [
            { key: "inquiry", name: { en: "Inquiry" }, type: "OPEN", order: 1 },
            { key: "pre_qualified", name: { en: "Pre-qualified" }, type: "OPEN", order: 2 },
            { key: "viewing", name: { en: "Viewing" }, type: "OPEN", order: 3 },
            { key: "offer", name: { en: "Offer" }, type: "OPEN", order: 4 },
            { key: "closing", name: { en: "Closing" }, type: "WON", order: 5 },
            { key: "lost", name: { en: "Lost" }, type: "LOST", order: 6 },
          ],
          projectFields: [
            { key: "property_type", label: { en: "Property Type" }, type: "select", options: ["Apartment", "House", "Commercial"] },
            { key: "budget_max", label: { en: "Max Budget" }, type: "currency" },
            { key: "preferred_district", label: { en: "Preferred District" }, type: "text" },
          ],
          notificationDefaults: { newLead: { email: true, recipients: ["owner"] } },
        },
      },
    ],
  });
}
