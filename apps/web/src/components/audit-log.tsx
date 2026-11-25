import { Table } from "@marketing-os/ui";

export type AuditLogRow = {
  id: number;
  eventType: string;
  actorRole: string | null;
  createdAt: string;
  payload: Record<string, unknown>;
};

/** Shows the stored status or external id. A prompt body is never rendered. */
function visibleDetail(payload: Record<string, unknown>): string {
  if (typeof payload.externalId === "string") return payload.externalId;
  if (typeof payload.status === "string") return payload.status;
  return "";
}

export function AuditLog({ rows }: { rows: AuditLogRow[] }) {
  if (rows.length === 0) return <p>No audit events.</p>;
  return (
    <section>
      <h2>Audit log</h2>
      <Table
        headers={["When", "Event", "Actor role", "Detail"]}
        rows={rows.map((row) => [row.createdAt, row.eventType, row.actorRole ?? "system", visibleDetail(row.payload)])}
      />
    </section>
  );
}
