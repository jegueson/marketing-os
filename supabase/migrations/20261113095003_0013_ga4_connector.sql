-- GA4 is installed but stays hidden until feature flag connector.google-analytics is on.
-- Production sync still waits on docs/connectors/approvals.md.

INSERT INTO public.connectors (slug, name, description, category, auth_type, status, supported_scopes)
VALUES (
  'google-analytics',
  'Google Analytics 4',
  'Read-only GA4 properties, sessions, and key events',
  'analytics',
  'oauth2',
  'active',
  '["https://www.googleapis.com/auth/analytics.readonly"]'::jsonb
)
ON CONFLICT (slug) DO NOTHING;
