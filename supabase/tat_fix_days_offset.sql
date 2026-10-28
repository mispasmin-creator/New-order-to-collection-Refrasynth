-- TAT Management: make "days" offsets really add N days.
-- Run once in the Supabase SQL Editor (project "Order To Collection Refrasynth").
--
-- Bug: o2c_planned() pushes any result that lands outside 10:00-18:00 to "base date + 1 day",
-- ignoring the offset. So for a base at 00:00, +1, +2, +3 ... +5 days all gave the same next day.
--
-- Fix: for unit = 'days', planned = base date + N days at the base's own hour:minute
-- (Sunday moves to Monday). 'hours' and 'workdays' keep their existing rules.
-- Existing rows are not touched; Save on the TAT page recomputes a stage.
create or replace function public.o2c_planned_cfg(base timestamptz, p_stage_key text)
returns timestamptz
language plpgsql
stable
as $$
declare
  v numeric;
  u text;
  bl timestamp;
  d date;
begin
  if base is null then return null; end if;
  select offset_value, offset_unit into v, u from public.tat_config where stage_key = p_stage_key;
  if not found then return null; end if;
  if u = 'workdays' then
    return public.o2c_planned_workdays(base, round(v)::int);
  elsif u = 'hours' then
    return public.o2c_planned(base, make_interval(secs => v * 3600));
  else
    bl := base at time zone 'Asia/Kolkata';
    d := bl::date + round(v)::int;
    if extract(dow from d) = 0 then d := d + 1; end if;
    return (d::timestamp + make_interval(hours => extract(hour from bl)::int, mins => extract(minute from bl)::int))
           at time zone 'Asia/Kolkata';
  end if;
end;
$$;
