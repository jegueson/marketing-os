import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <h1>Marketing OS</h1>
      <p>Open-core AI Marketing Operating System.</p>
      <ul>
        <li>
          <Link href="/get-started">Get started (cloud / services)</Link>
        </li>
        <li>
          <Link href="/portal">Customer portal</Link>
        </li>
        <li>
          <Link href="/console">Specialist console</Link>
        </li>
      </ul>
    </main>
  );
}
