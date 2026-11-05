export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export interface EmailSender {
  send(message: EmailMessage): Promise<{ id: string }>;
}

export class EmailDeliveryError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "EmailDeliveryError";
    this.code = code;
  }
}

/** Test adapter: records messages in memory. */
export class InMemoryEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<{ id: string }> {
    this.sent.push(message);
    return { id: crypto.randomUUID() };
  }
}

/** Dev adapter: Mailpit HTTP send API (`POST /api/v1/send`). */
export class MailpitEmailSender implements EmailSender {
  constructor(
    private readonly baseUrl: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(message: EmailMessage): Promise<{ id: string }> {
    const res = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, "")}/api/v1/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        From: { Email: this.from },
        To: [{ Email: message.to }],
        Subject: message.subject,
        Text: message.text,
        HTML: message.html ?? "",
      }),
    });
    if (!res.ok) {
      throw new EmailDeliveryError("mailpit_error", `Mailpit returned ${res.status}`);
    }
    const body = (await res.json()) as { ID?: string };
    return { id: body.ID ?? crypto.randomUUID() };
  }
}

/** Shape of the Cloudflare Email Service `send_email` binding used here. */
export type CloudflareSendEmailBinding = {
  send(message: {
    to: string;
    from: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<{ messageId: string }>;
};

/** Production adapter: Cloudflare Email Service. The `from` domain must be onboarded. */
export class CloudflareEmailSender implements EmailSender {
  constructor(
    private readonly binding: CloudflareSendEmailBinding,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<{ id: string }> {
    try {
      const result = await this.binding.send({ ...message, from: this.from });
      return { id: result.messageId };
    } catch (err) {
      const code = (err as { code?: string }).code ?? "send_failed";
      throw new EmailDeliveryError(code, (err as Error).message);
    }
  }
}
