import { describe, expect, it } from "vitest";
import { renderOrgInviteEmail } from "../../src/modules/notifications/templates/org-invite-email";

describe("renderOrgInviteEmail", () => {
  const data = {
    orgName: "Acme Corp",
    inviterName: "Jane",
    role: "MEMBER" as const,
    token: "raw-token-123",
    appUrl: "https://app.helix.dev",
  };

  it("subject упоминает пригласившего и оргу", () => {
    const { subject } = renderOrgInviteEmail(data);
    expect(subject).toContain("Jane");
    expect(subject).toContain("Acme Corp");
  });

  it("html содержит deep link с сырым токеном", () => {
    expect(renderOrgInviteEmail(data).html).toContain(
      "https://app.helix.dev/invite/accept?token=raw-token-123",
    );
  });

  it("text-версия непустая и тоже содержит deep link", () => {
    const { text } = renderOrgInviteEmail(data);
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain("https://app.helix.dev/invite/accept?token=raw-token-123");
  });
});
