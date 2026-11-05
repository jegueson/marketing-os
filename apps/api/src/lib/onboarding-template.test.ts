import { describe, expect, it } from "vitest";
import { TemplateError, defaultOnboardingTemplate, parseOnboardingTemplate } from "./onboarding-template";

describe("onboarding template", () => {
  it("loads the default template from customer-configs", () => {
    const template = defaultOnboardingTemplate();
    expect(template.checklist.map((item) => item.key)).toContain("connect_source");
  });

  it("rejects invalid YAML", () => {
    expect(() => parseOnboardingTemplate("version: 1\nchecklist: [\n")).toThrow(TemplateError);
  });

  it("rejects a template without checklist items", () => {
    expect(() => parseOnboardingTemplate("version: 1\nchecklist: []\n")).toThrow(/invalid/);
  });

  it("rejects duplicate keys", () => {
    const source = "version: 1\nchecklist:\n  - key: a\n    title: A\n  - key: a\n    title: B\n";
    expect(() => parseOnboardingTemplate(source)).toThrow(/unique/);
  });
});
