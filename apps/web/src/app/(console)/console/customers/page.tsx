"use client";

import Link from "next/link";
import { EmptyState, Table } from "@marketing-os/ui";
import { RequireAuth, type ReadyAuth } from "@/components/auth";
import { useApi, View } from "@/components/api-view";

type Customer = { id: string; name: string; status: string; plan: string; createdAt: string };

function Customers({ auth }: { auth: ReadyAuth }) {
  const [state] = useApi<Customer[]>(auth.api, "/api/v1/console/customers");
  return (
    <View state={state}>
      {(rows) =>
        rows.length === 0 ? (
          <EmptyState
            title="No customers assigned"
            body="Convert a qualified lead to create one."
          />
        ) : (
          <Table
            headers={["Customer", "Status", "Plan", "Created"]}
            rows={rows.map((t) => [
              <Link key="n" href={`/console/customers/${t.id}`}>
                {t.name}
              </Link>,
              t.status,
              t.plan,
              new Date(t.createdAt).toLocaleDateString(),
            ])}
          />
        )
      }
    </View>
  );
}

export default function CustomersPage() {
  return (
    <main>
      <h1>Customers</h1>
      <Link href="/console">Console</Link>
      <RequireAuth staff>{(auth) => <Customers auth={auth} />}</RequireAuth>
    </main>
  );
}
