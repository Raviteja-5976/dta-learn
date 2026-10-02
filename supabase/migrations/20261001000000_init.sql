-- ═══════════════════════════════════════════════════════════════════════════
-- DevTrackAcademy Learn — initial schema
--
-- Adapted from the system design (§28) for Supabase:
--   • identity lives in auth.users + public.profiles (Supabase Auth)
--   • course → sections → items (article | lab | quiz)
--   • labs are versioned YAML specs (terminal or compile runtime)
--   • every learner-facing WRITE goes through the Next.js API with the
--     service-role key; RLS only grants learners READ access to their own
--     rows and to content they are entitled to. Answer keys, lab specs and
--     hidden test cases are never readable through the public API.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;
create extension if not exists citext;

-- ── helpers ────────────────────────────────────────────────────────────────
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ═══ identity ═══════════════════════════════════════════════════════════════
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       citext not null,
  full_name   text,
  headline    text,
  avatar_url  text,
  role        text not null default 'student' check (role in ('student', 'instructor', 'admin')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index profiles_email_idx on public.profiles (email);
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.current_role_name() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('instructor', 'admin') from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

-- ═══ catalog ════════════════════════════════════════════════════════════════
create table public.courses (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title            text not null,
  subtitle         text,
  description      text,                 -- markdown
  cover_image_url  text,
  level            text not null default 'beginner' check (level in ('beginner', 'intermediate', 'advanced')),
  tags             text[] not null default '{}',
  skills           text[] not null default '{}',
  status           text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  is_free          boolean not null default true,
  price_paise      integer check (price_paise is null or price_paise >= 0),
  estimated_hours  numeric(6,1),
  owner_id         uuid references public.profiles(id) on delete set null,
  published_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index courses_status_idx on public.courses (status, published_at desc);
create trigger courses_touch before update on public.courses
  for each row execute function public.touch_updated_at();

create table public.sections (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid not null references public.courses(id) on delete cascade,
  title        text not null,
  description  text,
  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index sections_course_idx on public.sections (course_id, position);
create trigger sections_touch before update on public.sections
  for each row execute function public.touch_updated_at();

-- sandbox images (design §4.10): immutable, versioned Debian ext2 images on a CDN
create table public.sandbox_images (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null,
  version        integer not null,
  url            text not null,
  image_type     text not null check (image_type in ('cloud', 'bytes', 'github')),
  size_bytes     bigint,
  sha256         text,
  status         text not null default 'active' check (status in ('active', 'retired')),
  boot_manifest  jsonb,                 -- optional list of chunk URLs to prefetch (design §4.9)
  notes          text,
  created_at     timestamptz not null default now(),
  unique (slug, version)
);

-- compile languages snapshot (design §5.5): labs reference slugs only
create table public.compile_languages (
  slug                  text primary key,
  provider_language_id  integer not null,
  label                 text not null,
  monaco_language       text not null default 'plaintext',
  main_file             text not null default 'main.txt',
  enabled               boolean not null default true,
  default_limits        jsonb not null default '{"cpuSeconds":2,"wallSeconds":5,"memoryMiB":256}',
  created_at            timestamptz not null default now()
);

create table public.labs (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title               text not null,
  runtime_type        text not null check (runtime_type in ('terminal', 'compile')),
  current_version_id  uuid,
  owner_id            uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create trigger labs_touch before update on public.labs
  for each row execute function public.touch_updated_at();

-- every saved lab spec is an immutable version (design §6)
create table public.lab_versions (
  id                uuid primary key default gen_random_uuid(),
  lab_id            uuid not null references public.labs(id) on delete cascade,
  version           integer not null,
  spec_yaml         text not null,
  spec              jsonb not null,
  runtime_type      text not null check (runtime_type in ('terminal', 'compile')),
  language          text references public.compile_languages(slug),
  sandbox_image_id  uuid references public.sandbox_images(id),
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  unique (lab_id, version)
);
alter table public.labs
  add constraint labs_current_version_fk foreign key (current_version_id)
  references public.lab_versions(id) on delete set null;

create table public.items (
  id                 uuid primary key default gen_random_uuid(),
  course_id          uuid not null references public.courses(id) on delete cascade,
  section_id         uuid not null references public.sections(id) on delete cascade,
  kind               text not null check (kind in ('article', 'lab', 'quiz')),
  title              text not null,
  summary            text,
  position           integer not null default 0,
  required           boolean not null default true,
  is_preview         boolean not null default false,
  estimated_minutes  integer,
  lab_id             uuid references public.labs(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index items_section_idx on public.items (section_id, position);
create index items_course_idx on public.items (course_id);
create trigger items_touch before update on public.items
  for each row execute function public.touch_updated_at();

-- articles: an ordered list of typed blocks { id, type, v, data } (design §2)
create table public.articles (
  item_id          uuid primary key references public.items(id) on delete cascade,
  blocks           jsonb not null default '[]',
  reading_minutes  integer,
  updated_at       timestamptz not null default now()
);
create trigger articles_touch before update on public.articles
  for each row execute function public.touch_updated_at();

create table public.quizzes (
  item_id            uuid primary key references public.items(id) on delete cascade,
  pass_score         integer not null default 70 check (pass_score between 0 and 100),
  shuffle_questions  boolean not null default false,
  max_attempts       integer check (max_attempts is null or max_attempts > 0),
  show_answers       boolean not null default true,
  updated_at         timestamptz not null default now()
);
create trigger quizzes_touch before update on public.quizzes
  for each row execute function public.touch_updated_at();

create table public.questions (
  id             uuid primary key default gen_random_uuid(),
  item_id        uuid not null references public.quizzes(item_id) on delete cascade,
  position       integer not null default 0,
  type           text not null check (type in ('single', 'multiple', 'text', 'code_output')),
  prompt         text not null,          -- markdown
  code           text,                   -- optional code snippet shown with the prompt
  code_language  text,
  options        jsonb not null default '[]',   -- [{ id, text }]
  points         integer not null default 1 check (points > 0),
  created_at     timestamptz not null default now()
);
create index questions_item_idx on public.questions (item_id, position);

-- answer keys and explanations are NEVER sent to clients (design §28)
create table public.question_keys (
  question_id  uuid primary key references public.questions(id) on delete cascade,
  answer       jsonb not null,           -- { correct: [optionId] } | { accepted: [text], caseSensitive }
  explanation  text
);

-- ═══ commerce (minimal: entitlements answer "can they access this?") ═════════
create table public.entitlements (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  scope_type  text not null check (scope_type in ('course', 'catalog')),
  course_id   uuid references public.courses(id) on delete cascade,
  source      text not null check (source in ('free', 'purchase', 'subscription', 'admin_grant', 'coupon_grant', 'org_seat')),
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz,
  status      text not null default 'active' check (status in ('active', 'revoked', 'expired')),
  note        text,
  granted_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  check ((scope_type = 'course') = (course_id is not null))
);
create index entitlements_access_idx on public.entitlements (user_id) where status = 'active';

-- ═══ learning ═══════════════════════════════════════════════════════════════
create table public.enrollments (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  course_id         uuid not null references public.courses(id) on delete cascade,
  source            text not null default 'free',
  enrolled_at       timestamptz not null default now(),
  completed_at      timestamptz,
  last_item_id      uuid references public.items(id) on delete set null,
  last_activity_at  timestamptz not null default now(),
  unique (user_id, course_id)
);
create index enrollments_user_idx on public.enrollments (user_id, last_activity_at desc);

create table public.item_progress (
  user_id       uuid not null references public.profiles(id) on delete cascade,
  item_id       uuid not null references public.items(id) on delete cascade,
  course_id     uuid not null references public.courses(id) on delete cascade,
  status        text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  score         numeric(5,2),
  evidence      text check (evidence in ('server', 'client', 'self')),
  completed_at  timestamptz,
  updated_at    timestamptz not null default now(),
  primary key (user_id, item_id)
);
create index item_progress_course_idx on public.item_progress (user_id, course_id);

create table public.lab_attempts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  lab_version_id  uuid not null references public.lab_versions(id) on delete cascade,
  item_id         uuid references public.items(id) on delete set null,
  course_id       uuid references public.courses(id) on delete set null,
  runtime_type    text not null check (runtime_type in ('terminal', 'compile')),
  status          text not null default 'active' check (status in ('active', 'completed', 'closed')),
  steps_passed    text[] not null default '{}',
  hints_used      jsonb not null default '{}',
  seed            text,
  draft           jsonb,
  started_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  completed_at    timestamptz
);
create index lab_attempts_user_idx on public.lab_attempts (user_id, lab_version_id, started_at desc);
create trigger lab_attempts_touch before update on public.lab_attempts
  for each row execute function public.touch_updated_at();

create table public.validation_results (
  id          bigint generated always as identity primary key,
  attempt_id  uuid not null references public.lab_attempts(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  step_id     text not null,
  check_id    text not null,
  passed      boolean not null,
  source      text not null check (source in ('server', 'client')),
  details     jsonb,
  created_at  timestamptz not null default now()
);
create index validation_results_attempt_idx on public.validation_results (attempt_id, created_at desc);

create table public.code_runs (
  id            bigint generated always as identity primary key,
  attempt_id    uuid references public.lab_attempts(id) on delete set null,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  language      text not null,
  kind          text not null check (kind in ('run', 'check')),
  verdict       text,
  time_ms       integer,
  memory_kib    integer,
  provider_ref  text,
  cached        boolean not null default false,
  created_at    timestamptz not null default now()
);
create index code_runs_user_idx on public.code_runs (user_id, created_at desc);

-- Run results cached for 10 minutes keyed by a hash of language, files, stdin, limits (design §5.4)
create table public.compile_cache (
  key         text primary key,
  result      jsonb not null,
  created_at  timestamptz not null default now()
);

create table public.quiz_attempts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  item_id       uuid not null references public.items(id) on delete cascade,
  course_id     uuid not null references public.courses(id) on delete cascade,
  answers       jsonb not null,
  results       jsonb not null,
  score         numeric(5,2) not null,
  passed        boolean not null,
  submitted_at  timestamptz not null default now()
);
create index quiz_attempts_user_idx on public.quiz_attempts (user_id, item_id, submitted_at desc);

create table public.certificates (
  id              uuid primary key default gen_random_uuid(),
  public_code     text not null unique,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  course_id       uuid not null references public.courses(id) on delete cascade,
  recipient_name  text not null,
  course_title    text not null,
  skills          text[] not null default '{}',
  hours           numeric(6,1),
  evidence        jsonb not null default '{}',
  payload_hash    text not null,
  status          text not null default 'valid' check (status in ('valid', 'revoked')),
  issued_at       timestamptz not null default now(),
  unique (user_id, course_id)
);

-- xAPI-like learning events: actor, verb, object, result, context (design §20)
create table public.learning_events (
  id           bigint generated always as identity primary key,
  actor_id     uuid references public.profiles(id) on delete set null,
  verb         text not null,
  object_type  text not null,
  object_id    text,
  result       jsonb,
  context      jsonb,
  ts           timestamptz not null default now()
);
create index learning_events_ts_idx on public.learning_events using brin (ts);
create index learning_events_actor_idx on public.learning_events (actor_id, ts desc);

-- ═══ platform ═══════════════════════════════════════════════════════════════
create table public.media_assets (
  id            uuid primary key default gen_random_uuid(),
  key           text not null unique,
  url           text,
  visibility    text not null check (visibility in ('public', 'private')),
  content_type  text,
  size_bytes    bigint,
  file_name     text,
  uploaded_by   uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create table public.audit_logs (
  id             bigint generated always as identity primary key,
  actor_id       uuid references public.profiles(id) on delete set null,
  action         text not null,
  resource_type  text not null,
  resource_id    text,
  before         jsonb,
  after          jsonb,
  created_at     timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

-- ═══ access functions ═══════════════════════════════════════════════════════
-- Mirrors the design's single access check (§13): staff, free+enrolled, or an
-- active entitlement for the course or the whole catalog.
create or replace function public.has_course_access(p_course uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select
    public.is_staff()
    or exists (
      select 1 from public.courses c
      join public.enrollments e on e.course_id = c.id and e.user_id = auth.uid()
      where c.id = p_course and c.is_free
    )
    or exists (
      select 1 from public.entitlements en
      where en.user_id = auth.uid()
        and en.status = 'active'
        and now() >= en.starts_at
        and (en.ends_at is null or now() < en.ends_at)
        and (en.scope_type = 'catalog' or en.course_id = p_course)
    )
$$;

create or replace function public.can_access_item(p_item uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.items i
    join public.courses c on c.id = i.course_id
    where i.id = p_item
      and (
        public.is_staff()
        or (c.status = 'published' and (i.is_preview or public.has_course_access(c.id)))
      )
  )
$$;

-- ═══ row level security ═════════════════════════════════════════════════════
alter table public.profiles            enable row level security;
alter table public.courses             enable row level security;
alter table public.sections            enable row level security;
alter table public.items               enable row level security;
alter table public.articles            enable row level security;
alter table public.quizzes             enable row level security;
alter table public.questions           enable row level security;
alter table public.question_keys       enable row level security;
alter table public.sandbox_images      enable row level security;
alter table public.compile_languages   enable row level security;
alter table public.labs                enable row level security;
alter table public.lab_versions        enable row level security;
alter table public.entitlements        enable row level security;
alter table public.enrollments         enable row level security;
alter table public.item_progress       enable row level security;
alter table public.lab_attempts        enable row level security;
alter table public.validation_results  enable row level security;
alter table public.code_runs           enable row level security;
alter table public.compile_cache       enable row level security;
alter table public.quiz_attempts       enable row level security;
alter table public.certificates        enable row level security;
alter table public.learning_events     enable row level security;
alter table public.media_assets        enable row level security;
alter table public.audit_logs          enable row level security;

-- profiles: read own (staff read all); update only harmless columns
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_staff());
create policy profiles_update_own on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated, anon;
grant update (full_name, headline, avatar_url) on public.profiles to authenticated;

-- catalog: published structure is public; drafts are staff-only
create policy courses_select on public.courses for select
  using (status = 'published' or public.is_staff());
create policy sections_select on public.sections for select
  using (exists (select 1 from public.courses c where c.id = course_id and (c.status = 'published' or public.is_staff())));
create policy items_select on public.items for select
  using (exists (select 1 from public.courses c where c.id = course_id and (c.status = 'published' or public.is_staff())));

-- content bodies require access to the item
create policy articles_select on public.articles for select using (public.can_access_item(item_id));
create policy quizzes_select on public.quizzes for select using (public.can_access_item(item_id));
create policy questions_select on public.questions for select using (public.can_access_item(item_id));
-- question_keys, labs, lab_versions, sandbox_images: no policies → service role only

create policy compile_languages_select on public.compile_languages for select using (enabled or public.is_staff());

-- learner-owned rows: read own only; writes go through the API (service role)
create policy entitlements_select on public.entitlements for select using (user_id = auth.uid() or public.is_admin());
create policy enrollments_select on public.enrollments for select using (user_id = auth.uid() or public.is_staff());
create policy item_progress_select on public.item_progress for select using (user_id = auth.uid() or public.is_staff());
create policy lab_attempts_select on public.lab_attempts for select using (user_id = auth.uid());
create policy validation_results_select on public.validation_results for select using (user_id = auth.uid());
create policy code_runs_select on public.code_runs for select using (user_id = auth.uid());
create policy quiz_attempts_select on public.quiz_attempts for select using (user_id = auth.uid());
create policy certificates_select on public.certificates for select using (user_id = auth.uid());
-- compile_cache, learning_events, media_assets, audit_logs: service role only
