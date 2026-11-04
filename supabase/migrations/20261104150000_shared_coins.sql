-- Public (multiplayer) coins: launched by players, seen and traded by every player.
-- Same bonding curve as the game: x*y=k on virtual reserves (30 SOL / 1.073B tokens),
-- 793.1M tokens sellable on the curve, then a pool. A simulated "crowd" trades each coin
-- lazily (caught up whenever someone reads or trades it), and panic-sells after a rug.
-- The browser can only read these tables; all writes go through the functions below.

create table public.shared_coins (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 32),
  ticker text not null check (ticker ~ '^[A-Z0-9]{1,10}$'),
  hue integer not null default 200,
  socials jsonb not null default '{"x":false,"tg":false,"web":false}',
  creator text not null references public.players(username) on update cascade,
  created_at timestamptz not null default now(),
  phase text not null default 'curve' check (phase in ('curve','graduated')),
  r_sol double precision not null default 30,
  r_tok double precision not null default 1073000000,
  tokens_sold double precision not null default 0,
  real_sol double precision not null default 0,
  crowd_tokens double precision not null default 0, -- held by simulated traders
  rugged_at timestamptz,
  last_tick timestamptz not null default now(),
  last_trade_at timestamptz not null default now(),
  ath_mcap_sol double precision not null default 0,
  volume_sol double precision not null default 0,
  buys integer not null default 0,
  sells integer not null default 0
);

create table public.shared_holdings (
  coin_id uuid not null references public.shared_coins(id) on delete cascade,
  username text not null references public.players(username) on update cascade,
  tokens double precision not null default 0 check (tokens >= 0),
  cost_sol double precision not null default 0,
  primary key (coin_id, username)
);

create table public.shared_trades (
  id bigint generated always as identity primary key,
  coin_id uuid not null references public.shared_coins(id) on delete cascade,
  at timestamptz not null default now(),
  username text, -- null = simulated crowd
  side text not null check (side in ('buy','sell')),
  sol double precision not null,
  tokens double precision not null,
  mcap_sol double precision not null
);
create index shared_trades_coin on public.shared_trades (coin_id, id);
create index shared_coins_recent on public.shared_coins (created_at desc);

alter table public.shared_coins enable row level security;
alter table public.shared_holdings enable row level security;
alter table public.shared_trades enable row level security;
create policy "Shared coins are public" on public.shared_coins for select to anon, authenticated using (true);
create policy "Shared holdings are public" on public.shared_holdings for select to anon, authenticated using (true);
create policy "Shared trades are public" on public.shared_trades for select to anon, authenticated using (true);

-- ---------- curve math on plain numbers (internal) ----------

create or replace function public._curve_buy(
  p_phase text, p_rsol double precision, p_rtok double precision, p_sold double precision, p_real double precision, p_net double precision,
  out phase text, out r_sol double precision, out r_tok double precision, out tokens_sold double precision,
  out real_sol double precision, out tokens_out double precision)
language plpgsql immutable set search_path = '' as $$
declare k double precision := p_rsol * p_rtok; lft double precision; px double precision; net double precision := p_net;
begin
  tokens_out := p_rtok - k / (p_rsol + net);
  if p_phase = 'curve' then
    lft := 793100000 - p_sold;
    if tokens_out > lft then
      tokens_out := greatest(0, lft);
      net := k / (p_rtok - tokens_out) - p_rsol;
    end if;
  end if;
  phase := p_phase;
  r_sol := p_rsol + net;
  r_tok := p_rtok - tokens_out;
  tokens_sold := p_sold + tokens_out;
  real_sol := p_real + net;
  if phase = 'curve' and tokens_sold >= 793100000 - 1 then
    px := r_sol / r_tok;
    phase := 'graduated';
    r_sol := real_sol;
    r_tok := real_sol / px;
  end if;
end $$;

create or replace function public._curve_sell(
  p_rsol double precision, p_rtok double precision, p_sold double precision, p_real double precision, p_tokens double precision,
  out r_sol double precision, out r_tok double precision, out tokens_sold double precision, out real_sol double precision,
  out gross double precision)
