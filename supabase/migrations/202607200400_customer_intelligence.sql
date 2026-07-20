-- Phase 2: Customer Intelligence.
--
-- Extends customer health with relationship, community and referral signals,
-- and infers taste preferences from recorded order history rather than
-- requiring staff to type them in.

alter table public.customer_health
    add column if not exists relationship_score numeric(5,2) not null default 0;

alter table public.customer_health
    add column if not exists community_score numeric(5,2) not null default 0;

alter table public.customer_health
    add column if not exists referral_score numeric(5,2) not null default 0;

alter table public.customer_health
    add column if not exists referral_count integer not null default 0;

alter table public.customer_health
    add column if not exists referred_revenue numeric(12,2) not null default 0;

create index if not exists customer_health_relationship_idx
on public.customer_health(relationship_score desc);


-- Every item a guest has ordered, from either the manual visit_items ledger or
-- the POS-sourced order_items ledger, unified and ranked by how often it
-- appears. This is the factual basis for "their usual".
create or replace view public.customer_item_history as
select
    v.person_id,
    lower(trim(items.item_name)) as item_key,
    min(trim(items.item_name)) as item_name,
    max(items.category) as category,
    sum(items.quantity)::numeric(12,2) as total_quantity,
    count(distinct v.id)::integer as visit_count,
    max(v.visited_at) as last_ordered_at
from public.visits v
join (
    select visit_id, item_name, category, quantity
    from public.visit_items
    union all
    select visit_id, item_name, category, quantity
    from public.order_items
) items on items.visit_id = v.id
where v.person_id is not null
  and trim(items.item_name) <> ''
group by v.person_id, lower(trim(items.item_name));


