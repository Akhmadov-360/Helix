const API = "http://localhost:8025/api";

export interface MailhogMessage {
  To: { Mailbox: string; Domain: string }[];
  Content: { Headers: Record<string, string[]>; Body: string };
}

interface MessageFilter {
  to?: string;
  subject?: string;
}

const matches = (message: MailhogMessage, { to, subject }: MessageFilter): boolean =>
  (to === undefined || message.To.some((recipient) => `${recipient.Mailbox}@${recipient.Domain}` === to)) &&
  (subject === undefined || (message.Content.Headers["Subject"]?.[0] ?? "").includes(subject));

export async function clearMailhog(): Promise<void> {
  await fetch(`${API}/v1/messages`, { method: "DELETE" });
}

async function listMessages(): Promise<MailhogMessage[]> {
  const res = await fetch(`${API}/v2/messages`);
  return ((await res.json()) as { items: MailhogMessage[] }).items;
}

export async function waitForMailhogMessage(filter: MessageFilter = {}, timeoutMs = 5000): Promise<MailhogMessage> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = (await listMessages()).find((message) => matches(message, filter));
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for MailHog message ${JSON.stringify(filter)}`);
}

export async function countMailhogMessages(filter: MessageFilter = {}): Promise<number> {
  return (await listMessages()).filter((message) => matches(message, filter)).length;
}

export async function settleWelcomeEmail(email: string): Promise<void> {
  await waitForMailhogMessage({ to: email });
  await clearMailhog();
}
