export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export interface EmailSender {
  send(message: EmailMessage): Promise<{ id: string }>;
}

/** Dev adapter: records messages for Mailpit / tests. Never logs secrets. */
export class InMemoryEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<{ id: string }> {
    this.sent.push(message);
    return { id: crypto.randomUUID() };
  }
}
