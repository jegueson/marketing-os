-- A run may stop before a connector write. The approval is still required.
-- Must stay aligned with packages/db/src/schema/workflow-runs.ts.

alter table public.workflow_runs drop constraint if exists workflow_runs_status_check;
alter table public.workflow_runs
  add constraint workflow_runs_status_check
  check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'awaiting_approval'));
