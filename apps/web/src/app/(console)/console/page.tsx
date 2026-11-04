import Link from "next/link";

export default function ConsoleHomePage() {
  return (
    <main>
      <h1>Specialist console</h1>
      <ul>
        <li>
          <Link href="/console/leads">Leads</Link>
        </li>
        <li>
          <Link href="/console/customers">Assigned customers</Link>
        </li>
      </ul>
    </main>
  );
}
