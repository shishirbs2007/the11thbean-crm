-- Phase 5: campaign lifecycle, automations and hospitality outcomes.
--
-- A campaign cannot leave draft until somebody has written down why this
-- guest, why now, why this message, and what outcome the café hopes for. That
-- is not paperwork: it is the difference between hospitality and spam.

alter table public.communication_campaigns
    add column if not exists audience_id uuid
        references public.audiences(id) on delete set null;

alter table public.communication_campaigns
    add column if not exists purpose text not null default 'marketing';

alter table public.communication_campaigns
    add column if not exists rationale_why_them text;

alter table public.communication_campaigns
    add column if not exists rationale_why_now text;

alter table public.communication_campaigns
    add column if not exists rationale_why_message text;

alter table public.communication_campaigns
    add column if not exists hoped_outcome text;

alter table public.communication_campaigns
    add column if not exists approved_by uuid
        references auth.users(id) on delete set null;

alter table public.communication_campaigns
    add column if not exists approved_at timestamptz;

alter table public.communication_campaigns
    add column if not exists audience_snapshot jsonb not null default '{}'::jsonb;

-- Review and approval sit between draft and scheduling.
alter table public.communication_campaigns
    drop constraint if exists communication_campaigns_status_check;

alter table public.communication_campaigns
    add constraint communication_campaigns_status_check
    check (status in (
        'draft', 'review', 'approved', 'scheduled',
        'running', 'paused', 'completed', 'cancelled'
    ));

create index if not exists communication_campaigns_status_idx
on public.communication_campaigns(status, scheduled_at);


