-- Sprint 5 managed work. Off until an operator enables approvals.

insert into public.feature_flags (key, description, is_enabled)
values ('managed_work', 'Approvals for governed writes', false)
on conflict (key) do nothing;
