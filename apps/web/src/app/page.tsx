import Link from "next/link";

export default function HomePage() {
  return (
    <main id="main-content" className="mos-public" tabIndex={-1}>
      <a className="mos-skip" href="#main-content">
        Skip to main content
      </a>
      <div className="mos-ambient" aria-hidden="true" />
      <section className="app-panel mos-public-card glass">
        <p className="app-brand" style={{ padding: 0, marginBottom: "1rem" }}>
          <span className="app-brand-mark" aria-hidden="true" />
          Marketing OS
        </p>
        <h1>Marketing OS</h1>
        <p className="app-lede">Open-core AI Marketing Operating System.</p>
        <nav aria-label="Primary">
          <ul className="app-nav">
            <li>
              <Link href="/get-started">Get started (cloud / services)</Link>
            </li>
            <li>
              <Link href="/portal">Customer portal</Link>
            </li>
            <li>
              <Link href="/console">Specialist console</Link>
            </li>
            <li>
              <Link href="/demo">Investor demo</Link>
            </li>
          </ul>
        </nav>
      </section>
    </main>
  );
}
