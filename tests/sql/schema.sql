-- A minimal stand-in for the parts of the Supabase database that the
-- docs/sql scripts use. Only the columns and helpers they touch are here.

create schema if not exists auth;

-- Supabase's auth.uid(): the signed-in user, set per test with
-- set request.jwt.claim.sub = '<uuid>'.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create role anon;
create role authenticated;

create table public.students (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null,
  register_no integer,
  first_name text,
  active boolean not null default true
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid,
  title text,
  task_code text not null,
  allow_guests boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.task_classes (
  task_id uuid not null references public.tasks (id) on delete cascade,
  class_id uuid not null
);

create table public.student_sessions (
  auth_uid uuid not null,
  student_id uuid not null references public.students (id)
);

create table public.guest_profiles (
  auth_uid uuid primary key,
  last_seen_at timestamptz
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  teacher_id uuid,
  student_uid uuid,
  student_name text,
  class_name text,
  group_name text,
  map_data jsonb,
  status text not null default 'draft',
  class_id uuid,
  primary_student_id uuid,
  submission_number integer not null default 1,
  parent_submission_id uuid references public.submissions (id),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.submission_members (
  submission_id uuid not null references public.submissions (id) on delete cascade,
  task_id uuid,
  student_id uuid not null references public.students (id),
  is_creator boolean not null default false,
  submission_number integer not null default 1
);

create table public.submission_reviews (
  submission_id uuid primary key references public.submissions (id) on delete cascade,
  teacher_id uuid,
  teacher_feedback text,
  teacher_annotations jsonb,
  updated_at timestamptz not null default now()
);

create table public.submission_edit_locks (
  submission_id uuid primary key references public.submissions (id) on delete cascade
);

-- Stand-in for the live trigger sync_submission_member_task: keeps a member
-- record's Task in step with its map. (Issue #29 checked the live one: it only
-- raises an error or keeps the row, never drops it.)
create or replace function public.oe_sync_submission_member()
returns trigger
language plpgsql
as $$
begin
  select s.task_id into new.task_id
  from public.submissions s
  where s.id = new.submission_id;
  return new;
end;
$$;

create trigger sync_submission_member_task
  before insert or update on public.submission_members
  for each row execute function public.oe_sync_submission_member();

-- Helpers the scripts call but these tests don't exercise.
create or replace function public.current_auth_can_access_submission(p_submission_id uuid)
returns boolean language sql stable as $$ select true $$;

create or replace function public.student_start_group_project(
  p_task_code text, p_student_id uuid, p_member_ids uuid[]
)
returns uuid language plpgsql as $$
begin
  raise exception 'student_start_group_project is not part of these tests';
end;
$$;

create or replace function public.guest_start_project(p_task_code text)
returns uuid language plpgsql as $$
begin
  raise exception 'guest_start_project is not part of these tests';
end;
$$;
