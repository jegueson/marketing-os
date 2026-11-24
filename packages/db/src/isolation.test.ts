import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { createTestDatabase, type TestDatabase } from "./testing";
import { selectRows, withContext, type DbContext } from "./context";
import {
  auditEvents,
  agents,
  brandProfiles,
  businessProfiles,
  configVersions,
  workflows,
  workflowRuns,
  connections,
  connectors,
  dataScopes,
  invitations,
  leads,
  onboardingChecklistItems,
  onboardingProjects,
  outboxEvents,
  skills,
  successManagerNotes,
  tenantMemberships,
  tenants,
  workspaces,
} from "./schema";

let t: TestDatabase;

/** Drizzle wraps the driver error; the Postgres message is on `cause`. */
function isRlsDenial(err: unknown): boolean {
  const cause = (err as { cause?: { message?: string } }).cause;
  return /row-level security/.test(cause?.message ?? "");
}
const ids = {
  tenantA: crypto.randomUUID(),
  tenantB: crypto.randomUUID(),
  workspaceA: crypto.randomUUID(),
  workspaceB: crypto.randomUUID(),
  userA: "",
  userB: "",
  staff: "",
};

const ctxA = (): DbContext => ({ tenantId: ids.tenantA, userId: ids.userA, staff: false });
const ctxB = (): DbContext => ({ tenantId: ids.tenantB, userId: ids.userB, staff: false });
const staffCtx = (): DbContext => ({ tenantId: null, userId: ids.staff, staff: true });

