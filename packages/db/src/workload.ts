import { asc, eq } from "drizzle-orm";
import type { WorkloadCategory } from "@marketing-os/schemas";
import type { Database } from "./context";
import { workloadCategories } from "./schema/workload";

export type WorkloadDraft = {
  tenantId: string;
  workspaceId: string;
  category: WorkloadCategory;
  baselineHours: number;
  hoursAbsorbed: number;
};

export type StoredWorkload = {
  category: WorkloadCategory;
  baselineHours: number;
  hoursAbsorbed: number;
};

const workloadColumns = {
  category: workloadCategories.category,
  baselineHours: workloadCategories.baselineHours,
  hoursAbsorbed: workloadCategories.hoursAbsorbed,
};

/** Insert stored hours. The row has no savings figure. */
export async function insertWorkload(tx: Database, draft: WorkloadDraft): Promise<StoredWorkload> {
  const [row] = await tx
    .insert(workloadCategories)
    .values({
      tenantId: draft.tenantId,
      workspaceId: draft.workspaceId,
      category: draft.category,
      baselineHours: draft.baselineHours,
      hoursAbsorbed: draft.hoursAbsorbed,
    })
    .returning(workloadColumns);

  if (!row) {
    throw new Error("workload insert returned no row");
  }

  return row;
}

/** Workspace rows only. The numbers are the stored hours. */
export async function listWorkload(tx: Database, workspaceId: string): Promise<StoredWorkload[]> {
  return tx
    .select(workloadColumns)
    .from(workloadCategories)
    .where(eq(workloadCategories.workspaceId, workspaceId))
    .orderBy(asc(workloadCategories.category));
}
