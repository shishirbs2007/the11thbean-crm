-- Only generated tasks need to be unique.
--
-- The original constraint covered every task, which meant a member of staff
-- could add one note to the day and then be silently refused a second. What
-- actually needs protecting is the daily generator: it must not raise the same
-- birthday reminder twice. Tasks a person typed are theirs to repeat.

alter table public.hospitality_tasks
    drop constraint if exists hospitality_tasks_person_id_task_type_due_on_key;

create unique index if not exists hospitality_tasks_generated_unique
on public.hospitality_tasks (person_id, task_type, due_on)
where source = 'system';

notify pgrst, 'reload schema';
