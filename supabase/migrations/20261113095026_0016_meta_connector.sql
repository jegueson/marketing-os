-- Meta Ads is installed but stays hidden until feature flag connector.meta is on.
-- ads_read still waits on App Review in docs/connectors/approvals.md.

INSERT INTO public.connectors (slug, name, description, category, auth_type, status, supported_scopes)
VALUES (
  'meta',
  'Meta Ads',
  'Read-only test-mode ad account spend and impressions',
  'advertising',
  'oauth2',
  'active',
  '["ads_read"]'::jsonb
)
ON CONFLICT (slug) DO NOTHING;
