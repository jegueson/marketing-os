-- HubSpot is installed but stays hidden until feature flag connector.hubspot is on.
-- Production sync still waits on docs/connectors/approvals.md.

INSERT INTO public.connectors (slug, name, description, category, auth_type, status, supported_scopes)
VALUES (
  'hubspot',
  'HubSpot',
  'Read-only sandbox contacts and qualified deals',
  'crm',
  'oauth2',
  'active',
  '["crm.objects.contacts.read","crm.objects.deals.read"]'::jsonb
)
ON CONFLICT (slug) DO NOTHING;
