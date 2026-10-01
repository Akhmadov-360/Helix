import { describe, expect, it } from "vitest";
import { resolveLeadCreatedRecipients } from "../../src/modules/notifications/recipients";

// §4: чистая функция резолва получателей — нет БД/сети, покрываем ветки напрямую.
describe("resolveLeadCreatedRecipients", () => {
  it("жёсткий дефолт (settings пуст) → owner + assignees", () => {
    const result = resolveLeadCreatedRecipients(undefined, "owner@x.com", ["a@x.com", "b@x.com"]);
    expect(result).toEqual(["owner@x.com", "a@x.com", "b@x.com"]);
  });

  it("только owner (assignees пусты) → один адрес", () => {
    const result = resolveLeadCreatedRecipients(undefined, "owner@x.com", []);
    expect(result).toEqual(["owner@x.com"]);
  });

  it("owner явно обнулён (reassign) и assignees пусты → пустой список, не null", () => {
    const result = resolveLeadCreatedRecipients(undefined, null, []);
    expect(result).toEqual([]);
  });

  it("settings.notifications.newLead.email = false → null (тихо, блюпринт выключил)", () => {
    const settings = { notifications: { newLead: { email: false, recipients: ["owner"] } } };
    expect(resolveLeadCreatedRecipients(settings, "owner@x.com", ["a@x.com"])).toBeNull();
  });

  it("блюпринт сузил recipients до ['owner'] → assignees игнорируются", () => {
    const settings = { notifications: { newLead: { email: true, recipients: ["owner"] } } };
    const result = resolveLeadCreatedRecipients(settings, "owner@x.com", ["a@x.com"]);
    expect(result).toEqual(["owner@x.com"]);
  });

  it("дубли owner/assignee схлопываются в один адрес", () => {
    const result = resolveLeadCreatedRecipients(undefined, "same@x.com", ["same@x.com"]);
    expect(result).toEqual(["same@x.com"]);
  });

  it("мусорная форма settings → жёсткий дефолт, не бросает", () => {
    const result = resolveLeadCreatedRecipients("not-an-object", "owner@x.com", []);
    expect(result).toEqual(["owner@x.com"]);
  });
});
