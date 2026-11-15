import { describe, expect, it } from "vitest";
import { ASK_SCRIPTS } from "@/demo/data/ask";
import { matchScript } from "./match";

const scripts = [
  { id: "leads", keywords: ["leads", "decline", "drop"] },
  { id: "channels", keywords: ["compare", "channel", "sql"] },
];

describe("matchScript", () => {
  it("picks the script with the most keyword hits", () => {
    expect(matchScript("Why did leads decline?", scripts)?.id).toBe("leads");
    expect(matchScript("Compare each channel by SQL", scripts)?.id).toBe("channels");
  });

  it("ignores case and punctuation", () => {
    expect(matchScript("LEADS... DROP!!", scripts)?.id).toBe("leads");
  });

  it("routes every scripted question and follow-up to the intended answer", () => {
    for (const script of ASK_SCRIPTS) {
      expect(matchScript(script.question, ASK_SCRIPTS)?.id).toBe(script.id);
      for (const followUp of script.followUps) {
        const target = ASK_SCRIPTS.find((s) => s.question.startsWith(followUp.slice(0, 12)));
        if (target) expect(matchScript(followUp, ASK_SCRIPTS)?.id).toBe(target.id);
      }
    }
  });

  it("returns null when nothing matches", () => {
    expect(matchScript("What is the weather?", scripts)).toBeNull();
    expect(matchScript("   ", scripts)).toBeNull();
  });
});
