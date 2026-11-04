import { EmptyState } from "@marketing-os/ui";

export default function LeadsPage() {
  return (
    <main>
      <h1>Leads</h1>
      <EmptyState title="No leads loaded" body="Staff login populates this list from /api/v1/leads." />
    </main>
  );
}
