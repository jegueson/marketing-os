-- Google Ads is installed but stays hidden until feature flag connector.google-ads is on.
-- Production sync still waits on an approved developer token in docs/connectors/approvals.md.

INSERT INTO public.connectors (slug, name, description, category, auth_type, status, supported_scopes)
VALUES (
  'google-ads',
  'Google Ads',
  'Read-only test-account spend and conversions',
  'advertising',
  'oauth2',
  'active',
  '["https://www.googleapis.com/auth/adwords"]'::jsonb
)
ON CONFLICT (slug) DO NOTHING;
