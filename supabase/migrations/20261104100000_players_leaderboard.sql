-- Leaderboard for tijeen.trade. Applied to the Supabase project "tijeentrade".
-- No passwords by design: a username is the whole account. The browser may only
-- read the table; all writes go through the two validated functions below.

create table public.players (
  username text primary key check (username ~ '^[A-Za-z0-9_]{3,16}$'),
  created_at timestamptz not null default now(),
  run_started_at timestamptz,
  start_sol numeric check (start_sol > 0 and start_sol <= 1000000),
  equity_sol numeric check (equity_sol >= 0),
  return_pct numeric,
  closed_trades integer not null default 0 check (closed_trades >= 0),
  wins integer not null default 0 check (wins >= 0 and wins <= closed_trades),
  updated_at timestamptz
);

create unique index players_username_lower on public.players (lower(username));
create index players_ranking on public.players (return_pct desc) where closed_trades >= 5;

alter table public.players enable row level security;

-- Everyone may read the leaderboard; nobody writes directly (only via the functions below).
create policy "Leaderboard is public" on public.players
  for select to anon, authenticated using (true);

-- Create the player, or "log in" if the name exists (no passwords by design).
create or replace function public.join_player(p_username text)
returns public.players
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.players;
begin
  if p_username is null or p_username !~ '^[A-Za-z0-9_]{3,16}$' then
    raise exception 'Username must be 3-16 letters, numbers or _';
  end if;
  select * into r from public.players where lower(username) = lower(p_username);
  if found then
    return r;
  end if;
  insert into public.players (username) values (p_username) returning * into r;
  return r;
end;
$$;

-- Report the current run. The return % is computed here, not trusted from the client.
create or replace function public.submit_score(
  p_username text,
  p_run_started_at timestamptz,
  p_start_sol numeric,
  p_equity_sol numeric,
  p_closed_trades integer,
  p_wins integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_start_sol is null or p_start_sol <= 0 or p_start_sol > 1000000 then
    raise exception 'Invalid starting balance';
  end if;
  if p_equity_sol is null or p_equity_sol < 0 or p_equity_sol > 1e12 then
    raise exception 'Invalid equity';
  end if;
  if p_closed_trades is null or p_closed_trades < 0 or p_wins is null or p_wins < 0 or p_wins > p_closed_trades then
    raise exception 'Invalid trade counts';
  end if;
  if p_run_started_at is null or p_run_started_at > now() + interval '5 minutes' then
    raise exception 'Invalid run start';
  end if;

  update public.players set
    run_started_at = p_run_started_at,
    start_sol = p_start_sol,
    equity_sol = p_equity_sol,
    return_pct = round((p_equity_sol / p_start_sol - 1) * 100, 4),
    closed_trades = p_closed_trades,
    wins = p_wins,
    updated_at = now()
  where lower(username) = lower(p_username);

  if not found then
    raise exception 'Unknown player';
  end if;
end;
$$;

revoke all on function public.join_player(text) from public;
revoke all on function public.submit_score(text, timestamptz, numeric, numeric, integer, integer) from public;
grant execute on function public.join_player(text) to anon, authenticated;
grant execute on function public.submit_score(text, timestamptz, numeric, numeric, integer, integer) to anon, authenticated;
