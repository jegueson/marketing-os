import Link from "next/link";

export default function PortalHomePage() {
  return (
    <main>
      <h1>Customer portal</h1>
      <ul>
        <li>
          <Link href="/portal/integrations">Integrations</Link>
        </li>
        <li>
          <Link href="/portal/cockpit">Cockpit</Link>
        </li>
        <li>
          <Link href="/portal/onboarding">Onboarding checklist</Link>
        </li>
      </ul>
    </main>
  );
}
