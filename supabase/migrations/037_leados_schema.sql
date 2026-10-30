-- =============================================================================
-- LeadOS — Supabase Migration 0001
-- All tables are prefixed with "leados_" to avoid conflicts with other
-- projects sharing this Supabase instance.
-- Row Level Security is enabled on EVERY table in this file.
-- =============================================================================

-- ─── Helper: get current LeadOS user id from Supabase auth ───
create or replace function leados_current_user_id()
returns uuid
language sql stable
as $$
  select coalesce(auth.uid()::text, '')::uuid
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- PROFILES
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.leados_profiles (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text,
  avatar_url text,
  password_hash text not null,
  role text not null default 'researcher',
  is_owner boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.leados_profiles enable row level security;

drop policy if exists "leados_profiles_select_self" on public.leados_profiles;
create policy "leados_profiles_select_self"
  on public.leados_profiles for select
  using (id = auth.uid());

drop policy if exists "leados_profiles_insert_self" on public.leados_profiles;
create policy "leados_profiles_insert_self"
  on public.leados_profiles for insert
  with check (id = auth.uid());

drop policy if exists "leados_profiles_update_self" on public.leados_profiles;
create policy "leados_profiles_update_self"
  on public.leados_profiles for update
  using (id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════════════
-- WORKSPACES
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.leados_workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.leados_workspaces enable row level security;

-- ═══════════════════════════════════════════════════════════════════════════
-- WORKSPACE MEMBERS
-- Created before the workspaces policies below because those policies reference
-- this table (a forward reference would fail on a fresh database).
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.leados_workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.leados_workspaces(id) on delete cascade,
  user_id uuid not null references public.leados_profiles(id) on delete cascade,
  role text not null default 'researcher',
  joined_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

alter table public.leados_workspace_members enable row level security;

drop policy if exists "leados_members_select_self" on public.leados_workspace_members;
create policy "leados_members_select_self"
  on public.leados_workspace_members for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.leados_workspace_members m
      where m.workspace_id = workspace_id and m.user_id = auth.uid()
    )
  );

drop policy if exists "leados_members_insert_self" on public.leados_workspace_members;
create policy "leados_members_insert_self"
  on public.leados_workspace_members for insert
  with check (user_id = auth.uid());

