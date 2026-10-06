import { describe, expect, it } from "vitest";
import { renderLeadCreatedEmail } from "../../src/modules/notifications/templates/lead-created-email";

// §10: deep link указывает на правильный projectId, text-версия непустая.
describe("renderLeadCreatedEmail", () => {
  const data = { projectId: "proj_123", projectTitle: "Acme Corp — сайт-визитка", appUrl: "https://app.helix.dev" };

  it("subject содержит заголовок лида", () => {
    expect(renderLeadCreatedEmail(data).subject).toContain("Acme Corp — сайт-визитка");
  });

  it("html содержит deep link на правильный projectId", () => {
    expect(renderLeadCreatedEmail(data).html).toContain("https://app.helix.dev/projects/proj_123/contacts");
  });

  it("text-версия непустая и тоже содержит deep link", () => {
    const { text } = renderLeadCreatedEmail(data);
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain("https://app.helix.dev/projects/proj_123/contacts");
  });
});
