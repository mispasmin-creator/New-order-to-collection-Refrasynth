-- ============================================================================
-- Order To Collection (Refrasynth) — full Supabase/Postgres schema
-- Run this once, all at once, in the Supabase SQL Editor.
--
-- Design notes:
--   * Normalized, not a 1:1 mirror of the old Google Sheets. One order can
--     have many dispatches; one dispatch can be split into many shipments
--     (one per LGST number) at the Arrange Logistics stage — exactly the
--     real-world relationship this app already models.
--   * Every date/time column is a native `timestamptz` or `date`. This is
--     the actual fix for the "September becomes October" bug from the
--     Sheets version — Postgres never guesses day/month order, so that bug
--     class cannot happen here.
--   * `users.password_hash` is intentionally NOT covered by a client-facing
--     RLS policy — see the RLS section at the bottom.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Helper: auto-maintain updated_at on every table
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- users
-- ----------------------------------------------------------------------------
create type public.user_role as enum (
  'Admin', 'Manager', 'Operations Head', 'Sales Executive', 'Accounts', 'Staff'
);

create table public.users (
  id                uuid primary key default gen_random_uuid(),
  username          text not null unique,
  password_hash     text not null,               -- store via crypt(password, gen_salt('bf')), never plaintext
  role              public.user_role not null default 'Staff',
  firm_access       text not null default 'All',
  page_permissions  text[] not null default array['All'],
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger trg_users_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- orders  (was: FMS sheet)
-- ----------------------------------------------------------------------------
create table public.orders (
  id                        uuid primary key default gen_random_uuid(),
  do_number                 text not null unique,
  party_po_no               text,
  party_po_date             date,
  party_names               text not null,
  product_name              text not null,
  quantity                  numeric(14,3) not null default 0,
  type_of_measurement       text default 'MT',
  rate_of_material          numeric(14,2),
  type_of_transporting      text,
  upload_so_url             text,
  is_through_agent          boolean not null default false,
  order_received_from       text,
  contact_person_name       text,
  contact_person_whatsapp   text,
  alumina_pct               numeric(6,3),
  iron_pct                  numeric(6,3),
  type_of_pi                text,
  lead_time_final_payment   text,
  type_of_application       text,
  customer_category         text,
  free_replacement_foc      boolean not null default false,
  gst_number                text,
  address                   text,
  firm_name                 text,
  total_po_basic_value      numeric(14,2) default 0,
  payment_to_be_taken       text,
  advance                   numeric(14,2) default 0,
  basic                     numeric(14,2) default 0,
  retention_payment         boolean not null default false,
  retention_percentage      numeric(5,2),
  lead_time_retention       text,
  specific_concern          text,
  reference_no              text,
  adjusted_amount           numeric(14,2) default 0,
  total_po_value            numeric(14,2) default 0,
  sales_person_name         text,
  tc_required               boolean not null default false,

  -- Stage 1: Check PO
  check_po_at               timestamptz,
  check_po_remark           text,
  -- Stage 2: Received Accounts
  received_accounts_at      timestamptz,
  -- Stage 3: Check For Delivery
  check_for_delivery_at     timestamptz,
  in_stock_or_not           text,

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  constraint orders_quantity_nonneg check (quantity >= 0)
);

create index idx_orders_party_names on public.orders (party_names);
create index idx_orders_do_number   on public.orders (do_number);

create trigger trg_orders_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- dispatches  (was: Dispatch sheet — one row per D-number)
-- ----------------------------------------------------------------------------
create table public.dispatches (
  id                      uuid primary key default gen_random_uuid(),
  d_number                text not null unique,
  order_id                uuid not null references public.orders (id) on delete restrict,
  qty_to_be_dispatched    numeric(14,3) not null,
  type_of_transporting    text,
  date_of_dispatch        date,
  address                 text,
  tc_required             boolean not null default false,
  weighment_at            timestamptz,   -- pre-logistics weighment check ("Actual 2" on the old Dispatch sheet)

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint dispatches_qty_nonneg check (qty_to_be_dispatched >= 0)
);

create index idx_dispatches_order_id on public.dispatches (order_id);

create trigger trg_dispatches_updated_at
  before update on public.dispatches
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- shipments  (was: Billing sheet — one row per LGST-Sr Number)
-- A dispatch can be split into several shipments at Arrange Logistics time.
-- ----------------------------------------------------------------------------
create table public.shipments (
  id                          uuid primary key default gen_random_uuid(),
  lgst_no                     text not null unique,
  dispatch_id                 uuid not null references public.dispatches (id) on delete restrict,

  transporter_name            text,
  truck_no                    text,
  vehicle_no_plate_image_url  text,
  driver_mobile_no            text,
  bilty_no                    text,
  actual_truck_qty            numeric(14,3),
  type_of_rate                text,
  transport_rate_per_mt       numeric(14,2),
  fixed_amount                numeric(14,2),

  -- Stage: Arrange Logistics
  logistics_arranged_at       timestamptz,
  load_image_1_url            text,
  load_image_2_url            text,

  -- Stage: Weighment Entry
  weighment_done_at           timestamptz,
  weighment_image_1_url       text,
  weighment_image_2_url       text,
  weighment_image_3_url       text,

  -- Stage: Make Invoice
  invoice_done_at             timestamptz,
  bill_no                     text,
  bill_copy_url                text,

  -- Stage: Sales Form 3
  sales_form3_done_at         timestamptz,
  sales_form3_status          text,

  -- Stage: Entry In Bilty
  bilty_entry_done_at         timestamptz,
  bilty_entry_no              text,
  bilty_entry_copy_url        text,

  -- Stage: Send Test Certificate
  test_certificate_sent_at    timestamptz,
  tc_copy_url                  text,

  -- Stage: Party Get Report
  party_report_received_at    timestamptz,
  received_date               date,
  received_copy_image_url     text,
  grn_number                  text,

  -- Stage: Full Kitting
  full_kitting_done_at        timestamptz,
  kitting_status               text,
  transport_amount             numeric(14,2),

  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);

create index idx_shipments_dispatch_id on public.shipments (dispatch_id);
create index idx_shipments_bill_no     on public.shipments (bill_no);

create trigger trg_shipments_updated_at
  before update on public.shipments
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- order_cancellations  (was: Order Cancel sheet)
-- ----------------------------------------------------------------------------
create table public.order_cancellations (
  id            uuid primary key default gen_random_uuid(),
  cancel_no     text not null unique,
  order_id      uuid not null references public.orders (id) on delete restrict,
  qty           numeric(14,3) not null,
  reason        text,
  status        text not null default 'Pending Approval',
  requested_at  timestamptz not null default now(),
  approved_at   timestamptz,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint order_cancellations_qty_positive check (qty > 0),
  constraint order_cancellations_status_valid
    check (status in ('Pending Approval', 'Approved', 'Rejected'))
);

create index idx_order_cancellations_order_id on public.order_cancellations (order_id);

create trigger trg_order_cancellations_updated_at
  before update on public.order_cancellations
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- material_returns  (was: Material Return sheet)
-- ----------------------------------------------------------------------------
create table public.material_returns (
  id                              uuid primary key default gen_random_uuid(),
  return_no                       text not null unique,
  order_id                        uuid not null references public.orders (id) on delete restrict,
  qty                             numeric(14,3) not null,
  rate_of_material                numeric(14,2),
  bill_no                         text,
  bill_copy_url                    text,
  transport_payment               text,
  party_debit_note_copy_url       text,
  reason                          text,

  -- Stage 1: Arrange Logistics For Lift Return Material
  logistics_arranged_at           timestamptz,
  transporter_name                text,
  bilty_no                        text,
  vehicle_no                      text,
  type_of_rate                    text,

  -- Stage 2: Received Return Material From Party
  material_received_at            timestamptz,
  qty_of_return_material          numeric(14,3),
  condition_of_material           text,
  photo_of_return_material_url    text,

  -- Stage 3: Issue Note
  issue_note_at                   timestamptz,
  credit_note_copy_url             text,
  credit_note_no                  text,

  -- Stage 4: Send To Party
  sent_to_party_at                timestamptz,
  status                          text,

  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),

  constraint material_returns_qty_positive check (qty > 0)
);

