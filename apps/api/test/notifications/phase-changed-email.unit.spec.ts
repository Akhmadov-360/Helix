import { describe, expect, it } from "vitest";
import { renderPhaseChangedEmail } from "../../src/modules/notifications/templates/phase-changed-email";

describe("renderPhaseChangedEmail", () => {
  const base = {
    projectId: "proj_123",
    projectTitle: "Acme Corp",
    fromPhaseName: { en: "Proposal" },
    toPhaseName: { en: "Negotiation" },
    appUrl: "https://app.helix.dev",
  };

  it("WON → subject/heading про выигрыш, без упоминания fromPhase", () => {
    const { subject, html } = renderPhaseChangedEmail({ ...base, toPhaseType: "WON" });
    expect(subject).toContain("Won");
    expect(html).toContain("Deal won");
    expect(html).toContain("Acme Corp");
  });

  it("LOST → subject/heading про проигрыш", () => {
    const { subject, html } = renderPhaseChangedEmail({ ...base, toPhaseType: "LOST" });
    expect(subject).toContain("Lost");
    expect(html).toContain("Deal lost");
  });

  it("OPEN → обычный переход, упоминает fromPhase и toPhase", () => {
    const { subject, html } = renderPhaseChangedEmail({ ...base, toPhaseType: "OPEN" });
    expect(subject).toContain("Phase changed");
    expect(html).toContain("Proposal");
    expect(html).toContain("Negotiation");
  });

  it("fromPhaseName === null (edge case из репозитория) не падает", () => {
    expect(() =>
      renderPhaseChangedEmail({ ...base, fromPhaseName: null, toPhaseType: "OPEN" }),
    ).not.toThrow();
  });

  it("deep link указывает на activity-таб проекта", () => {
    const { html } = renderPhaseChangedEmail({ ...base, toPhaseType: "OPEN" });
    expect(html).toContain("https://app.helix.dev/projects/proj_123/activity");
  });

  it("localize() берёт en, если он задан (P1-санкционированная точка чтения)", () => {
    const { html } = renderPhaseChangedEmail({
      ...base,
      fromPhaseName: { en: "Proposal", ru: "Предложение" },
      toPhaseType: "OPEN",
    });
    expect(html).toContain("Proposal");
    expect(html).not.toContain("Предложение");
  });
});
