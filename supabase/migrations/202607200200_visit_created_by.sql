alter table public.visits
    add column if not exists created_by uuid
        references auth.users(id);

alter table public.visit_items
    add column if not exists created_by uuid
        references auth.users(id);

create index if not exists visits_created_by_idx
on public.visits(created_by);

create index if not exists visit_items_created_by_idx
on public.visit_items(created_by);

notify pgrst, 'reload schema';
