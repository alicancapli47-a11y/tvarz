-- ══ TVARZ DATABASE SCHEMA ══
-- Run this in Supabase SQL Editor

-- USERS
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  google_id text unique not null,
  email text unique not null,
  name text,
  avatar text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- SUBSCRIPTIONS
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  lemonsqueezy_id text unique,
  status text not null default 'inactive', -- active, cancelled, expired, inactive
  plan text default 'premium',
  trial_ends_at timestamptz,
  renews_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- VIDEOS
create table if not exists videos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  youtube_id text,           -- YouTube video ID (unlisted)
  youtube_playlist_id text,  -- For channel playlists
  thumbnail_url text,
  duration text,             -- "10:12"
  category text not null,    -- film, doc, series, short
  is_premium boolean default false,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- PROGRAMS (daily schedule)
create table if not exists programs (
  id uuid primary key default gen_random_uuid(),
  video_id uuid references videos(id) on delete cascade,
  program_date date not null,
  start_time time not null,
  end_time time,
  channel text default 'main',  -- main, thriller, scifi, turkish, documentary
  created_at timestamptz default now()
);

-- INDEXES
create index if not exists idx_programs_date on programs(program_date);
create index if not exists idx_programs_channel on programs(channel);
create index if not exists idx_videos_category on videos(category);
create index if not exists idx_subscriptions_user on subscriptions(user_id);
create index if not exists idx_subscriptions_status on subscriptions(status);

-- ══ SEED DATA — Sample Videos ══
insert into videos (title, description, youtube_id, duration, category, is_premium, thumbnail_url) values
  ('Giant Creatures Lurking Deep in the Amazon Jungle', 'An AI cinematic thriller set deep in the Amazon jungle.', 'dQw4w9WgXcQ', '10:12', 'film', false, null),
  ('When the Huge Giants Returned', 'Seedance 2.0 powered thriller — giants return to civilization.', 'dQw4w9WgXcQ', '8:14', 'film', false, null),
  ('Monsters Destroy Everything', 'Post-apocalyptic AI concept film — 52 minutes of pure destruction.', 'dQw4w9WgXcQ', '52:30', 'film', true, null),
  ('Amazon Black', 'A terrifying mystery set in the heart of the Amazon.', 'dQw4w9WgXcQ', '5:01', 'film', true, null),
  ('Giants in Berlin City', 'Dystopian short film — giants have taken over Berlin.', 'dQw4w9WgXcQ', '10:06', 'film', true, null),
  ('Cowboy Finds a Laser Gun', 'A western short with a futuristic twist.', 'dQw4w9WgXcQ', '8:11', 'short', false, null),
  ('Mountain Rescue: Man Saves Ibex', 'A dramatic short about a mountain rescue.', 'dQw4w9WgXcQ', '9:45', 'short', false, null),
  ('AI Action Concept — Seedance 2.0', 'Action scenes that look like movies.', 'dQw4w9WgXcQ', '2:46', 'short', false, null),
  ('The Collapse of Silicon Valley Bank', 'Financial documentary — the story behind the collapse.', 'dQw4w9WgXcQ', '18:00', 'doc', true, null),
  ('Nixon Shock: The Gold Standard Falls', 'BeforeTheCrash — the 1971 monetary revolution.', 'dQw4w9WgXcQ', '22:00', 'doc', true, null),
  ('Juliane Koepcke: Sole Survivor', 'The story of the only survivor of LANSA Flight 508.', 'dQw4w9WgXcQ', '24:00', 'film', true, null),
  ('D.B. Cooper: Into the Night', 'The unsolved hijacking mystery — Fincher style.', 'dQw4w9WgXcQ', '17:00', 'doc', true, null)
on conflict do nothing;

-- ══ ROW LEVEL SECURITY ══
alter table users enable row level security;
alter table subscriptions enable row level security;
alter table videos enable row level security;
alter table programs enable row level security;

-- Videos are public readable
create policy "Videos are public" on videos for select using (true);
create policy "Programs are public" on programs for select using (true);

-- Users can only read their own data
create policy "Users read own" on users for select using (auth.uid()::text = google_id);
create policy "Subscriptions read own" on subscriptions for select using (
  user_id in (select id from users where google_id = auth.uid()::text)
);
