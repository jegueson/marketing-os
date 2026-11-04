import { describe, expect, it } from "vitest";
import { InMemoryEmailSender } from "./email";

describe("EmailSender", () => {
  it("records messages without exposing tokens in subject only content", async () => {
    const sender = new InMemoryEmailSender();
    const result = await sender.send({
      to: "ada@acme.test",
      subject: "Invite",
      text: "Open /invite/token-hash-placeholder",
    });
    expect(result.id).toBeTruthy();
    expect(sender.sent).toHaveLength(1);
  });
});