language plpgsql immutable set search_path = '' as $$
begin
  gross := p_rsol - (p_rsol * p_rtok) / (p_rtok + p_tokens);
  r_sol := p_rsol - gross;
  r_tok := p_rtok + p_tokens;
  tokens_sold := p_sold - p_tokens;
  real_sol := p_real - gross;
end $$;

-- Simulated crowd trading since the last tick: snipers at launch, interest that fades,
-- panic selling after a rug. Called (under a row lock) before every read or trade.
create or replace function public._shared_catch_up(c inout public.shared_coins)
language plpgsql set search_path = '' as $$
declare
  secs integer := least(600, floor(extract(epoch from (now() - c.last_tick)))::integer);
  t timestamptz; age double precision; rate double precision; pbuy double precision;
  n integer; sz double precision; toks double precision; g double precision; mc double precision;
begin
  if secs < 1 then return; end if;
  for i in 1..secs loop
    t := c.last_tick + make_interval(secs => i);
    age := extract(epoch from (t - c.created_at));
    if c.rugged_at is not null and t >= c.rugged_at then
      rate := 3 * exp(-extract(epoch from (t - c.rugged_at)) / 15);
      pbuy := 0.12;
    else
      rate := 1.2 * exp(-age / 400) + 0.04 + case when age < 3 then 2.5 else 0 end;
      pbuy := 0.56 - 0.12 * least(1, age / 600);
    end if;
    n := floor(rate)::integer + case when random() < rate - floor(rate) then 1 else 0 end;
    for j in 1..n loop
      if random() < pbuy then
        sz := 0.05 + power(random(), 2) * 1.2;
        select * into c.phase, c.r_sol, c.r_tok, c.tokens_sold, c.real_sol, toks
          from public._curve_buy(c.phase, c.r_sol, c.r_tok, c.tokens_sold, c.real_sol, sz * 0.99);
        if toks <= 0 then continue; end if;
        c.crowd_tokens := c.crowd_tokens + toks;
        c.buys := c.buys + 1;
        insert into public.shared_trades (coin_id, at, side, sol, tokens, mcap_sol)
          values (c.id, t, 'buy', sz, toks, c.r_sol / c.r_tok * 1e9);
      elsif c.crowd_tokens > 1 then
        toks := c.crowd_tokens * (0.1 + random() * 0.5);
        select * into c.r_sol, c.r_tok, c.tokens_sold, c.real_sol, g
          from public._curve_sell(c.r_sol, c.r_tok, c.tokens_sold, c.real_sol, toks);
        c.crowd_tokens := c.crowd_tokens - toks;
        c.sells := c.sells + 1;
        sz := g * 0.99;
        insert into public.shared_trades (coin_id, at, side, sol, tokens, mcap_sol)
          values (c.id, t, 'sell', sz, toks, c.r_sol / c.r_tok * 1e9);
      else
        continue;
      end if;
      c.volume_sol := c.volume_sol + sz;
      c.last_trade_at := t;
      mc := c.r_sol / c.r_tok * 1e9;
      if mc > c.ath_mcap_sol then c.ath_mcap_sol := mc; end if;
    end loop;
  end loop;
  c.last_tick := c.last_tick + make_interval(secs => secs);
  if now() - c.last_tick > interval '1 second' then c.last_tick := now(); end if; -- skip long idle gaps
end $$;

-- Persist a caught-up / traded coin row.
create or replace function public._shared_save(c public.shared_coins)
returns void language sql set search_path = '' as $$
  update public.shared_coins set
    r_sol = c.r_sol, r_tok = c.r_tok, tokens_sold = c.tokens_sold, real_sol = c.real_sol, phase = c.phase,
    crowd_tokens = c.crowd_tokens, rugged_at = c.rugged_at, last_tick = c.last_tick, last_trade_at = c.last_trade_at,
    ath_mcap_sol = c.ath_mcap_sol, volume_sol = c.volume_sol, buys = c.buys, sells = c.sells
  where id = c.id;
$$;

-- ---------- public API ----------

