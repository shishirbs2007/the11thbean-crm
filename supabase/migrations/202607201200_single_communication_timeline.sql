-- One communication, one timeline entry.
--
-- An earlier migration added log_communication_timeline, and Phase 5 added
-- record_communication_on_timeline alongside it. Both fired on insert, so
-- every message a guest received appeared on their timeline twice — once as a
-- bare "Email message" and once naming the campaign.
--
-- The richer entry wins: it says which campaign the message belonged to, which
-- is the whole point of a unified timeline. The older trigger and its function
-- are removed so there is one definition and no chance of them diverging.

drop trigger if exists communication_message_timeline
on public.communication_messages;

drop function if exists public.log_communication_timeline();

notify pgrst, 'reload schema';
