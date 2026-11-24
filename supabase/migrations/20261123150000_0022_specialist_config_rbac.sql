-- Sprint 4 specialist configuration permissions and feature flag.
-- Must stay aligned with packages/core/src/rbac.ts and packages/core/src/flags.ts.

INSERT INTO public.permissions (name) VALUES
  ('config:read'),
  ('config:write')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_id)
SELECT r.role, p.id
FROM (VALUES
  ('platform_admin', 'config:read'),
  ('platform_admin', 'config:write'),
  ('ai_specialist', 'config:read'),
  ('ai_specialist', 'config:write'),
  ('success_manager', 'config:read'),
  ('customer_admin', 'config:read')
) AS r(role, permission)
JOIN public.permissions p ON p.name = r.permission
ON CONFLICT DO NOTHING;

INSERT INTO public.feature_flags (key, description, is_enabled) VALUES
  ('specialist_config', 'Specialist configuration for profiles, skills, and workflows', false)
ON CONFLICT (key) DO NOTHING;