create index idx_material_returns_order_id on public.material_returns (order_id);

create trigger trg_material_returns_updated_at
  before update on public.material_returns
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Bonus view: per-order dispatched/cancelled/pending qty, computed live —
-- replaces the getDispatchedQty/getPendingQty/getCancelledQty logic that
-- currently runs client-side in OrdersPage.jsx.
-- ----------------------------------------------------------------------------
create or replace view public.order_progress as
select
  o.id                                              as order_id,
  o.do_number,
  o.quantity                                        as order_qty,
  coalesce(d.dispatched_qty, 0)                     as dispatched_qty,
  coalesce(c.cancelled_qty, 0)                      as cancelled_qty,
  o.quantity - coalesce(d.dispatched_qty, 0) - coalesce(c.cancelled_qty, 0)
                                                     as pending_qty
from public.orders o
left join (
  select order_id, sum(qty_to_be_dispatched) as dispatched_qty
  from public.dispatches
  group by order_id
) d on d.order_id = o.id
left join (
  select order_id, sum(qty) as cancelled_qty
  from public.order_cancellations
  where status = 'Approved'
  group by order_id
) c on c.order_id = o.id;

-- ============================================================================
-- Row Level Security
--
-- orders / dispatches / shipments / order_cancellations / material_returns:
-- open to any authenticated Supabase session for now. Once the app's login
-- is wired to Supabase Auth, replace `using (true)` per table with a real
-- check against the signed-in user's page_permissions.
--
-- users: RLS is enabled with NO client-facing policy on purpose — this
-- blocks anon AND authenticated roles from ever reading password_hash.
-- Only the service_role key (used server-side only, e.g. in an Edge
-- Function that handles login/user management) can touch this table.
-- ============================================================================
do $$
declare
  t text;
begin
  foreach t in array array['orders', 'dispatches', 'shipments', 'order_cancellations', 'material_returns']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "authenticated_full_access" on public.%I for all to authenticated using (true) with check (true)',
      t
    );
  end loop;
end $$;

alter table public.users enable row level security;