async function seedTenant(tenantId: string, workspaceId: string, userId: string, slug: string) {
  await withContext(t.db, { tenantId, userId, staff: true }, async (tx) => {
    await tx.insert(tenants).values({ id: tenantId, slug, name: slug });
    await tx.insert(workspaces).values({ id: workspaceId, tenantId, slug: "default", name: "Default" });
    await tx.insert(tenantMemberships).values({ tenantId, userId, role: "customer_admin" });
    const [mock] = await tx.select().from(connectors).where(eq(connectors.slug, "mock"));
    const [connection] = await tx
      .insert(connections)
      .values({ tenantId, workspaceId, connectorId: mock!.id, displayName: "Mock", createdBy: userId })
      .returning();
    await tx.insert(dataScopes).values({
      tenantId,
      connectionId: connection!.id,
      resourceType: "campaigns",
      resourceId: "campaigns",
      approvedBy: userId,
    });
    const [project] = await tx.insert(onboardingProjects).values({ tenantId, workspaceId }).returning();
    await tx
      .insert(onboardingChecklistItems)
      .values({ tenantId, projectId: project!.id, key: "connect_source", title: "Connect" });
    await tx.insert(invitations).values({
      tenantId,
      email: `${slug}@example.com`,
      invitedBy: userId,
      tokenHash: `hash-${slug}`,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    await tx.insert(auditEvents).values({ tenantId, eventType: "seed" });
    await tx.insert(outboxEvents).values({ tenantId, eventType: "seed", payload: {} });
  });
}

beforeAll(async () => {
  t = await createTestDatabase();
  ids.userA = await t.createUser("a@example.com");
  ids.userB = await t.createUser("b@example.com");
  ids.staff = await t.createUser("staff@example.com");
  await seedTenant(ids.tenantA, ids.workspaceA, ids.userA, "tenant-a");
  await seedTenant(ids.tenantB, ids.workspaceB, ids.userB, "tenant-b");
  await withContext(t.db, staffCtx(), (tx) =>
    tx.insert(leads).values({ companyName: "Lead Co", contactName: "L", email: "l@example.com" }),
  );
}, 60_000);

afterAll(async () => {
  await t.close();
});

const TENANT_TABLES = [
  "workspaces",
  "tenant_memberships",
  "connections",
  "data_scopes",
  "onboarding_projects",
  "onboarding_checklist_items",
  "invitations",
  "audit_events",
  "outbox_events",
] as const;

describe("tenant isolation", () => {
  it.each(TENANT_TABLES)("tenant A sees zero rows of tenant B in %s", async (table) => {
    const result = await withContext(t.db, ctxA(), (tx) =>
      selectRows<{ tenant_id: string }>(tx, sql.raw(`select tenant_id from public.${table}`)),
    );
    const tenantIds = new Set(result.map((row) => row.tenant_id));
    expect(tenantIds.has(ids.tenantB)).toBe(false);
    expect(tenantIds.has(ids.tenantA)).toBe(true);
  });

  it("tenant A only sees its own tenant row", async () => {
    const visible = await withContext(t.db, ctxA(), (tx) => tx.select().from(tenants));
    expect(visible.map((row) => row.id)).toEqual([ids.tenantA]);
  });

  it("refuses to insert a row with tenant B's id from tenant A", async () => {
    await expect(
      withContext(t.db, ctxA(), (tx) =>
        tx.insert(workspaces).values({ tenantId: ids.tenantB, slug: "evil", name: "Evil" }),
      ),
    ).rejects.toSatisfy(isRlsDenial);
  });

  it("refuses to move a row to another tenant", async () => {
    const updated = await withContext(t.db, ctxA(), (tx) =>
      tx
        .update(workspaces)
        .set({ name: "hijack" })
        .where(eq(workspaces.tenantId, ids.tenantB))
        .returning(),
    );
    expect(updated).toEqual([]);
  });

  it("returns nothing without a tenant context", async () => {
    const rows = await withContext(t.db, { tenantId: null, userId: ids.userA, staff: false }, (tx) =>
      tx.select().from(workspaces),
    );
    expect(rows).toEqual([]);
  });

  it("hides leads from customers and shows them to staff", async () => {
    const customer = await withContext(t.db, ctxA(), (tx) => tx.select().from(leads));
    expect(customer).toEqual([]);
    const staff = await withContext(t.db, staffCtx(), (tx) => tx.select().from(leads));
    expect(staff).toHaveLength(1);
  });

  it("refuses an audit row for another tenant", async () => {
    await expect(
      withContext(t.db, ctxA(), (tx) => tx.insert(auditEvents).values({ tenantId: ids.tenantB, eventType: "x" })),
    ).rejects.toSatisfy(isRlsDenial);
  });

  it("hides platform outbox events from tenants", async () => {
    await withContext(t.db, ctxA(), (tx) =>
      tx.insert(outboxEvents).values({ tenantId: null, eventType: "lead.created", payload: {} }),
    );
    const visible = await withContext(t.db, ctxB(), (tx) =>
      tx.select().from(outboxEvents).where(eq(outboxEvents.eventType, "lead.created")),
    );
    expect(visible).toEqual([]);
  });
});

describe("access functions", () => {
  it("resolves workspace access for a member and nobody else", async () => {
    const member = await withContext(t.db, { tenantId: null, userId: ids.userA, staff: false }, (tx) =>
      selectRows<{ tenant_id: string; membership_role: string | null }>(
        tx,
        sql`select * from app.workspace_access(${ids.workspaceA}::uuid)`,
      ),
    );
    expect(member[0]).toMatchObject({ tenant_id: ids.tenantA, membership_role: "customer_admin" });

    const stranger = await withContext(t.db, { tenantId: null, userId: ids.userB, staff: false }, (tx) =>
      selectRows<{ membership_role: string | null; staff_role: string | null }>(
        tx,
        sql`select * from app.workspace_access(${ids.workspaceA}::uuid)`,
      ),
    );
    expect(stranger[0]).toMatchObject({ membership_role: null, staff_role: null });
  });

  it("lists only the caller's memberships", async () => {
    const mine = await withContext(t.db, { tenantId: null, userId: ids.userA, staff: false }, (tx) =>
      selectRows<{ tenant_id: string }>(tx, sql`select * from app.my_memberships()`),
    );
    expect(mine.map((row) => row.tenant_id)).toEqual([ids.tenantA]);
  });
});

describe("audit and append-only tables", () => {
  it("raises on audit update and delete", async () => {
    await expect(
      withContext(t.db, staffCtx(), (tx) => tx.update(auditEvents).set({ eventType: "changed" })),
    ).rejects.toThrow();
    await expect(withContext(t.db, staffCtx(), (tx) => tx.delete(auditEvents))).rejects.toThrow();
  });

  it("leaves no audit row when the transaction rolls back", async () => {
    await expect(
      withContext(t.db, staffCtx(), async (tx) => {
        await tx.insert(auditEvents).values({ eventType: "rolled.back" });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const left = await withContext(t.db, staffCtx(), (tx) =>
      tx.select().from(auditEvents).where(eq(auditEvents.eventType, "rolled.back")),
    );
    expect(left).toEqual([]);
  });

  it("refuses to edit a Success Manager note", async () => {
    const [lead] = await withContext(t.db, staffCtx(), (tx) => tx.select().from(leads));
    await withContext(t.db, staffCtx(), (tx) =>
      tx.insert(successManagerNotes).values({ leadId: lead!.id, authorId: ids.staff, body: "first" }),
    );
    await expect(
      withContext(t.db, staffCtx(), (tx) => tx.update(successManagerNotes).set({ body: "edited" })),
    ).rejects.toThrow();
  });
});

function errorText(err: unknown): string {
  const wrapped = err as { cause?: { message?: string }; message?: string };
  return `${wrapped.cause?.message ?? ""} ${wrapped.message ?? ""}`;
}

describe("specialist config profiles", () => {
  it("hides another tenant's profiles and versions", async () => {
    await withContext(t.db, ctxA(), async (tx) => {
      const [business] = await tx
        .insert(businessProfiles)
        .values({
          tenantId: ids.tenantA,
          workspaceId: ids.workspaceA,
          draft: { companyDescription: "Tenant A" },
        })
        .returning();
      await tx.insert(brandProfiles).values({
        tenantId: ids.tenantA,
        workspaceId: ids.workspaceA,
        draft: { positioning: "Tenant A" },
      });
      await tx.insert(configVersions).values({
        tenantId: ids.tenantA,
        workspaceId: ids.workspaceA,
        resourceType: "business_profile",
        resourceId: business!.id,
        version: 1,
        document: { companyDescription: "Tenant A" },
        publishedBy: ids.userA,
      });
    });

    const seenByB = await withContext(t.db, ctxB(), async (tx) => ({
      business: await tx.select().from(businessProfiles),
      brand: await tx.select().from(brandProfiles),
      versions: await tx.select().from(configVersions),
    }));
    expect(seenByB).toEqual({ business: [], brand: [], versions: [] });

    const seenByA = await withContext(t.db, ctxA(), async (tx) => ({
      business: await tx.select().from(businessProfiles),
      versions: await tx.select().from(configVersions),
    }));
    expect(seenByA.business).toHaveLength(1);
    expect(seenByA.versions).toHaveLength(1);
    expect(seenByA.versions[0]?.tenantId).toBe(ids.tenantA);
  });

  it("refuses a profile for another tenant", async () => {
    await expect(
      withContext(t.db, ctxA(), (tx) =>
        tx.insert(businessProfiles).values({
          tenantId: ids.tenantB,
          workspaceId: ids.workspaceB,
          draft: {},
        }),
      ),
    ).rejects.toSatisfy(
      (err: unknown) =>
        isRlsDenial(err) || /workspace does not belong to tenant/.test(errorText(err)),
    );
    const left = await t.pg.query("select 1 from public.business_profiles where tenant_id = $1", [
      ids.tenantB,
    ]);
    expect(left.rows).toEqual([]);
  });

  it("refuses a profile that points at another tenant's workspace", async () => {
    await expect(
      withContext(t.db, ctxA(), (tx) =>
        tx.insert(brandProfiles).values({
          tenantId: ids.tenantA,
          workspaceId: ids.workspaceB,
          draft: {},
        }),
      ),
    ).rejects.toSatisfy((err: unknown) => /workspace does not belong to tenant/.test(errorText(err)));
  });

  it("returns no profiles without a tenant context", async () => {
    const rows = await withContext(t.db, { tenantId: null, userId: ids.userA, staff: false }, (tx) =>
      tx.select().from(businessProfiles),
    );
    expect(rows).toEqual([]);
  });

  it("refuses to update or delete a published version", async () => {
    const blocked = (err: unknown) =>
      /config_versions are immutable|permission denied/i.test(errorText(err));
    await expect(
      withContext(t.db, ctxA(), (tx) => tx.update(configVersions).set({ version: 99 })),
    ).rejects.toSatisfy(blocked);
    await expect(withContext(t.db, ctxA(), (tx) => tx.delete(configVersions))).rejects.toSatisfy(blocked);
    await expect(t.pg.exec("update public.config_versions set version = 99")).rejects.toSatisfy(blocked);
  });
});

describe("specialist config skills and agents", () => {
  it("hides another tenant's skills and agents", async () => {
    await withContext(t.db, ctxA(), async (tx) => {
      const [skill] = await tx
        .insert(skills)
        .values({
          tenantId: ids.tenantA,
          workspaceId: ids.workspaceA,
          draft: { name: "weekly-performance-review" },
        })
        .returning();
      const [agent] = await tx
        .insert(agents)
        .values({
          tenantId: ids.tenantA,
          workspaceId: ids.workspaceA,
          draft: { name: "reporting-agent", autonomy: "observe" },
        })
        .returning();
      await tx.insert(skills).values({
        tenantId: ids.tenantA,
        workspaceId: ids.workspaceA,
        draft: { name: "second-skill" },
      });
      await tx.insert(configVersions).values([
        {
          tenantId: ids.tenantA,
          workspaceId: ids.workspaceA,
          resourceType: "skill",
          resourceId: skill!.id,
          version: 1,
          document: { name: "weekly-performance-review" },
          publishedBy: ids.userA,
        },
        {
          tenantId: ids.tenantA,
          workspaceId: ids.workspaceA,
          resourceType: "agent",
          resourceId: agent!.id,
          version: 1,
          document: { name: "reporting-agent", autonomy: "observe" },
          publishedBy: ids.userA,
        },
      ]);
    });

    const seenByB = await withContext(t.db, ctxB(), async (tx) => ({
      skills: await tx.select().from(skills),
      agents: await tx.select().from(agents),
      versions: await tx
        .select()
        .from(configVersions)
        .where(inArray(configVersions.resourceType, ["skill", "agent"])),
    }));
    expect(seenByB).toEqual({ skills: [], agents: [], versions: [] });

    const seenByA = await withContext(t.db, ctxA(), async (tx) => ({
      skills: await tx.select().from(skills),
      agents: await tx.select().from(agents),
      versions: await tx
        .select()
        .from(configVersions)
        .where(inArray(configVersions.resourceType, ["skill", "agent"])),
    }));
    expect(seenByA.skills).toHaveLength(2);
    expect(seenByA.agents).toHaveLength(1);
    expect(seenByA.versions.map((row) => row.resourceType).sort()).toEqual(["agent", "skill"]);
  });

  it("refuses a skill for another tenant", async () => {
    await expect(
      withContext(t.db, ctxA(), (tx) =>
        tx.insert(skills).values({
          tenantId: ids.tenantB,
          workspaceId: ids.workspaceB,
          draft: {},
        }),
      ),
    ).rejects.toSatisfy(
      (err: unknown) => isRlsDenial(err) || /workspace does not belong to tenant/.test(errorText(err)),
    );
    const left = await t.pg.query("select 1 from public.skills where tenant_id = $1", [ids.tenantB]);
    expect(left.rows).toEqual([]);
  });

  it("refuses an agent that points at another tenant's workspace", async () => {
    await expect(
      withContext(t.db, ctxA(), (tx) =>
        tx.insert(agents).values({
          tenantId: ids.tenantA,
          workspaceId: ids.workspaceB,
          draft: {},
        }),
      ),
    ).rejects.toSatisfy((err: unknown) => /workspace does not belong to tenant/.test(errorText(err)));
  });
});

describe("specialist config workflows", () => {
  it("hides another tenant's workflows and versions", async () => {
    await withContext(t.db, ctxA(), async (tx) => {
      const [workflow] = await tx
        .insert(workflows)
        .values({
          tenantId: ids.tenantA,
          workspaceId: ids.workspaceA,
          draft: { name: "weekly-performance-review", trigger: { type: "manual" } },
        })
        .returning();
      await tx.insert(workflows).values({
        tenantId: ids.tenantA,
        workspaceId: ids.workspaceA,
        draft: { name: "second-workflow", trigger: { type: "manual" } },
      });
      await tx.insert(configVersions).values({
        tenantId: ids.tenantA,
        workspaceId: ids.workspaceA,
        resourceType: "workflow",
        resourceId: workflow!.id,
        version: 1,
        document: { name: "weekly-performance-review", trigger: { type: "manual" } },
        publishedBy: ids.userA,
      });
    });

    const seenByB = await withContext(t.db, ctxB(), async (tx) => ({
      workflows: await tx.select().from(workflows),
      versions: await tx
        .select()
        .from(configVersions)
        .where(eq(configVersions.resourceType, "workflow")),
    }));
    expect(seenByB).toEqual({ workflows: [], versions: [] });

    const seenByA = await withContext(t.db, ctxA(), async (tx) => ({
      workflows: await tx.select().from(workflows),
      versions: await tx
        .select()
        .from(configVersions)
        .where(eq(configVersions.resourceType, "workflow")),
    }));
    expect(seenByA.workflows).toHaveLength(2);
    expect(seenByA.versions).toHaveLength(1);
  });

  it("refuses a workflow for another tenant", async () => {
    await expect(
      withContext(t.db, ctxA(), (tx) =>
        tx.insert(workflows).values({
          tenantId: ids.tenantB,
          workspaceId: ids.workspaceB,
          draft: {},
        }),
      ),
    ).rejects.toSatisfy(
      (err: unknown) => isRlsDenial(err) || /workspace does not belong to tenant/.test(errorText(err)),
    );
    const left = await t.pg.query("select 1 from public.workflows where tenant_id = $1", [ids.tenantB]);
    expect(left.rows).toEqual([]);
  });

  it("refuses a workflow that points at another tenant's workspace", async () => {
    await expect(
      withContext(t.db, ctxA(), (tx) =>
        tx.insert(workflows).values({
          tenantId: ids.tenantA,
          workspaceId: ids.workspaceB,
          draft: {},
        }),
      ),
    ).rejects.toSatisfy((err: unknown) => /workspace does not belong to tenant/.test(errorText(err)));
  });

  it("hides another tenant's workflow runs", async () => {
    await withContext(t.db, ctxA(), async (tx) => {
      const [workflow] = await tx
        .insert(workflows)
        .values({
          tenantId: ids.tenantA,
          workspaceId: ids.workspaceA,
          status: "published",
          draft: { name: "weekly-performance-review", trigger: { type: "manual" } },
          activeVersion: 1,
        })
        .returning();
      await tx.insert(workflowRuns).values({
        tenantId: ids.tenantA,
        workspaceId: ids.workspaceA,
        workflowId: workflow!.id,
        workflowVersion: 1,
        trigger: "manual",
        status: "succeeded",
        steps: [],
        report: { title: "Weekly review", body: "mock.spend: 2550" },
        createdBy: ids.userA,
      });
    });

    const seenByB = await withContext(t.db, ctxB(), (tx) => tx.select().from(workflowRuns));
    expect(seenByB).toEqual([]);
    const seenByA = await withContext(t.db, ctxA(), (tx) => tx.select().from(workflowRuns));
    expect(seenByA).toHaveLength(1);
  });
});

describe("tenancy constraints", () => {
  it("rejects a duplicate membership", async () => {
    await expect(
      withContext(t.db, ctxA(), (tx) =>
        tx.insert(tenantMemberships).values({ tenantId: ids.tenantA, userId: ids.userA, role: "customer_user" }),
      ),
    ).rejects.toThrow();
  });

  it("rejects a membership for an unknown user", async () => {
    await expect(
      withContext(t.db, ctxA(), (tx) =>
        tx.insert(tenantMemberships).values({ tenantId: ids.tenantA, userId: crypto.randomUUID() }),
      ),
    ).rejects.toThrow();
  });

  it("cascades workspaces when a tenant is deleted", async () => {
    const tenantId = crypto.randomUUID();
    await withContext(t.db, { tenantId, userId: ids.staff, staff: true }, async (tx) => {
      await tx.insert(tenants).values({ id: tenantId, slug: "to-delete", name: "Delete" });
      await tx.insert(workspaces).values({ tenantId, slug: "default", name: "Default" });
      await tx.delete(tenants).where(eq(tenants.id, tenantId));
    });
    const left = await t.pg.query("select 1 from public.workspaces where tenant_id = $1", [tenantId]);
    expect(left.rows).toEqual([]);
  });
});