-- A guest's inferred taste profile: their most-ordered drinks and food, with
-- the evidence behind each so staff can see why the CRM believes it.
create or replace function public.customer_taste_profile(target_person_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
    with ranked as (
        select
            item_name,
            category,
            visit_count,
            total_quantity,
            last_ordered_at,
            case
                when lower(coalesce(category, '')) in ('drink', 'drinks', 'beverage', 'beverages', 'coffee', 'tea')
                    then 'drink'
                when lower(coalesce(category, '')) in ('food', 'bakery', 'dessert', 'desserts', 'snack', 'snacks', 'meal', 'meals')
                    then 'food'
                else 'other'
            end as kind,
            row_number() over (
                partition by case
                    when lower(coalesce(category, '')) in ('drink', 'drinks', 'beverage', 'beverages', 'coffee', 'tea')
                        then 'drink'
                    when lower(coalesce(category, '')) in ('food', 'bakery', 'dessert', 'desserts', 'snack', 'snacks', 'meal', 'meals')
                        then 'food'
                    else 'other'
                end
                order by visit_count desc, total_quantity desc, last_ordered_at desc
            ) as rank
        from public.customer_item_history
        where person_id = target_person_id
    )
    select coalesce(
        jsonb_object_agg(kind, entries),
        '{}'::jsonb
    )
    from (
        select
            kind,
            jsonb_agg(
                jsonb_build_object(
                    'item_name', item_name,
                    'category', category,
                    'visit_count', visit_count,
                    'total_quantity', total_quantity,
                    'last_ordered_at', last_ordered_at
                )
                order by rank
            ) as entries
        from ranked
        where rank <= 3
        group by kind
    ) grouped;
$$;


-- Recalculates the full health picture for one guest, or for everyone when
-- called with null. Extends the Phase 1 scoring with the relationship signals
-- that tell staff who matters to the room, not just who spends.
create or replace function public.recalculate_customer_health(target_person_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer := 0;
begin
  with visit_stats as (
    select
      p.id as person_id,
      count(v.id) as visit_count,
      coalesce(sum(v.net_amount), 0) as total_spend,
      max(v.visited_at) as last_visit_at,
      min(v.visited_at) as first_visit_at,
      trim(to_char(mode() within group (order by extract(dow from v.visited_at)), '9')) as preferred_day,
      to_char(mode() within group (order by date_trunc('hour', v.visited_at)), 'HH24:MI') as preferred_time,
      coalesce(max(la.lifetime_points), 0) as lifetime_points
    from public.people p
    left join public.visits v on v.person_id = p.id
    left join public.loyalty_accounts la on la.person_id = p.id
    where p.is_active = true
      and (target_person_id is null or p.id = target_person_id)
    group by p.id
  ),
  relationship_stats as (
    select
      s.person_id,
      (select count(*) from public.person_relationships r
        where r.person_id = s.person_id or r.related_person_id = s.person_id) as relationship_count,
      (select count(*) from public.customer_milestones m
        where m.person_id = s.person_id) as milestone_count,
      (select count(*) from public.community_memberships cm
        where cm.person_id = s.person_id and cm.left_at is null) as community_count,
      (select count(*) from public.event_registrations er
        where er.person_id = s.person_id) as event_count,
      (select count(*) from public.referrals rf
        where rf.referrer_person_id = s.person_id) as referral_count,
      (select coalesce(sum(v2.net_amount), 0)
        from public.referrals rf
        join public.visits v2 on v2.person_id = rf.referred_person_id
        where rf.referrer_person_id = s.person_id) as referred_revenue
    from visit_stats s
  ),
  scored as (
    select
      vs.person_id,
      case
        when vs.last_visit_at is null then 0
        when vs.last_visit_at >= now() - interval '14 days' then 100
        when vs.last_visit_at >= now() - interval '30 days' then 80
        when vs.last_visit_at >= now() - interval '60 days' then 55
        when vs.last_visit_at >= now() - interval '90 days' then 35
        else 15
      end as recency_score,
      least(vs.visit_count * 8, 100) as frequency_score,
      least(vs.total_spend / 50, 100) as monetary_score,
      least(vs.visit_count * 10, 100) as engagement_score,
      least(vs.lifetime_points / 10, 100) as loyalty_score,
      least(rs.community_count * 20 + rs.event_count * 10, 100) as community_score,
      least(rs.referral_count * 25 + rs.referred_revenue / 100, 100) as referral_score,
      least(
        vs.visit_count * 4
        + rs.referral_count * 12
        + rs.community_count * 8
        + rs.event_count * 5
        + rs.milestone_count * 4
        + rs.relationship_count * 6,
        100
      ) as relationship_score,
      case
        when vs.last_visit_at is null then 90
        when vs.last_visit_at < now() - interval '90 days' then 90
        when vs.last_visit_at < now() - interval '60 days' then 70
        when vs.last_visit_at < now() - interval '30 days' then 45
        else 15
      end as churn_risk,
      vs.total_spend,
      case when vs.visit_count = 0 then 0 else vs.total_spend / vs.visit_count end as average_ticket,
      vs.visit_count,
      vs.last_visit_at,
      vs.first_visit_at,
      vs.preferred_day,
      vs.preferred_time,
      rs.referral_count,
      rs.referred_revenue
    from visit_stats vs
    join relationship_stats rs on rs.person_id = vs.person_id
  )
  insert into public.customer_health (
    person_id,
    health_score,
    engagement_score,
    loyalty_score,
    recency_score,
    frequency_score,
    monetary_score,
    relationship_score,
    community_score,
    referral_score,
    referral_count,
    referred_revenue,
    churn_risk,
    lifetime_value,
    average_ticket,
    total_visits,
    last_visit_at,
    first_visit_at,
    preferred_visit_day,
    preferred_visit_time,
    calculated_at
  )
  select
    person_id,
    greatest(
      0,
      least(
        100,
        case when last_visit_at is null then 25 else recency_score end * 0.40
        + frequency_score * 0.25
        + monetary_score * 0.20
        + relationship_score * 0.15
      )
    ),
    engagement_score,
    loyalty_score,
    recency_score,
    frequency_score,
    monetary_score,
    relationship_score,
    community_score,
    referral_score,
    referral_count::integer,
    referred_revenue,
    -- A guest deeply woven into the café's communities is less likely to drift
    -- away than their visit gap alone suggests.
    greatest(0, churn_risk - least(relationship_score * 0.3, 30)),
    total_spend,
    average_ticket,
    visit_count::integer,
    last_visit_at,
    first_visit_at,
    preferred_day,
    preferred_time,
    now()
  from scored
  on conflict (person_id) do update set
    health_score = excluded.health_score,
    engagement_score = excluded.engagement_score,
    loyalty_score = excluded.loyalty_score,
    recency_score = excluded.recency_score,
    frequency_score = excluded.frequency_score,
    monetary_score = excluded.monetary_score,
    relationship_score = excluded.relationship_score,
    community_score = excluded.community_score,
    referral_score = excluded.referral_score,
    referral_count = excluded.referral_count,
    referred_revenue = excluded.referred_revenue,
    churn_risk = excluded.churn_risk,
    lifetime_value = excluded.lifetime_value,
    average_ticket = excluded.average_ticket,
    total_visits = excluded.total_visits,
    last_visit_at = excluded.last_visit_at,
    first_visit_at = excluded.first_visit_at,
    preferred_visit_day = excluded.preferred_visit_day,
    preferred_visit_time = excluded.preferred_visit_time,
    calculated_at = now();

  get diagnostics affected = row_count;

  insert into public.customer_health_history (
    person_id,
    health_score,
    engagement_score,
    churn_risk,
    lifetime_value,
    calculated_at
  )
  select
    person_id,
    health_score,
    engagement_score,
    churn_risk,
    lifetime_value,
    calculated_at
  from public.customer_health
  where target_person_id is null or person_id = target_person_id;

  return affected;
end;
$$;


-- Order history changes the inferred taste profile and the spend signals, so
-- health is refreshed when items move as well as when visits do.
create or replace function public.refresh_customer_health_after_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
begin
  select v.person_id into target_id
  from public.visits v
  where v.id = coalesce(new.visit_id, old.visit_id);

  if target_id is not null then
    perform public.recalculate_customer_health(target_id);
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists visit_items_refresh_customer_health on public.visit_items;

create trigger visit_items_refresh_customer_health
after insert or update or delete
on public.visit_items
for each row
execute function public.refresh_customer_health_after_item();

drop trigger if exists order_items_refresh_customer_health on public.order_items;

create trigger order_items_refresh_customer_health
after insert or update or delete
on public.order_items
for each row
execute function public.refresh_customer_health_after_item();

grant select on public.customer_item_history to authenticated;

select public.recalculate_customer_health(null);

notify pgrst, 'reload schema';
