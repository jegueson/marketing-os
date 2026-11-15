-- Align stored data-health status with the shared model. `unknown` becomes `never_synced`.

update public.data_health set status = 'never_synced' where status = 'unknown';

alter table public.data_health alter column status set default 'never_synced';

alter table public.data_health drop constraint data_health_status_check;

alter table public.data_health
  add constraint data_health_status_check
  check (status in ('healthy', 'stale', 'error', 'never_synced'));
