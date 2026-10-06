import { describe, expect, it } from "vitest";
import { renderAssignmentEmail } from "../../src/modules/notifications/templates/assignment-email";

describe("renderAssignmentEmail", () => {
  const data = { projectId: "proj_123", projectTitle: "Acme Corp — сайт-визитка", appUrl: "https://app.helix.dev" };

  it("subject содержит заголовок лида", () => {
    expect(renderAssignmentEmail(data).subject).toContain("Acme Corp — сайт-визитка");
  });

  it("html содержит deep link на правильный projectId", () => {
    expect(renderAssignmentEmail(data).html).toContain("https://app.helix.dev/projects/proj_123/tasks");
  });

  it("text-версия непустая и тоже содержит deep link", () => {
    const { text } = renderAssignmentEmail(data);
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain("https://app.helix.dev/projects/proj_123/tasks");
  });
});
