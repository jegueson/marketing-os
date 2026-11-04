export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <main>
      <h1>Accept invitation</h1>
      <p>Token: {token.slice(0, 8)}…</p>
      <p>Complete signup through Supabase Auth, then return to the portal.</p>
    </main>
  );
}
