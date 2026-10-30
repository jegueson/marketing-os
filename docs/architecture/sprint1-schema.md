# Sprint 1 schema

Accepted decisions: [ADR-0005](../adr/0005-tenant-isolation.md), [ADR-0006](../adr/0006-drizzle-sql-migrations.md), [ADR-0013](../adr/0013-sql-conventions.md).

Drizzle models in `packages/db` generate the tables. The statements below are the contract those models and the hand-written SQL must meet. They are not applied by copying this file.

## Roles

| Role | Used by | RLS |
| --- | --- | --- |
| `app_migrator` | drizzle-kit and CI | bypasses RLS, migrations only |
| `app_api` | API Worker through Hyperdrive | subject to RLS, no `BYPASSRLS` |
| `anon`, `authenticated` | nobody in this product | privileges revoked on application tables |

The API opens a transaction and runs:

```sql
select set_config('app.tenant_id', $tenant, true);
select set_config('app.user_id', $user, true);
```

`true` means the setting dies with the transaction. Session-level settings are forbidden because Hyperdrive pools connections.

```sql
create or replace function app.current_tenant_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.tenant_id', true), '')::uuid;
$$;
```

Policies on a tenant table follow one shape:

```sql
create policy tenant_isolation on workspaces
  for all
  to app_api
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());
```

Staff who are assigned to a tenant get that tenant id set by the API after the assignment check. The database does not grant "all tenants" to a role. Platform tables (leads, before a tenant exists) use a second setting, `app.staff`, that the API sets only after the staff permission check, plus a policy that allows access when that setting is `on`.

CI fails when a table in `app` has `tenant_id` and row-level security is not enabled and forced.

## Tables in Sprint 1

Tenant-owned tables carry `tenant_id` and the policy above.

| Table | Scope | Notes |
| --- | --- | --- |
| `tenants` | platform | `slug` unique, `plan`, `status` |
| `workspaces` | tenant | unique `(tenant_id, slug)` |
| `profiles` | platform | primary key matches `auth.users.id` |
| `tenant_memberships` | tenant | unique `(tenant_id, user_id)`, role check, covering index on `(user_id, tenant_id)` |
| `staff_assignments` | tenant | staff user assigned to a tenant |
| `permissions`, `role_permissions` | platform | seeded from code |
| `invitations` | tenant | `token_hash` only, partial index where `status = 'pending'` |
| `leads`, `lead_briefs`, `lead_sources` | platform, staff | PII comments on name and email |
| `success_manager_notes` | staff, optional `tenant_id` | append-only |
| `opportunities` | staff | discovery record on a lead |
| `onboarding_projects`, `onboarding_checklist_items` | tenant | checklist item denormalizes `tenant_id` for RLS |
| `connectors` | platform catalog | no RLS, read via API |
| `connections` | tenant | soft delete via `deleted_at` |
| `credential_references` | tenant | ciphertext, nonce, `key_version`. No plaintext |
| `data_scopes` | tenant | unique `(connection_id, resource_type, resource_id)` |
| `data_health` | tenant | one row per connection and scope |
| `audit_events` | tenant or null for platform | bigint identity, no update, no delete |
| `outbox_events` | tenant or null | bigint identity, partial index on pending |
| `feature_flags`, `feature_flag_overrides` | platform and tenant | unknown flag is off |

`sync_runs` arrives with the first real sync in Sprint 2. The connection and health tables exist in Sprint 1 so the mock connector can report status.

## Audit immutability

```sql
revoke update, delete on audit_events from app_api;

create or replace function app.prevent_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_events are immutable';
end;
$$;
```

A before-update-or-delete trigger calls that function.

## Indexes

Tenant tables lead with `tenant_id`. Foreign keys that the API looks up by id also get an index. Partial indexes cover hot filters (`deleted_at is null`, `status = 'pending'`).

## PII

Columns that hold a name, email, IP address or user agent get a comment starting with `PII:`. Sprint 1 does not build erasure. The comments exist so a later erasure job can find them.

## What Sprint 2 must not break

`metric_definitions` allow a null `tenant_id` for platform definitions and a unique `(tenant_id, key)` for overrides. `metric_values` use `numeric` and a unique key of tenant, definition version, period and a hash of the dimensions. Embeddings, when they arrive, are `vector(1536)` and every similarity query filters `tenant_id` in the same statement as the distance ordering.

Do not use a Postgres enum. Do not use `float` for a metric. Do not add a tenant table without a policy.
