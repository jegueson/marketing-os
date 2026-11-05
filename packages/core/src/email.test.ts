import { describe, expect, it } from "vitest";
import {
  CloudflareEmailSender,
  EmailDeliveryError,
  InMemoryEmailSender,
  MailpitEmailSender,
} from "./email";

const message = { to: "ada@acme.test", subject: "Invite", text: "Open the link" };

describe("EmailSender adapters", () => {
  it("records messages in memory", async () => {
    const sender = new InMemoryEmailSender();
    const result = await sender.send(message);
    expect(result.id).toBeTruthy();
    expect(sender.sent).toEqual([message]);
  });

  it("posts to the Mailpit send API", async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ ID: "m1" }), { status: 200 });
    }) as unknown as typeof fetch;
    const sender = new MailpitEmailSender("http://127.0.0.1:54324/", "noreply@mos.local", fakeFetch);
    expect(await sender.send(message)).toEqual({ id: "m1" });
    expect(calls[0]?.url).toBe("http://127.0.0.1:54324/api/v1/send");
    expect(calls[0]?.body).toMatchObject({ To: [{ Email: "ada@acme.test" }], Subject: "Invite" });
  });

  it("raises a typed error when Mailpit fails", async () => {
    const fakeFetch = (async () => new Response("no", { status: 500 })) as unknown as typeof fetch;
    const sender = new MailpitEmailSender("http://mailpit", "noreply@mos.local", fakeFetch);
    await expect(sender.send(message)).rejects.toBeInstanceOf(EmailDeliveryError);
  });

  it("maps Cloudflare binding errors to EmailDeliveryError with the code", async () => {
    const binding = {
      send: async () => {
        throw Object.assign(new Error("not verified"), { code: "E_SENDER_NOT_VERIFIED" });
      },
    };
    const sender = new CloudflareEmailSender(binding, "noreply@example.com");
    await expect(sender.send(message)).rejects.toMatchObject({ code: "E_SENDER_NOT_VERIFIED" });
  });

  it("returns the Cloudflare message id", async () => {
    const binding = { send: async () => ({ messageId: "cf-1" }) };
    const sender = new CloudflareEmailSender(binding, "noreply@example.com");
    expect(await sender.send(message)).toEqual({ id: "cf-1" });
  });
});
