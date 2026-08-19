-- Reelize schema v1 — run in Supabase Dashboard → SQL Editor.
-- Server talks to these tables with the secret key (bypasses RLS);
-- RLS is enabled with owner-read policies for future client-side reads.

create table if not exists accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  tokens integer not null default 0 check (tokens >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists token_transactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  delta integer not null,
  reason text not null, -- topup | job | refund
  job_id text,
  created_at timestamptz not null default now()
);

create table if not exists jobs (
  id text primary key, -- YouTube video id
  owner_id uuid references auth.users (id) on delete set null, -- null = legacy/public
  title text,
  status text not null default 'processing', -- processing | done | error
  clip_count integer not null default 0,
  elapsed_ms integer,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table accounts enable row level security;
alter table token_transactions enable row level security;
alter table jobs enable row level security;

create policy "own account" on accounts for select using (auth.uid() = user_id);
create policy "own transactions" on token_transactions for select using (auth.uid() = user_id);
create policy "own or public jobs" on jobs for select using (owner_id is null or auth.uid() = owner_id);