drop policy if exists "leados_members_update_admin" on public.leados_workspace_members;
create policy "leados_members_update_admin"
  on public.leados_workspace_members for update
  using (
    exists (
      select 1 from public.leados_workspace_members m
      where m.workspace_id = workspace_id and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

drop policy if exists "leados_workspaces_select_member" on public.leados_workspaces;
create policy "leados_workspaces_select_member"
  on public.leados_workspaces for select
  using (
    exists (
      select 1 from public.leados_workspace_members m
      where m.workspace_id = id and m.user_id = auth.uid()
    )
  );

drop policy if exists "leados_workspaces_insert_owner" on public.leados_workspaces;
create policy "leados_workspaces_insert_owner"
  on public.leados_workspaces for insert
  with check (
    exists (
      select 1 from public.leados_profiles p
      where p.id = auth.uid() and p.is_owner = true
    )
  );

drop policy if exists "leados_workspaces_update_admin" on public.leados_workspaces;
create policy "leados_workspaces_update_admin"
  on public.leados_workspaces for update
  using (
    exists (
      select 1 from public.leados_workspace_members m
      where m.workspace_id = id and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- PROJECTS
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.leados_projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.leados_workspaces(id) on delete cascade,
  name text not null,
  logo_url text,
  website text,
  short_description text,
  product_service text,
  target_customer_description text,
  industries jsonb not null default '[]',
  business_categories jsonb not null default '[]',
  preferred_locations jsonb not null default '[]',
  countries jsonb not null default '[]',
  target_business_size text,
  positive_keywords jsonb not null default '[]',
  negative_keywords jsonb not null default '[]',
  ideal_customer_profile text,
  notes text,
  default_ai_prompt text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index leados_projects_workspace_idx on public.leados_projects(workspace_id);

alter table public.leados_projects enable row level security;

drop policy if exists "leados_projects_select_member" on public.leados_projects;
create policy "leados_projects_select_member"
  on public.leados_projects for select
  using (
    exists (
      select 1 from public.leados_workspace_members m
      where m.workspace_id = workspace_id and m.user_id = auth.uid()
    )
  );

drop policy if exists "leados_projects_insert_member" on public.leados_projects;
create policy "leados_projects_insert_member"
  on public.leados_projects for insert
  with check (
    exists (
      select 1 from public.leados_workspace_members m
      where m.workspace_id = workspace_id and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'researcher')
    )
  );

drop policy if exists "leados_projects_update_member" on public.leados_projects;
create policy "leados_projects_update_member"
  on public.leados_projects for update
  using (
    exists (
      select 1 from public.leados_workspace_members m
      where m.workspace_id = workspace_id and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'researcher')
    )
  );

drop policy if exists "leados_projects_delete_admin" on public.leados_projects;
create policy "leados_projects_delete_admin"
  on public.leados_projects for delete
  using (
    exists (
      select 1 from public.leados_workspace_members m
      where m.workspace_id = workspace_id and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- LEADS
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.leados_leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.leados_workspaces(id) on delete cascade,
  business_name text not null,
  category text,
  address text,
  city text,
  region text,
  country text,
  website text,
  phone text,
  email text,
  email_source text,
  latitude real,
  longitude real,
  osm_type text,
  osm_id text,
  osm_url text,
  data_source text not null default 'openstreetmap',
  opportunity_score integer,
  opportunity_signals jsonb,
  status text not null default 'new',
  starred boolean not null default false,
  tags jsonb not null default '[]',
  notes text,
  ai_analysis jsonb,
  discovered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, data_source, osm_type, osm_id)
);

create index leados_leads_workspace_idx on public.leados_leads(workspace_id);

alter table public.leados_leads enable row level security;

drop policy if exists "leados_leads_select_member" on public.leados_leads;
create policy "leados_leads_select_member"
  on public.leados_leads for select
  using (
    exists (
      select 1 from public.leados_workspace_members m
      where m.workspace_id = workspace_id and m.user_id = auth.uid()
    )
  );

drop policy if exists "leados_leads_insert_member" on public.leados_leads;
create policy "leados_leads_insert_member"
  on public.leados_leads for insert
  with check (
    exists (
      select 1 from public.leados_workspace_members m
      where m.workspace_id = workspace_id and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'researcher')
    )
  );

drop policy if exists "leados_leads_update_member" on public.leados_leads;
create policy "leados_leads_update_member"
  on public.leados_leads for update
  using (
    exists (
      select 1 from public.leados_workspace_members m
      where m.workspace_id = workspace_id and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'researcher')
    )
  );

