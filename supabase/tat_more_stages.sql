-- TAT Management: planned dates for Dispatch Planning, Order Cancel and Material Return (4 stages).
-- Run this once in the Supabase SQL Editor (project "Order To Collection Refrasynth").
-- Additive only: no existing trigger or function is modified or replaced.
--
-- Prerequisite (already applied): planned_dispatch / planned_approval / planned_logistics /
-- planned_received / planned_issue_note / planned_send columns and the six tat_config rows.
--
-- Offsets are assumptions (no original sheet rules were found); change them on the TAT Management page.

-- 1. Triggers: compute planned on insert, or when the base time changes
create or replace function public.trg_orders_planned_dispatch() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.check_for_delivery_at is distinct from old.check_for_delivery_at then
    new.planned_dispatch := public.o2c_planned_cfg(new.check_for_delivery_at, 'dispatch_planning'); end if;
  return new;
end $$;
drop trigger if exists trg_orders_planned_dispatch on public.orders;
create trigger trg_orders_planned_dispatch before insert or update on public.orders
  for each row execute function public.trg_orders_planned_dispatch();

create or replace function public.trg_order_cancellations_planned() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.requested_at is distinct from old.requested_at then
    new.planned_approval := public.o2c_planned_cfg(new.requested_at, 'order_cancel'); end if;
  return new;
end $$;
drop trigger if exists trg_order_cancellations_planned on public.order_cancellations;
create trigger trg_order_cancellations_planned before insert or update on public.order_cancellations
  for each row execute function public.trg_order_cancellations_planned();

create or replace function public.trg_material_returns_planned() returns trigger language plpgsql as $$
declare ins boolean := (tg_op = 'INSERT');
begin
  if ins or new.created_at is distinct from old.created_at then
    new.planned_logistics := public.o2c_planned_cfg(new.created_at, 'material_return_1'); end if;
  if ins or new.logistics_arranged_at is distinct from old.logistics_arranged_at then
    new.planned_received := public.o2c_planned_cfg(new.logistics_arranged_at, 'material_return_2'); end if;
  if ins or new.material_received_at is distinct from old.material_received_at then
    new.planned_issue_note := public.o2c_planned_cfg(new.material_received_at, 'material_return_3'); end if;
  if ins or new.issue_note_at is distinct from old.issue_note_at then
    new.planned_send := public.o2c_planned_cfg(new.issue_note_at, 'material_return_4'); end if;
  return new;
end $$;
drop trigger if exists trg_material_returns_planned on public.material_returns;
create trigger trg_material_returns_planned before insert or update on public.material_returns
  for each row execute function public.trg_material_returns_planned();

-- 2. Save button for these six stages (pending rows only). The existing tat_apply_offset() is untouched.
create or replace function public.tat_apply_offset_more(p_stage_key text) returns integer
language plpgsql as $$
declare n integer;
begin
  case p_stage_key
    when 'dispatch_planning' then
      update public.orders o set planned_dispatch = o2c_planned_cfg(o.check_for_delivery_at, p_stage_key)
        where o.check_for_delivery_at is not null
          and o.quantity - coalesce((select sum(d.qty_to_be_dispatched) from public.dispatches d where d.order_id = o.id), 0)
                         - coalesce((select sum(c.qty) from public.order_cancellations c where c.order_id = o.id and c.status = 'Approved'), 0) > 0.0001;
    when 'order_cancel' then
      update public.order_cancellations set planned_approval = o2c_planned_cfg(requested_at, p_stage_key) where coalesce(status, 'Pending Approval') = 'Pending Approval';
    when 'material_return_1' then
      update public.material_returns set planned_logistics = o2c_planned_cfg(created_at, p_stage_key) where logistics_arranged_at is null;
    when 'material_return_2' then
      update public.material_returns set planned_received = o2c_planned_cfg(logistics_arranged_at, p_stage_key) where logistics_arranged_at is not null and material_received_at is null;
    when 'material_return_3' then
      update public.material_returns set planned_issue_note = o2c_planned_cfg(material_received_at, p_stage_key) where material_received_at is not null and issue_note_at is null;
    when 'material_return_4' then
      update public.material_returns set planned_send = o2c_planned_cfg(issue_note_at, p_stage_key) where issue_note_at is not null and sent_to_party_at is null;
    else
      raise exception 'Unknown stage %', p_stage_key;
  end case;
  get diagnostics n = row_count;
  return n;
end $$;

-- 3. Backfill the existing rows (their planned columns are empty)
update public.orders set planned_dispatch = public.o2c_planned_cfg(check_for_delivery_at, 'dispatch_planning') where check_for_delivery_at is not null;
update public.order_cancellations set planned_approval = public.o2c_planned_cfg(requested_at, 'order_cancel');
update public.material_returns set
  planned_logistics = public.o2c_planned_cfg(created_at, 'material_return_1'),
  planned_received = public.o2c_planned_cfg(logistics_arranged_at, 'material_return_2'),
  planned_issue_note = public.o2c_planned_cfg(material_received_at, 'material_return_3'),
  planned_send = public.o2c_planned_cfg(issue_note_at, 'material_return_4');
