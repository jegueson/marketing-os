"use client";

import Link from "next/link";
import { EmptyState, Table } from "@marketing-os/ui";
import { RequireAuth, type ReadyAuth } from "@/components/auth";
import { ConsoleFrame } from "@/components/console-frame";
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
          <div className="app-panel">
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
          </div>
        )
      }
    </View>
  );
}

export default function CustomersPage() {
  return (
    <RequireAuth staff>
      {(auth) => (
        <ConsoleFrame auth={auth} title="Customers">
          <Customers auth={auth} />
        </ConsoleFrame>
      )}
    </RequireAuth>
  );
}