create or replace function public.launch_shared(
  p_username text, p_name text, p_ticker text, p_hue integer, p_socials jsonb, p_dev_buy_sol double precision
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c public.shared_coins; toks double precision := 0; uname text;
begin
  select username into uname from public.players where lower(username) = lower(p_username);
  if uname is null then raise exception 'Log in to launch a public coin'; end if;
  if p_dev_buy_sol is null or p_dev_buy_sol < 0 or p_dev_buy_sol > 100 then raise exception 'Invalid dev buy'; end if;
  if (select count(*) from public.shared_coins where creator = uname and created_at > now() - interval '1 minute') >= 3 then
    raise exception 'Slow down: max 3 public launches per minute';
  end if;
  insert into public.shared_coins (name, ticker, hue, socials, creator)
    values (trim(p_name), upper(trim(p_ticker)), p_hue, coalesce(p_socials, '{}'), uname)
    returning * into c;
  if p_dev_buy_sol > 0 then
    select * into c.phase, c.r_sol, c.r_tok, c.tokens_sold, c.real_sol, toks
      from public._curve_buy(c.phase, c.r_sol, c.r_tok, c.tokens_sold, c.real_sol, p_dev_buy_sol * 0.99);
    insert into public.shared_holdings (coin_id, username, tokens, cost_sol) values (c.id, uname, toks, p_dev_buy_sol);
    insert into public.shared_trades (coin_id, username, side, sol, tokens, mcap_sol)
      values (c.id, uname, 'buy', p_dev_buy_sol, toks, c.r_sol / c.r_tok * 1e9);
    c.buys := 1;
    c.volume_sol := p_dev_buy_sol;
  end if;
  c.ath_mcap_sol := c.r_sol / c.r_tok * 1e9;
  perform public._shared_save(c);
  return jsonb_build_object('id', c.id, 'tokens', toks, 'sol', p_dev_buy_sol, 'mcap_sol', c.r_sol / c.r_tok * 1e9);
end $$;

-- Buy (p_amount = SOL) or sell (p_amount = tokens). 2% total fees (curve + platform), like the game.
create or replace function public.trade_shared(
  p_username text, p_coin uuid, p_side text, p_amount double precision, p_min_out double precision
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.shared_coins; h public.shared_holdings; uname text;
  toks double precision; g double precision := 0; outv double precision; before_tokens double precision;
  rug boolean := false;
begin
  select username into uname from public.players where lower(username) = lower(p_username);
  if uname is null then raise exception 'Log in to trade public coins'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount'; end if;
  select * into c from public.shared_coins where id = p_coin for update;
  if not found then raise exception 'Coin not found'; end if;
  c := public._shared_catch_up(c);

  if p_side = 'buy' then
    if p_amount > 1000 then raise exception 'Max 1000 SOL per buy'; end if;
    select * into c.phase, c.r_sol, c.r_tok, c.tokens_sold, c.real_sol, toks
      from public._curve_buy(c.phase, c.r_sol, c.r_tok, c.tokens_sold, c.real_sol, p_amount * 0.98);
    if toks <= 0 then raise exception 'Nothing left to buy'; end if;
    if toks < coalesce(p_min_out, 0) then raise exception 'Slippage exceeded'; end if;
    insert into public.shared_holdings as sh (coin_id, username, tokens, cost_sol) values (c.id, uname, toks, p_amount)
      on conflict (coin_id, username) do update set tokens = sh.tokens + excluded.tokens, cost_sol = sh.cost_sol + excluded.cost_sol;
    outv := p_amount;
    c.buys := c.buys + 1;
  elsif p_side = 'sell' then
    select * into h from public.shared_holdings where coin_id = c.id and username = uname for update;
    if not found or h.tokens <= 0 then raise exception 'Nothing to sell'; end if;
    before_tokens := h.tokens;
    toks := least(p_amount, h.tokens);
    select * into c.r_sol, c.r_tok, c.tokens_sold, c.real_sol, g
      from public._curve_sell(c.r_sol, c.r_tok, c.tokens_sold, c.real_sol, toks);
    outv := g * 0.98;
    if outv < coalesce(p_min_out, 0) then raise exception 'Slippage exceeded'; end if;
    update public.shared_holdings set tokens = greatest(0, tokens - toks),
      cost_sol = cost_sol * (1 - toks / before_tokens) where coin_id = c.id and username = uname;
    -- the creator dumping half or more of their bag is a rug: the crowd panics
    if uname = c.creator and c.rugged_at is null and toks >= 0.5 * before_tokens then
      c.rugged_at := now();
      rug := true;
    end if;
    c.sells := c.sells + 1;
  else
    raise exception 'Invalid side';
  end if;

  insert into public.shared_trades (coin_id, username, side, sol, tokens, mcap_sol)
    values (c.id, uname, p_side, outv, toks, c.r_sol / c.r_tok * 1e9);
  c.volume_sol := c.volume_sol + outv;
  c.last_trade_at := now();
  c.ath_mcap_sol := greatest(c.ath_mcap_sol, c.r_sol / c.r_tok * 1e9);
  perform public._shared_save(c);
  return jsonb_build_object('tokens', toks, 'sol', outv,
    'fee', case when p_side = 'buy' then p_amount * 0.02 else g * 0.02 end,
    'mcap_sol', c.r_sol / c.r_tok * 1e9, 'rug', rug);
end $$;

-- Followers of a player who shilled a public coin ape in (server side, so everyone sees it).
create or replace function public.hype_shared(p_username text, p_coin uuid, p_buyers integer)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.shared_coins; toks double precision; sz double precision;
begin
  if not exists (select 1 from public.players where lower(username) = lower(p_username)) then return; end if;
  select * into c from public.shared_coins where id = p_coin for update;
  if not found or c.rugged_at is not null then return; end if;
  c := public._shared_catch_up(c);
  for f in 1..least(greatest(p_buyers, 0), 200) loop
    sz := 0.05 + power(random(), 2) * 0.6;
    select * into c.phase, c.r_sol, c.r_tok, c.tokens_sold, c.real_sol, toks
      from public._curve_buy(c.phase, c.r_sol, c.r_tok, c.tokens_sold, c.real_sol, sz * 0.99);
    exit when toks <= 0;
    c.crowd_tokens := c.crowd_tokens + toks;
    c.buys := c.buys + 1;
    c.volume_sol := c.volume_sol + sz;
    insert into public.shared_trades (coin_id, side, sol, tokens, mcap_sol) values (c.id, 'buy', sz, toks, c.r_sol / c.r_tok * 1e9);
  end loop;
  c.last_trade_at := now();
  c.ath_mcap_sol := greatest(c.ath_mcap_sol, c.r_sol / c.r_tok * 1e9);
  perform public._shared_save(c);
end $$;

-- Everything a client needs to mirror the shared market: recent coins, caught up to now.
create or replace function public.shared_market()
returns setof public.shared_coins
language plpgsql security definer set search_path = '' as $$
declare c public.shared_coins;
begin
  for c in select * from public.shared_coins
    where created_at > now() - interval '6 hours' and last_tick < now() - interval '1 second'
    order by created_at desc for update skip locked loop
    c := public._shared_catch_up(c);
    perform public._shared_save(c);
  end loop;
  return query select * from public.shared_coins where created_at > now() - interval '6 hours' order by created_at desc limit 100;
end $$;

revoke all on function public._curve_buy(text, double precision, double precision, double precision, double precision, double precision) from public, anon, authenticated;
revoke all on function public._curve_sell(double precision, double precision, double precision, double precision, double precision) from public, anon, authenticated;
revoke all on function public._shared_catch_up(public.shared_coins) from public, anon, authenticated;
revoke all on function public._shared_save(public.shared_coins) from public, anon, authenticated;
revoke all on function public.launch_shared(text, text, text, integer, jsonb, double precision) from public;
revoke all on function public.trade_shared(text, uuid, text, double precision, double precision) from public;
revoke all on function public.hype_shared(text, uuid, integer) from public;
revoke all on function public.shared_market() from public;
grant execute on function public.launch_shared(text, text, text, integer, jsonb, double precision) to anon, authenticated;
grant execute on function public.trade_shared(text, uuid, text, double precision, double precision) to anon, authenticated;
grant execute on function public.hype_shared(text, uuid, integer) to anon, authenticated;
grant execute on function public.shared_market() to anon, authenticated;
