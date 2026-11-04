import { EmptyState } from "@marketing-os/ui";

export default function CockpitPage() {
  return (
    <main>
      <h1>Cockpit</h1>
      <EmptyState
        title="Waiting for connected data"
        body="Once a connection is healthy, widgets appear here with source and freshness."
      />
    </main>
  );
}
