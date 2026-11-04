import { EmptyState } from "@marketing-os/ui";

export default function IntegrationsPage() {
  return (
    <main>
      <h1>Integrations</h1>
      <p>Connect → account → scopes → test → health.</p>
      <EmptyState
        title="No connections yet"
        body="Connect the mock connector from the API or CLI to populate this page."
      />
    </main>
  );
}
