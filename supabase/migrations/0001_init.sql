-- Guardians (cyberpunk portraits) and Logos (partner marks), each with an
-- immutable version history. "Current" is a pointer, never a filename, so
-- reprocessing a name can never fork a "copy 2" / "copy 3" duplicate the way
-- the old Drive-folder pipeline did.

create type guardian_status as enum ('has_result', 'awaiting_photo', 'unrecognized');
create type guardian_source as enum ('staff_upload', 'self_serve');
create type logo_status as enum ('has_result', 'awaiting_source', 'unrecognized');
create type job_type as enum ('cyberpunk_batch', 'logo_batch');
create type job_status as enum ('queued', 'running', 'completed', 'failed');
create type job_item_status as enum ('queued', 'processing', 'succeeded', 'failed', 'skipped');

create table guardians (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  attio_id text unique,
  raw_photo_path text,
  status guardian_status not null default 'awaiting_photo',
  source guardian_source not null default 'staff_upload',
  last_reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index guardians_name_idx on guardians using gin (to_tsvector('simple', name));
create index guardians_attio_id_idx on guardians (attio_id);

create table guardian_versions (
  id uuid primary key default gen_random_uuid(),
  guardian_id uuid not null references guardians (id) on delete cascade,
  result_path text not null,
  source_raw_photo_path text,
  regeneration_note text,
  is_current boolean not null default false,
  created_by text,
  created_at timestamptz not null default now()
);
create index guardian_versions_guardian_id_idx on guardian_versions (guardian_id);
-- at most one current version per guardian
create unique index guardian_versions_one_current_idx on guardian_versions (guardian_id) where is_current;

create table logos (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  attio_company_id text,
  status logo_status not null default 'awaiting_source',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index logos_company_name_idx on logos using gin (to_tsvector('simple', company_name));

create table logo_versions (
  id uuid primary key default gen_random_uuid(),
  logo_id uuid not null references logos (id) on delete cascade,
  white_transparent_path text not null,
  original_hires_path text not null,
  regeneration_note text,
  is_current boolean not null default false,
  created_by text,
  created_at timestamptz not null default now()
);
create index logo_versions_logo_id_idx on logo_versions (logo_id);
create unique index logo_versions_one_current_idx on logo_versions (logo_id) where is_current;

-- Bulk jobs: every reconciliation upload/CSV that produces work spawns one
-- job with one item per name, so bulk runs have a real, visible queue
-- instead of a page that just hangs.
create table jobs (
  id uuid primary key default gen_random_uuid(),
  type job_type not null,
  status job_status not null default 'queued',
  total_items int not null default 0,
  succeeded_items int not null default 0,
  failed_items int not null default 0,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table job_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs (id) on delete cascade,
  guardian_id uuid references guardians (id) on delete set null,
  logo_id uuid references logos (id) on delete set null,
  target_name text not null,
  status job_item_status not null default 'queued',
  error_message text,
  result_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index job_items_job_id_idx on job_items (job_id);

-- Typeform delivers webhooks at-least-once; this makes ingestion idempotent.
create table typeform_submissions (
  submission_id text primary key,
  guardian_id uuid references guardians (id) on delete set null,
  raw_payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger guardians_set_updated_at before update on guardians
  for each row execute function set_updated_at();
create trigger logos_set_updated_at before update on logos
  for each row execute function set_updated_at();
create trigger jobs_set_updated_at before update on jobs
  for each row execute function set_updated_at();
create trigger job_items_set_updated_at before update on job_items
  for each row execute function set_updated_at();
