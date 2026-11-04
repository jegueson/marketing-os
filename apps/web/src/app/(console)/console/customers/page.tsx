import { EmptyState } from "@marketing-os/ui";

export default function CustomersPage() {
  return (
    <main>
      <h1>Assigned customers</h1>
      <EmptyState title="No assignments" body="Read-only overview and audit land here for specialists." />
    </main>
  );
}
