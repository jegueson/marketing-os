import { Table } from "@marketing-os/ui";

export type WorkloadRow = {
  category: string;
  baselineHours: number;
  hoursAbsorbed: number;
};

/** Renders stored hours. It does not calculate a savings figure. */
export function WorkloadAbsorbed({ rows }: { rows: WorkloadRow[] }) {
  if (rows.length === 0) return <p>No workload recorded.</p>;
  return (
    <section>
      <h2>Work absorbed</h2>
      <Table
        headers={["Category", "Baseline hours", "Hours absorbed"]}
        rows={rows.map((row) => [row.category, String(row.baselineHours), String(row.hoursAbsorbed)])}
      />
    </section>
  );
}
