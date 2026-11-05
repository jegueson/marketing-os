CREATE TABLE IF NOT EXISTS public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  contact_name text NOT NULL,
  email text NOT NULL,
  job_title text,
  country text,
  industry text,
  team_size_range text,
  channels text[] NOT NULL DEFAULT '{}',
  tech_stack text[] NOT NULL DEFAULT '{}',
  major_problem text,
  objectives text,
  spend_range text,
  agency_usage text,
  intent text NOT NULL DEFAULT 'expert_services',
  status text NOT NULL DEFAULT 'new',
  assigned_to uuid REFERENCES public.profiles(id),
  converted_tenant_id uuid REFERENCES public.tenants(id),
  converted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leads_status_check CHECK (status IN ('new','contacted','discovery','qualified','converted','disqualified','archived')),
  CONSTRAINT leads_intent_check CHECK (intent IN ('expert_services','cloud_workspace','enterprise_licence'))
);
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_email ON public.leads(email);
COMMENT ON COLUMN public.leads.contact_name IS 'PII: contact name';
COMMENT ON COLUMN public.leads.email IS 'PII: contact email';

CREATE TABLE IF NOT EXISTS public.lead_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  free_text text,
  structured_data jsonb,
  source text NOT NULL DEFAULT 'lead_form',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_briefs_lead_id ON public.lead_briefs(lead_id);

CREATE TABLE IF NOT EXISTS public.lead_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  referrer_url text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_sources_lead_id ON public.lead_sources(lead_id);

CREATE TABLE IF NOT EXISTS public.success_manager_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id),
  note_type text NOT NULL DEFAULT 'general',
  body text NOT NULL,
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sm_notes_lead_id ON public.success_manager_notes(lead_id);
CREATE INDEX IF NOT EXISTS idx_sm_notes_tenant_id ON public.success_manager_notes(tenant_id);

CREATE TABLE IF NOT EXISTS public.opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE RESTRICT,
  title text NOT NULL,
  stage text NOT NULL DEFAULT 'discovery',
  business_problems text,
  stack_map jsonb,
  pilot_objectives text,
  desired_outcomes text,
  recommended_integrations text[] DEFAULT '{}',
  owner_id uuid REFERENCES public.profiles(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_opportunities_lead_id ON public.opportunities(lead_id);

CREATE TABLE IF NOT EXISTS public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'customer_admin',
  invited_by uuid NOT NULL REFERENCES public.profiles(id),
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invitations_status_check CHECK (status IN ('pending','accepted','expired','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_invitations_tenant_id ON public.invitations(tenant_id);
COMMENT ON COLUMN public.invitations.email IS 'PII: invitee email';

CREATE TABLE IF NOT EXISTS public.onboarding_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Onboarding',
  status text NOT NULL DEFAULT 'in_progress',
  assigned_to uuid REFERENCES public.profiles(id),
  due_date date,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT onboarding_projects_status_check CHECK (status IN ('in_progress','completed','blocked'))
);
CREATE INDEX IF NOT EXISTS idx_onboarding_projects_tenant_id ON public.onboarding_projects(tenant_id);

CREATE TABLE IF NOT EXISTS public.onboarding_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.onboarding_projects(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  key text NOT NULL,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pending',
  sort_order integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  completed_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT checklist_items_project_key UNIQUE (project_id, key),
  CONSTRAINT checklist_items_status_check CHECK (status IN ('pending','in_progress','completed','skipped'))
);
CREATE INDEX IF NOT EXISTS idx_checklist_items_project_id ON public.onboarding_checklist_items(project_id);
CREATE INDEX IF NOT EXISTS idx_checklist_items_tenant_id ON public.onboarding_checklist_items(tenant_id);
