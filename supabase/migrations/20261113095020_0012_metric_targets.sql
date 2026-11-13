-- Optional KPI target and widget placement. Both stay null or empty when the catalog omits them.

alter table public.metric_definitions
  add column target numeric(20, 6),
  add column widgets text[] not null default '{}';
