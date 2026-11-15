-- Sprint 3 Ask Marketing permissions and feature flag.
-- Must stay aligned with packages/core/src/rbac.ts and packages/core/src/flags.ts.

INSERT INTO public.permissions (name) VALUES
  ('ask:use'),
  ('models:manage'),
  ('usage:read')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_id)
SELECT r.role, p.id
FROM (VALUES
  ('platform_admin', 'ask:use'),
  ('platform_admin', 'models:manage'),
  ('platform_admin', 'usage:read'),
  ('customer_admin', 'ask:use'),
  ('customer_admin', 'models:manage'),
  ('customer_admin', 'usage:read'),
  ('customer_user', 'ask:use'),
  ('success_manager', 'usage:read'),
  ('ai_specialist', 'usage:read')
) AS r(role, permission)
JOIN public.permissions p ON p.name = r.permission
ON CONFLICT DO NOTHING;

INSERT INTO public.feature_flags (key, description, is_enabled) VALUES
  ('ask_marketing', 'Ask Marketing conversational surface', false)
ON CONFLICT (key) DO NOTHING;
