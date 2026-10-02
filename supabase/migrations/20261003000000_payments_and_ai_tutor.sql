-- ═══════════════════════════════════════════════════════════════════════════
-- Payments (Razorpay) and the AI tutor
--
-- Commerce follows design §13: payments create ENTITLEMENTS, and only
-- entitlements grant access. Two products:
--   • course purchase  → one-time Razorpay Order → course entitlement for N months
--   • all-access plan  → Razorpay Subscription → catalog entitlement whose
--                         ends_at follows the paid period (+ grace)
-- Every write goes through the Next.js API with the service-role key. Learners
-- can read their own orders, subscriptions, payments and tutor messages.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── platform settings (small admin-editable switches) ──────────────────────
create table public.app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_by  uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now()
);
insert into public.app_settings (key, value) values
  ('ai_tutor', '{"enabled": true, "dailyLimit": 30}')
on conflict (key) do nothing;

-- ── subscription plans (mirrors a Razorpay Plan; plans are immutable there) ─
create table public.billing_plans (
  id                uuid primary key default gen_random_uuid(),
  provider          text not null default 'razorpay',
  provider_plan_id  text not null,
  name              text not null,
  amount_paise      integer not null check (amount_paise > 0),
  currency          text not null default 'INR',
  interval          text not null default 'month' check (interval in ('month', 'year')),
  active            boolean not null default true,
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  unique (provider, provider_plan_id)
);
-- at most one plan is sold at a time; older plans keep billing their subscribers
create unique index billing_plans_one_active on public.billing_plans (active) where active;

-- ── one-time course purchases ──────────────────────────────────────────────
create table public.orders (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.profiles(id) on delete cascade,
  course_id            uuid references public.courses(id) on delete set null,  -- kept as a financial record if the course is deleted
  amount_paise         integer not null check (amount_paise > 0),
  currency             text not null default 'INR',
  access_months        integer not null check (access_months > 0),
  status               text not null default 'created' check (status in ('created', 'paid', 'failed', 'refunded')),
  provider             text not null default 'razorpay',
  provider_order_id    text not null,
  provider_payment_id  text,
  paid_at              timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (provider, provider_order_id)
);
create index orders_user_idx on public.orders (user_id, created_at desc);
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

-- ── recurring all-access subscriptions ──────────────────────────────────────
create table public.subscriptions (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references public.profiles(id) on delete cascade,
  plan_id                   uuid not null references public.billing_plans(id) on delete restrict,
  status                    text not null default 'created'
                              check (status in ('created', 'authenticated', 'active', 'pending', 'halted', 'cancelled', 'completed', 'expired')),
  provider                  text not null default 'razorpay',
  provider_subscription_id  text not null,
  current_start             timestamptz,
  current_end               timestamptz,
  cancel_at_period_end      boolean not null default false,
  ended_at                  timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (provider, provider_subscription_id)
);
create index subscriptions_user_idx on public.subscriptions (user_id, created_at desc);
create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function public.touch_updated_at();

-- ── captured payments (both products), for receipts and reconciliation ─────
create table public.payments (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.profiles(id) on delete cascade,
  order_id             uuid references public.orders(id) on delete set null,
  subscription_id      uuid references public.subscriptions(id) on delete set null,
  provider             text not null default 'razorpay',
  provider_payment_id  text not null,
  amount_paise         integer not null,
  currency             text not null default 'INR',
  status               text not null default 'captured' check (status in ('captured', 'refunded', 'partially_refunded')),
  method               text,
  created_at           timestamptz not null default now(),
  unique (provider, provider_payment_id)
);
create index payments_user_idx on public.payments (user_id, created_at desc);

-- ── webhook idempotency (design §13: payment_events.event_id is unique) ─────
create table public.payment_events (
  id            bigint generated always as identity primary key,
  provider      text not null default 'razorpay',
  event_id      text not null,
  event_type    text not null,
  payload       jsonb not null,
  processed_at  timestamptz,
  error         text,
  created_at    timestamptz not null default now(),
  unique (provider, event_id)
);

-- ── entitlements remember which order / subscription created them ──────────
-- Plain UNIQUE allows many NULLs, so each order or subscription maps to at
-- most one entitlement and concurrent fulfilment (checkout callback vs.
-- webhook) can upsert safely.
alter table public.entitlements
  add column order_id uuid unique references public.orders(id) on delete set null,
  add column subscription_id uuid unique references public.subscriptions(id) on delete set null;

-- ── AI tutor conversations (one thread per learner per item) ───────────────
create table public.ai_messages (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  item_id     uuid not null references public.items(id) on delete cascade,
  course_id   uuid not null references public.courses(id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  model       text,
  tokens_in   integer,
  tokens_out  integer,
  -- "New chat" archives instead of deleting, so the daily cap still counts it
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index ai_messages_thread_idx on public.ai_messages (user_id, item_id, created_at desc) where not archived;
create index ai_messages_quota_idx on public.ai_messages (user_id, created_at desc) where role = 'user';

-- ═══ row level security ═════════════════════════════════════════════════════
alter table public.app_settings    enable row level security;
alter table public.billing_plans   enable row level security;
alter table public.orders          enable row level security;
alter table public.subscriptions   enable row level security;
alter table public.payments        enable row level security;
alter table public.payment_events  enable row level security;
alter table public.ai_messages     enable row level security;

create policy billing_plans_select on public.billing_plans for select using (active or public.is_admin());
create policy orders_select on public.orders for select using (user_id = auth.uid() or public.is_admin());
create policy subscriptions_select on public.subscriptions for select using (user_id = auth.uid() or public.is_admin());
create policy payments_select on public.payments for select using (user_id = auth.uid() or public.is_admin());
create policy ai_messages_select on public.ai_messages for select using (user_id = auth.uid());
-- app_settings, payment_events: service role only
