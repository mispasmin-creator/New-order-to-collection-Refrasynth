-- TAT Management: per-stage planned-date offset ("planned = previous step's actual + offset").
-- This file documents what was applied to the Order To Collection Refrasynth project
-- (migrations tat_offsets_backup_and_seed, tat_planned_cfg_function, tat_triggers_use_config_and_apply_fn).
--
--  * tat_config           one row per stage: offset_value + offset_unit (hours | days | workdays),
--                         plus default_value / default_unit used by "Reset all to original".
--  * o2c_planned_cfg()    planned date for a stage, reading its offset from tat_config.
--  * trg_*_planned()      triggers compute planned on insert, or when the base (previous actual) changes;
--                         otherwise the stored planned is kept, so history rows are never rewritten.
--  * tat_apply_offset()   called by the Save button: recomputes planned for ONE stage's PENDING rows only.
--  * planned_backup_20261027  snapshot of every planned value taken before the change.
--
-- Original offsets: check_po +3h, received_accounts +1d, check_for_delivery +1d, arrange_logistics +1d,
-- load_material +2h, weighment_entry +1d, make_invoice +1d, sales_form_3 +10h, entry_in_bilty +3 workdays,
-- send_test_certificate +2h, party_get_report +7 workdays, full_kitting +15 workdays.
create table if not exists public.tat_config (
  stage_key      text primary key,
  stage_name     text not null,
  table_name     text not null,
  planned_column text not null,
  actual_column  text not null,
  offset_value   numeric not null default 0 check (offset_value >= 0 and offset_value <= 720),
  offset_unit    text not null default 'days' check (offset_unit in ('hours','days','workdays')),
  default_value  numeric not null default 0,
  default_unit   text not null default 'days',
  updated_at     timestamptz not null default now()
);

alter table public.tat_config enable row level security;
create policy "anon_full_access" on public.tat_config for all to anon using (true) with check (true);
create policy "authenticated_full_access" on public.tat_config for all to authenticated using (true) with check (true);
