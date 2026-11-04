import { EmptyState } from "@marketing-os/ui";

export default function OnboardingPage() {
  return (
    <main>
      <h1>Onboarding checklist</h1>
      <EmptyState
        title="Checklist loads from the API"
        body="Items auto-complete when integrations connect."
      />
    </main>
  );
}
