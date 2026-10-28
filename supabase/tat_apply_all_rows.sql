-- TAT Management: Save now recomputes planned dates for ALL rows of a stage (pending AND complete),
-- not only pending ones. Run once in the Supabase SQL Editor (project "Order To Collection Refrasynth").
--
-- NOTE: every UPDATE needs a WHERE clause (Supabase's API rejects UPDATE without one), hence "where true".
-- Safe to re-run: the backup uses "on conflict do nothing" so the first snapshot is kept.
--
-- 1. Backup of every planned value as it is right now (so nothing is lost when history rows are rewritten).
-- 2. tat_apply_offset()       -> first 12 stages, all rows with a base time
-- 3. tat_apply_offset_more()  -> Dispatch Planning, Order Cancel, Material Return (4), all rows with a base time

-- 1. Backup
create table if not exists public.planned_backup_before_recompute (
  src text not null,
  row_id uuid not null,
  planned jsonb not null,
  backed_up_at timestamptz not null default now(),
  primary key (src, row_id)
);
alter table public.planned_backup_before_recompute enable row level security;

insert into public.planned_backup_before_recompute (src, row_id, planned)
select 'orders', id, jsonb_build_object('planned_check_po', planned_check_po, 'planned_received_accounts', planned_received_accounts,
  'planned_check_for_delivery', planned_check_for_delivery, 'planned_dispatch', planned_dispatch) from public.orders
on conflict do nothing;
insert into public.planned_backup_before_recompute (src, row_id, planned)
select 'dispatches', id, jsonb_build_object('planned_logistics', planned_logistics) from public.dispatches
on conflict do nothing;
insert into public.planned_backup_before_recompute (src, row_id, planned)
select 'shipments', id, jsonb_build_object('planned_load', planned_load, 'planned_weighment', planned_weighment, 'planned_invoice', planned_invoice,
  'planned_sales_form3', planned_sales_form3, 'planned_bilty_entry', planned_bilty_entry, 'planned_test_certificate', planned_test_certificate,
  'planned_party_report', planned_party_report, 'planned_full_kitting', planned_full_kitting) from public.shipments
on conflict do nothing;
insert into public.planned_backup_before_recompute (src, row_id, planned)
select 'order_cancellations', id, jsonb_build_object('planned_approval', planned_approval) from public.order_cancellations
on conflict do nothing;
insert into public.planned_backup_before_recompute (src, row_id, planned)
select 'material_returns', id, jsonb_build_object('planned_logistics', planned_logistics, 'planned_received', planned_received,
  'planned_issue_note', planned_issue_note, 'planned_send', planned_send) from public.material_returns
on conflict do nothing;

-- 2. First 12 stages
create or replace function public.tat_apply_offset(p_stage_key text) returns integer
language plpgsql as $$
declare n integer;
begin
  case p_stage_key
    when 'check_po' then
      update public.orders set planned_check_po = o2c_planned_cfg(created_at, p_stage_key) where true;
    when 'received_accounts' then
      update public.orders set planned_received_accounts = o2c_planned_cfg(check_po_at, p_stage_key) where check_po_at is not null;
    when 'check_for_delivery' then
      update public.orders set planned_check_for_delivery = o2c_planned_cfg(received_accounts_at, p_stage_key) where received_accounts_at is not null;
    when 'arrange_logistics' then
      update public.dispatches set planned_logistics = o2c_planned_cfg(created_at, p_stage_key) where true;
    when 'load_material' then
      update public.shipments set planned_load = o2c_planned_cfg(created_at, p_stage_key) where true;
    when 'weighment_entry' then
      update public.shipments set planned_weighment = o2c_planned_cfg(logistics_arranged_at, p_stage_key) where logistics_arranged_at is not null;
    when 'make_invoice' then
      update public.shipments set planned_invoice = o2c_planned_cfg(weighment_done_at, p_stage_key) where weighment_done_at is not null;
    when 'sales_form_3' then
      update public.shipments set planned_sales_form3 = o2c_planned_cfg(invoice_done_at, p_stage_key) where invoice_done_at is not null;
    when 'entry_in_bilty' then
      update public.shipments set planned_bilty_entry = o2c_planned_cfg(sales_form3_done_at, p_stage_key) where sales_form3_done_at is not null;
    when 'send_test_certificate' then
      update public.shipments set planned_test_certificate = o2c_planned_cfg(bilty_entry_done_at, p_stage_key) where bilty_entry_done_at is not null;
    when 'party_get_report' then
      update public.shipments set planned_party_report = o2c_planned_cfg(test_certificate_sent_at, p_stage_key) where test_certificate_sent_at is not null;
    when 'full_kitting' then
      update public.shipments set planned_full_kitting = o2c_planned_cfg(party_report_received_at, p_stage_key) where party_report_received_at is not null;
    else
      raise exception 'Unknown stage %', p_stage_key;
  end case;
  get diagnostics n = row_count;
  return n;
end $$;

-- 3. Dispatch Planning, Order Cancel, Material Return
create or replace function public.tat_apply_offset_more(p_stage_key text) returns integer
language plpgsql as $$
declare n integer;
begin
  case p_stage_key
    when 'dispatch_planning' then
      update public.orders set planned_dispatch = o2c_planned_cfg(check_for_delivery_at, p_stage_key) where check_for_delivery_at is not null;
    when 'order_cancel' then
      update public.order_cancellations set planned_approval = o2c_planned_cfg(requested_at, p_stage_key) where true;
    when 'material_return_1' then
      update public.material_returns set planned_logistics = o2c_planned_cfg(created_at, p_stage_key) where true;
    when 'material_return_2' then
      update public.material_returns set planned_received = o2c_planned_cfg(logistics_arranged_at, p_stage_key) where logistics_arranged_at is not null;
    when 'material_return_3' then
      update public.material_returns set planned_issue_note = o2c_planned_cfg(material_received_at, p_stage_key) where material_received_at is not null;
    when 'material_return_4' then
      update public.material_returns set planned_send = o2c_planned_cfg(issue_note_at, p_stage_key) where issue_note_at is not null;
    else
      raise exception 'Unknown stage %', p_stage_key;
  end case;
  get diagnostics n = row_count;
  return n;
end $$;