drop policy if exists "leados_leads_delete_admin" on public.leados_leads;
create policy "leados_leads_delete_admin"
  on public.leados_leads for delete
  using (
    exists (
      select 1 from public.leados_workspace_members m
      where m.workspace_id = workspace_id and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- PROJECT LEADS (many-to-many)
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.leados_project_leads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.leados_projects(id) on delete cascade,
  lead_id uuid not null references public.leados_leads(id) on delete cascade,
  project_fit_score integer,
  project_fit_reasons jsonb,
  outreach_angles jsonb,
  created_at timestamptz not null default now(),
  unique (project_id, lead_id)
);

alter table public.leados_project_leads enable row level security;

drop policy if exists "leados_project_leads_select_member" on public.leados_project_leads;
create policy "leados_project_leads_select_member"
  on public.leados_project_leads for select
  using (
    exists (
      select 1 from public.leados_projects p
      join public.leados_workspace_members m on m.workspace_id = p.workspace_id
      where p.id = project_id and m.user_id = auth.uid()
    )
  );

drop policy if exists "leados_project_leads_insert_member" on public.leados_project_leads;
create policy "leados_project_leads_insert_member"
  on public.leados_project_leads for insert
  with check (
    exists (
      select 1 from public.leados_projects p
      join public.leados_workspace_members m on m.workspace_id = p.workspace_id
      where p.id = project_id and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'researcher')
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- SEARCHES
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.leados_searches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.leados_workspaces(id) on delete cascade,
  user_id uuid not null references public.leados_profiles(id) on delete cascade,
  project_id uuid references public.leados_projects(id) on delete set null,
  category text,
  location text,
  raw_query text,
  filters jsonb,
  provider text not null default 'openstreetmap',
  geocode_success boolean,
  resolved_location text,
  bounding_area jsonb,
  categories_queried jsonb,
  raw_results_count integer,
  normalized_count integer,
  duplicates_removed integer,
  results_count integer not null default 0,
  ai_analysis_status text,
  ai_analysis_count integer,
  ai_failures integer,
  response_time_ms integer,
  error_summary text,
  ai_model text,
  created_at timestamptz not null default now()
);

create index leados_searches_workspace_idx on public.leados_searches(workspace_id);

alter table public.leados_searches enable row level security;

drop policy if exists "leados_searches_select_member" on public.leados_searches;
create policy "leados_searches_select_member"
  on public.leados_searches for select
  using (
    exists (
      select 1 from public.leados_workspace_members m
      where m.workspace_id = workspace_id and m.user_id = auth.uid()
    )
  );

drop policy if exists "leados_searches_insert_self" on public.leados_searches;
create policy "leados_searches_insert_self"
  on public.leados_searches for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.leados_workspace_members m
      where m.workspace_id = workspace_id and m.user_id = auth.uid()
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- CATEGORY MAPPINGS (platform-level, admin-only)
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.leados_category_mappings (
  id uuid primary key default gen_random_uuid(),
  category_name text not null unique,
  osm_tags jsonb not null,
  aliases jsonb not null default '[]',
  related_categories jsonb not null default '[]',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.leados_category_mappings enable row level security;

drop policy if exists "leados_category_mappings_select_any" on public.leados_category_mappings;
create policy "leados_category_mappings_select_any"
  on public.leados_category_mappings for select
  using (true);  -- read-only reference data for all authenticated users

drop policy if exists "leados_category_mappings_modify_owner" on public.leados_category_mappings;
create policy "leados_category_mappings_modify_owner"
  on public.leados_category_mappings for all
  using (
    exists (
      select 1 from public.leados_profiles p
      where p.id = auth.uid() and p.is_owner = true
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- AI SETTINGS (platform-level, owner-only — may contain encrypted secrets)
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.leados_ai_settings (
  id uuid primary key default gen_random_uuid(),
  setting_key text not null unique,
  setting_value text,
  updated_at timestamptz not null default now()
);

alter table public.leados_ai_settings enable row level security;

drop policy if exists "leados_ai_settings_select_owner" on public.leados_ai_settings;
create policy "leados_ai_settings_select_owner"
  on public.leados_ai_settings for select
  using (
    exists (
      select 1 from public.leados_profiles p
      where p.id = auth.uid() and p.is_owner = true
    )
  );

drop policy if exists "leados_ai_settings_modify_owner" on public.leados_ai_settings;
create policy "leados_ai_settings_modify_owner"
  on public.leados_ai_settings for all
  using (
    exists (
      select 1 from public.leados_profiles p
      where p.id = auth.uid() and p.is_owner = true
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- AI PROMPT TEMPLATES
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.leados_ai_prompt_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  purpose text,
  prompt_content text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.leados_ai_prompt_templates enable row level security;

drop policy if exists "leados_ai_prompt_templates_select_owner" on public.leados_ai_prompt_templates;
create policy "leados_ai_prompt_templates_select_owner"
  on public.leados_ai_prompt_templates for select
  using (
    exists (select 1 from public.leados_profiles p where p.id = auth.uid() and p.is_owner = true)
  );

drop policy if exists "leados_ai_prompt_templates_modify_owner" on public.leados_ai_prompt_templates;
create policy "leados_ai_prompt_templates_modify_owner"
  on public.leados_ai_prompt_templates for all
  using (
    exists (select 1 from public.leados_profiles p where p.id = auth.uid() and p.is_owner = true)
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- AI USAGE LOG
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.leados_ai_usage_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.leados_workspaces(id) on delete cascade,
  user_id uuid references public.leados_profiles(id) on delete set null,
  provider text not null,
  model text,
  task text not null,
  input_tokens integer,
  output_tokens integer,
  latency_ms integer,
  success boolean not null default true,
  error_message text,
  created_at timestamptz not null default now()
);

alter table public.leados_ai_usage_log enable row level security;

drop policy if exists "leados_ai_usage_log_select_owner" on public.leados_ai_usage_log;
create policy "leados_ai_usage_log_select_owner"
  on public.leados_ai_usage_log for select
  using (
    exists (select 1 from public.leados_profiles p where p.id = auth.uid() and p.is_owner = true)
  );

drop policy if exists "leados_ai_usage_log_insert_self" on public.leados_ai_usage_log;
create policy "leados_ai_usage_log_insert_self"
  on public.leados_ai_usage_log for insert
  with check (user_id = auth.uid() or user_id is null);

-- ═══════════════════════════════════════════════════════════════════════════
-- SYSTEM SETTINGS
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.leados_system_settings (
  id uuid primary key default gen_random_uuid(),
  setting_key text not null unique,
  setting_value jsonb,
  updated_at timestamptz not null default now()
);

alter table public.leados_system_settings enable row level security;

drop policy if exists "leados_system_settings_select_owner" on public.leados_system_settings;
create policy "leados_system_settings_select_owner"
  on public.leados_system_settings for select
  using (
    exists (select 1 from public.leados_profiles p where p.id = auth.uid() and p.is_owner = true)
  );

drop policy if exists "leados_system_settings_modify_owner" on public.leados_system_settings;
create policy "leados_system_settings_modify_owner"
  on public.leados_system_settings for all
  using (
    exists (select 1 from public.leados_profiles p where p.id = auth.uid() and p.is_owner = true)
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- FEATURE FLAGS
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.leados_feature_flags (
  id uuid primary key default gen_random_uuid(),
  flag_key text not null unique,
  flag_name text not null,
  description text,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.leados_feature_flags enable row level security;

drop policy if exists "leados_feature_flags_select_any" on public.leados_feature_flags;
create policy "leados_feature_flags_select_any"
  on public.leados_feature_flags for select
  using (true);

drop policy if exists "leados_feature_flags_modify_owner" on public.leados_feature_flags;
create policy "leados_feature_flags_modify_owner"
  on public.leados_feature_flags for all
  using (
    exists (select 1 from public.leados_profiles p where p.id = auth.uid() and p.is_owner = true)
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- AUDIT LOGS
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.leados_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.leados_profiles(id) on delete set null,
  workspace_id uuid references public.leados_workspaces(id) on delete cascade,
  action text not null,
  entity_type text,
  entity_id text,
  details jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

alter table public.leados_audit_logs enable row level security;

drop policy if exists "leados_audit_logs_select_owner" on public.leados_audit_logs;
create policy "leados_audit_logs_select_owner"
  on public.leados_audit_logs for select
  using (
    exists (select 1 from public.leados_profiles p where p.id = auth.uid() and p.is_owner = true)
  );

drop policy if exists "leados_audit_logs_insert_self" on public.leados_audit_logs;
create policy "leados_audit_logs_insert_self"
  on public.leados_audit_logs for insert
  with check (user_id = auth.uid() or user_id is null);

-- ═══════════════════════════════════════════════════════════════════════════
-- PLAN LIMITS (readable by all, modified by owner)
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.leados_plan_limits (
  id uuid primary key default gen_random_uuid(),
  plan_name text not null unique,
  display_name text not null,
  searches_per_day integer not null default 5,
  leads_per_search integer not null default 2,
  saved_leads_limit integer not null default 10,
  ai_analysis_enabled boolean not null default false,
  csv_export_enabled boolean not null default false,
  projects_limit integer not null default 1,
  price integer not null default 0,
  features jsonb not null default '[]',
  created_at timestamptz not null default now()
);

alter table public.leados_plan_limits enable row level security;

drop policy if exists "leados_plan_limits_select_any" on public.leados_plan_limits;
create policy "leados_plan_limits_select_any"
  on public.leados_plan_limits for select
  using (true);

drop policy if exists "leados_plan_limits_modify_owner" on public.leados_plan_limits;
create policy "leados_plan_limits_modify_owner"
  on public.leados_plan_limits for all
  using (
    exists (select 1 from public.leados_profiles p where p.id = auth.uid() and p.is_owner = true)
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- SUBSCRIPTIONS
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.leados_subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.leados_workspaces(id) on delete cascade,
  plan_name text not null default 'free',
  status text not null default 'active',
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.leados_subscriptions enable row level security;

drop policy if exists "leados_subscriptions_select_member" on public.leados_subscriptions;
create policy "leados_subscriptions_select_member"
  on public.leados_subscriptions for select
  using (
    exists (
      select 1 from public.leados_workspace_members m
      where m.workspace_id = workspace_id and m.user_id = auth.uid()
    )
  );

drop policy if exists "leados_subscriptions_modify_owner" on public.leados_subscriptions;
create policy "leados_subscriptions_modify_owner"
  on public.leados_subscriptions for all
  using (
    exists (select 1 from public.leados_profiles p where p.id = auth.uid() and p.is_owner = true)
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- SCORE WEIGHTS (platform-level)
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.leados_score_weights (
  id uuid primary key default gen_random_uuid(),
  signal_key text not null unique,
  signal_name text not null,
  weight integer not null default 0,
  description text,
  updated_at timestamptz not null default now()
);

alter table public.leados_score_weights enable row level security;

drop policy if exists "leados_score_weights_select_any" on public.leados_score_weights;
create policy "leados_score_weights_select_any"
  on public.leados_score_weights for select
  using (true);

drop policy if exists "leados_score_weights_modify_owner" on public.leados_score_weights;
create policy "leados_score_weights_modify_owner"
  on public.leados_score_weights for all
  using (
    exists (select 1 from public.leados_profiles p where p.id = auth.uid() and p.is_owner = true)
  );

-- =============================================================================
-- SEED DATA
-- =============================================================================
insert into public.leados_plan_limits (plan_name, display_name, searches_per_day, leads_per_search, saved_leads_limit, ai_analysis_enabled, csv_export_enabled, projects_limit, price, features) values
  ('free', 'Free', 5, 2, 10, false, false, 1, 0, '["Basic Business Data","Opportunity Score","2 Leads per Search"]'),
  ('pro', 'Pro', 50, 25, 500, true, true, 10, 1900, '["AI Analysis","Project Fit","CSV Export","Lead Library","Multiple Projects","25 Leads per Search"]'),
  ('business', 'Business', 200, 50, 5000, true, true, 50, 4900, '["Everything in Pro","Multiple Team Members","Advanced Admin","Priority Support","50 Leads per Search"]')
on conflict (plan_name) do nothing;

insert into public.leados_score_weights (signal_key, signal_name, weight, description) values
  ('no_website', 'No Website Listed', 25, 'Business has no website - potential digital opportunity'),
  ('no_phone', 'No Phone Listed', 15, 'Business has no phone number listed'),
  ('no_email', 'No Email Listed', 10, 'Business has no email contact'),
  ('incomplete_address', 'Incomplete Address', 5, 'Address information is incomplete'),
  ('has_category', 'Has Business Category', 10, 'Business has a defined category'),
  ('has_website', 'Has Website', -10, 'Business already has a website presence')
on conflict (signal_key) do nothing;

insert into public.leados_category_mappings (category_name, osm_tags, aliases, related_categories, enabled) values
  ('Restaurant', '[{"key":"amenity","value":"restaurant"}]', '["restaurants","dining","eatery"]', '[]', true),
  ('Cafe', '[{"key":"amenity","value":"cafe"}]', '["coffee shop","coffeehouse","cafes"]', '[]', true),
  ('Dentist', '[{"key":"amenity","value":"dentist"},{"key":"healthcare","value":"dentist"}]', '["dental","dental clinic","dentists"]', '[]', true),
  ('Pharmacy', '[{"key":"amenity","value":"pharmacy"}]', '["drugstore","chemist","pharmacies"]', '[]', true),
  ('Gym', '[{"key":"leisure","value":"fitness_centre"}]', '["fitness","fitness center","health club","gyms"]', '[]', true),
  ('Hotel', '[{"key":"tourism","value":"hotel"}]', '["hotels","lodging","accommodation"]', '[]', true),
  ('Beauty Salon', '[{"key":"shop","value":"beauty"},{"key":"shop","value":"hairdresser"}]', '["hair salon","hairdresser","beauty shop","barber"]', '[]', true),
  ('Real Estate Agency', '[{"key":"office","value":"estate_agent"}]', '["real estate","property agent","realtor"]', '[]', true),
  ('Lawyer', '[{"key":"office","value":"lawyer"}]', '["attorney","law firm","legal","lawyers"]', '[]', true),
  ('Veterinary', '[{"key":"amenity","value":"veterinary"}]', '["vet","animal clinic","veterinarian"]', '[]', true),
  ('Pet Shop', '[{"key":"shop","value":"pet"}]', '["pet store","pet supply"]', '[]', true),
  ('Feed Store', '[{"key":"shop","value":"agrarian"},{"key":"shop","value":"farm"}]', '["farm supply","farm store","agricultural supply","feed supply","livestock supply","feed stores"]', '["Farm Supply","Pet Shop","Equestrian Store"]', true),
  ('Farm Supply', '[{"key":"shop","value":"agrarian"},{"key":"shop","value":"farm"},{"key":"shop","value":"garden_centre"}]', '["agricultural supply","farm equipment","tractor supply"]', '["Feed Store"]', true),
  ('Equestrian Store', '[{"key":"shop","value":"equestrian"},{"key":"shop","value":"saddlery"}]', '["tack shop","horse supply","horse tack","saddlery","equestrian shop"]', '["Feed Store","Pet Shop"]', true),
  ('Supermarket', '[{"key":"shop","value":"supermarket"}]', '["grocery","grocery store"]', '[]', true),
  ('Bakery', '[{"key":"shop","value":"bakery"}]', '["bakeries","bread shop"]', '[]', true),
  ('Car Repair', '[{"key":"shop","value":"car_repair"},{"key":"amenity","value":"car_repair"}]', '["auto repair","mechanic","garage"]', '[]', true),
  ('Bank', '[{"key":"amenity","value":"bank"}]', '["banks","financial"]', '[]', true),
  ('Hospital', '[{"key":"amenity","value":"hospital"}]', '["hospitals","medical center"]', '[]', true),
  ('Doctor', '[{"key":"amenity","value":"doctors"},{"key":"healthcare","value":"doctor"}]', '["physician","medical practice","clinic"]', '[]', true)
on conflict (category_name) do nothing;

insert into public.leados_feature_flags (flag_key, flag_name, description, enabled) values
  ('website_analysis', 'Website Analysis', 'Enable AI-powered website analysis for leads', true),
  ('ai_ranking', 'AI Ranking', 'Enable AI-powered lead ranking', true),
  ('openrouter', 'OpenRouter Integration', 'Enable OpenRouter AI provider', true),
  ('deepseek', 'DeepSeek Integration', 'Enable DeepSeek AI provider', true),
  ('public_signup', 'Public Signup', 'Allow public user registration', true),
  ('billing', 'Billing', 'Enable billing and subscription features', false),
  ('new_lead_provider', 'New Lead Provider', 'Enable experimental lead data providers', false)
on conflict (flag_key) do nothing;

-- Default workspace for Himalayan Koh
insert into public.leados_workspaces (id, name, slug)
values ('00000000-0000-0000-0000-000000000001', 'Himalayan Koh LeadOS', 'himalayan-koh')
on conflict (slug) do nothing;

-- Default project for Himalayan Koh B2B Salt & Minerals
insert into public.leados_projects (
  id,
  workspace_id,
  name,
  website,
  short_description,
  product_service,
  target_customer_description,
  industries,
  business_categories,
  preferred_locations,
  countries,
  target_business_size,
  positive_keywords,
  negative_keywords,
  ideal_customer_profile,
  notes,
  status
) values (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'Himalayan Koh — B2B Salt & Minerals',
  'https://preview.himalayankoh.com',
  'Wholesale & B2B distribution of 100% natural Himalayan rock salt animal mineral licks and bulk culinary salt.',
  'Natural animal mineral salt licks (rope, carved, block), bulk organic pink salt, spa/bath minerals.',
  'Feed and farm supply retailers, livestock & equine ranches, animal health stores, food co-ops, and bulk spice/salt distributors.',
  '["Agriculture", "Livestock & Equine", "Farm Supplies", "Wholesale & Distribution", "Specialty Retail"]',
  '["Feed Store", "Farm Supply", "Equestrian Store", "Veterinary", "Supermarket"]',
  '["Texas", "Montana", "Wyoming", "Kansas", "Nebraska", "Oklahoma", "Colorado", "Iowa", "Kentucky"]',
  '["United States"]',
  'SMB to Mid-Market (Retailers, Distributors, Cooperatives)',
  '["salt lick", "feed", "farm", "tack", "equine", "livestock", "ranch", "mineral", "wholesale", "supply", "grain", "agriculture"]',
  '["fast food", "convenience store", "gas station", "car repair", "pharmacy"]',
  'Commercial feed mills, farm supply cooperatives, independent tack & feed shops, livestock ranches, and specialty grocery distributors looking for authentic, direct-imported Himalayan mineral salt products.',
  'Authoritative Himalayan Koh B2B ICP seed project.',
  'active'
) on conflict (id) do nothing;