-- Moves a campaign along its lifecycle, refusing transitions that would let
-- an unexplained or unapproved message reach a guest.
create or replace function public.advance_campaign_status(
    target_campaign_id uuid,
    next_status text,
    actor uuid default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  campaign public.communication_campaigns;
begin
  select * into campaign
  from public.communication_campaigns
  where id = target_campaign_id;

  if campaign.id is null then
    raise exception 'Campaign % does not exist', target_campaign_id;
  end if;

  if next_status = 'review' then
    if coalesce(campaign.rationale_why_them, '') = ''
       or coalesce(campaign.rationale_why_now, '') = ''
       or coalesce(campaign.rationale_why_message, '') = ''
       or coalesce(campaign.hoped_outcome, '') = '' then
      raise exception 'Say why this guest, why now, why this message and what outcome you hope for before sending it for review';
    end if;

    if campaign.audience_id is null then
      raise exception 'Choose an audience before sending this campaign for review';
    end if;
  end if;

  if next_status = 'approved' and campaign.status <> 'review' then
    raise exception 'Only a campaign in review can be approved';
  end if;

  if next_status = 'scheduled' and campaign.status <> 'approved' then
    raise exception 'Only an approved campaign can be scheduled';
  end if;

  update public.communication_campaigns
  set status = next_status,
      approved_by = case when next_status = 'approved' then actor else approved_by end,
      approved_at = case when next_status = 'approved' then now() else approved_at end,
      -- The audience is captured at approval, so results are measured against
      -- who was actually chosen rather than who would match today.
      audience_snapshot = case
        when next_status = 'approved' and campaign.audience_id is not null then
          coalesce(
            (
              select public.explain_audience(a.rules, a.match_mode, a.channel, a.purpose)
              from public.audiences a
              where a.id = campaign.audience_id
            ),
            audience_snapshot
          )
        else audience_snapshot
      end,
      updated_at = now()
  where id = target_campaign_id;

  return next_status;
end;
$$;


-- Everything the café sends or receives lands on the guest's one timeline.
-- There is no separate communication history to go and look at.
create or replace function public.record_communication_on_timeline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  campaign_name text;
  entry_title text;
begin
  if new.person_id is null then
    return new;
  end if;

  select name into campaign_name
  from public.communication_campaigns
  where id = new.campaign_id;

  entry_title := case new.direction
    when 'inbound' then 'Replied on ' || new.channel
    else coalesce('Sent ' || campaign_name, 'Message sent on ' || new.channel)
  end;

  insert into public.timeline_entries (
    person_id, event_type, title, summary, occurred_at, source_type, source_id
  )
  values (
    new.person_id,
    'communication',
    entry_title,
    coalesce(new.subject, left(coalesce(new.body_text, ''), 140)),
    coalesce(new.created_at, now()),
    'system',
    new.id
  );

  return new;
end;
$$;

drop trigger if exists communication_messages_timeline
on public.communication_messages;

create trigger communication_messages_timeline
after insert on public.communication_messages
for each row
execute function public.record_communication_on_timeline();


-- Delivery outcomes worth a guest's timeline. An open is noise; a click, a
-- reply or an unsubscribe tells staff something about the relationship.
create or replace function public.record_delivery_on_timeline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_person uuid;
begin
  if new.event_type not in ('clicked', 'replied', 'unsubscribed', 'bounced') then
    return new;
  end if;

  select person_id into target_person
  from public.communication_messages
  where id = new.message_id;

  if target_person is null then
    return new;
  end if;

  insert into public.timeline_entries (
    person_id, event_type, title, summary, occurred_at, source_type, source_id
  )
  values (
    target_person,
    'communication',
    initcap(new.event_type) || ' a message',
    'Recorded from ' || coalesce(new.provider, 'the messaging provider') || '.',
    coalesce(new.event_at, now()),
    'system',
    new.message_id
  );

  return new;
end;
$$;

drop trigger if exists communication_delivery_events_timeline
on public.communication_delivery_events;

create trigger communication_delivery_events_timeline
after insert on public.communication_delivery_events
for each row
execute function public.record_delivery_on_timeline();


-- Hospitality automations. Always editable, always explainable: each one says
-- in plain words when it fires and why it exists.
create table if not exists public.hospitality_automations (
    id uuid primary key default gen_random_uuid(),
    key text not null unique,
    name text not null,
    explanation text not null,
    trigger_type text not null
        check (trigger_type in (
            'birthday', 'anniversary', 'after_event', 'first_visit',
            'lapsed', 'favourite_item_available', 'community_invitation',
            'workshop_reminder', 'service_recovery'
        )),
    channel text not null default 'internal'
        check (channel in ('email', 'whatsapp', 'sms', 'push', 'internal')),
    purpose text not null default 'hospitality'
        references public.consent_purposes(key),
    template_id uuid references public.communication_templates(id) on delete set null,
    delay_days integer not null default 0,
    is_active boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.hospitality_automations enable row level security;

drop policy if exists hospitality_automations_staff_read
on public.hospitality_automations;

create policy hospitality_automations_staff_read
on public.hospitality_automations
for select
to authenticated
using (true);

drop policy if exists hospitality_automations_manager_write
on public.hospitality_automations;

create policy hospitality_automations_manager_write
on public.hospitality_automations
for all
to authenticated
using (public.current_app_role() in ('manager', 'admin'))
with check (public.current_app_role() in ('manager', 'admin'));

-- Shipped switched off. A café should turn on automation deliberately, having
-- read what it will do.
insert into public.hospitality_automations
    (key, name, explanation, trigger_type, channel, purpose, delay_days)
values
    ('birthday_greeting', 'Birthday greeting',
     'On a guest''s birthday, remind staff to wish them in person.',
     'birthday', 'internal', 'hospitality', 0),
    ('anniversary_greeting', 'Anniversary greeting',
     'On a recorded anniversary, remind staff to mark it warmly.',
     'anniversary', 'internal', 'hospitality', 0),
    ('thank_you_after_event', 'Thank-you after an event',
     'The day after an event, thank the guests who came.',
     'after_event', 'internal', 'hospitality', 1),
    ('welcome_first_visit', 'Welcome after a first visit',
     'A few days after someone''s first visit, learn their usual.',
     'first_visit', 'internal', 'hospitality', 3),
    ('we_miss_you', 'We miss you',
     'When a regular drifts past their own usual gap, reconnect personally.',
     'lapsed', 'internal', 'hospitality', 0),
    ('favourite_back_in_stock', 'Favourite coffee back in stock',
     'Tell the guests who order it that their coffee has returned.',
     'favourite_item_available', 'email', 'marketing', 0),
    ('community_invitation', 'Community invitation',
     'Invite a community''s members when it schedules an event.',
     'community_invitation', 'email', 'event_invitations', 0),
    ('workshop_reminder', 'Workshop reminder',
     'Remind registered guests the day before a workshop.',
     'workshop_reminder', 'email', 'event_invitations', 1),
    ('service_recovery_followup', 'Service recovery follow-up',
     'After something went wrong, check the guest is happy again.',
     'service_recovery', 'internal', 'hospitality', 2)
on conflict (key) do update set
    name = excluded.name,
    explanation = excluded.explanation;


-- Hospitality outcomes, not open rates.
--
-- Measures whether people the café contacted actually came back, came to
-- something, or grew closer to the place.
create or replace view public.campaign_outcomes as
select
    c.id as campaign_id,
    c.name,
    c.status,
    c.started_at,
    count(distinct r.person_id)::integer as reached,
    count(distinct r.person_id) filter (
        where r.status in ('delivered', 'read', 'clicked')
    )::integer as delivered,
    count(distinct r.person_id) filter (
        where exists (
            select 1 from public.visits v
            where v.person_id = r.person_id
              and c.started_at is not null
              and v.visited_at between c.started_at and c.started_at + interval '30 days'
        )
    )::integer as visits_generated,
    count(distinct r.person_id) filter (
        where exists (
            select 1
            from public.event_registrations er
            join public.events e on e.id = er.event_id
            where er.person_id = r.person_id
              and er.status = 'attended'
              and c.started_at is not null
              and e.starts_at between c.started_at and c.started_at + interval '60 days'
        )
    )::integer as event_attendance,
    count(distinct r.person_id) filter (
        where exists (
            select 1 from public.referrals rf
            where rf.referrer_person_id = r.person_id
              and c.started_at is not null
              and rf.referred_at >= c.started_at
        )
    )::integer as referrals_generated
from public.communication_campaigns c
left join public.communication_recipients r on r.campaign_id = c.id
group by c.id;

grant select on public.campaign_outcomes to authenticated;
grant select on public.hospitality_automations to authenticated;

notify pgrst, 'reload schema';
