-- Tell staff somebody is new while they are still standing there.
--
-- arrival_context is rendered after record_arrival has already written the
-- visit, so total_visits was never 0 by the time the counter card appeared and
-- a first-time guest was never flagged as one. That is the single moment the
-- flag is worth anything.
--
-- Their first arrival now counts as their first visit, which is what a person
-- behind the counter means by the phrase.

create or replace function public.arrival_context(target_person_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
    select jsonb_build_object(
        'person_id', p.id,
        'name', coalesce(p.preferred_name, p.first_name)
            || coalesce(' ' || p.last_name, ''),
        'greeting_name', coalesce(p.preferred_name, p.first_name),
        'allergies', coalesce(hp.allergies, array[]::text[]),
        'dietary', coalesce(hp.dietary_restrictions, array[]::text[]),
        'usual_drink', coalesce(
            (
                select i.item_name
                from public.customer_item_history i
                where i.person_id = p.id
                  and i.visit_count > 1
                  and lower(coalesce(i.category, '')) in
                      ('coffee', 'tea', 'drink', 'drinks', 'beverage', 'beverages')
                order by i.visit_count desc, i.last_ordered_at desc
                limit 1
            ),
            nullif(hp.coffee_preferences->>'drink', '')
        ),
        'usual_food', (
            select i.item_name
            from public.customer_item_history i
            where i.person_id = p.id
              and i.visit_count > 1
              and lower(coalesce(i.category, '')) in
                  ('food', 'bakery', 'dessert', 'desserts', 'snack', 'snacks')
            order by i.visit_count desc, i.last_ordered_at desc
            limit 1
        ),
        'seating', (
            select cp.preference_value
            from public.customer_preferences cp
            where cp.person_id = p.id and cp.preference_type = 'seating'
            limit 1
        ),
        'total_visits', coalesce(h.total_visits, 0),
        'last_visit_at', h.last_visit_at,
        'days_since_visit', case
            when h.last_visit_at is null then null
            else extract(day from (now() - h.last_visit_at))::integer
        end,
        -- One visit means the one just recorded: they are new.
        'is_first_visit', coalesce(h.total_visits, 0) <= 1,
        'staff_summary', hp.staff_summary,
        'communities', coalesce(
            (
                select array_agg(c.name order by c.name)
                from public.community_memberships m
                join public.communities c on c.id = m.community_id
                where m.person_id = p.id and m.left_at is null
            ),
            array[]::text[]
        ),
        'next_best_action', public.next_best_action(p.id),
        'open_tasks', coalesce(
            (
                select jsonb_agg(jsonb_build_object('title', t.title, 'detail', t.detail))
                from public.hospitality_tasks t
                where t.person_id = p.id and t.status = 'open'
            ),
            '[]'::jsonb
        )
    )
    from public.people p
    left join public.customer_hospitality_profiles hp on hp.person_id = p.id
    left join public.customer_health h on h.person_id = p.id
    where p.id = target_person_id;
$$;

notify pgrst, 'reload schema';
