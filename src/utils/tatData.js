import { supabase } from '../services/supabaseSheets';

// Shared by TAT Management and MIS so both pages count pending / complete / delay the same way.

export const DAY = 24 * 60 * 60 * 1000;

// One config object per workflow stage. `source` says which fetched table the
// planned/actual columns live on. `page` is the sidebar page that owns the stage
// (matches navPages.js labels), used to map stages to users via Page Permissions.
export const STAGES = [
  { key: 'check_po', name: 'Check PO', page: 'Check PO', source: 'orders', plannedCol: 'planned_check_po', actualCol: 'check_po_at' },
  { key: 'received_accounts', name: 'Received Accounts', page: 'Received Accounts', source: 'orders', plannedCol: 'planned_received_accounts', actualCol: 'received_accounts_at' },
  { key: 'check_for_delivery', name: 'Check for Delivery', page: 'Check for Delivery', source: 'orders', plannedCol: 'planned_check_for_delivery', actualCol: 'check_for_delivery_at' },
  {
    key: 'dispatch_planning',
    name: 'Dispatch Planning',
    page: 'Dispatch Planning',
    source: 'orders',
    plannedCol: 'planned_dispatch',
    actualCol: 'dispatches.created_at',
    note: 'Planned = Check for Delivery actual + offset. Pending while order qty is not fully dispatched/cancelled; complete = fully dispatched (time of last dispatch).',
  },
  {
    key: 'arrange_logistics',
    name: 'Arrange Logistics',
    page: 'Arrange Logistics',
    source: 'dispatches',
    plannedCol: 'planned_logistics',
    actualCol: 'shipments.created_at',
    note: 'Planned comes from the dispatch; actual = when the first shipment (LGST) was created for that dispatch.',
  },
  { key: 'load_material', name: 'Load Material', page: 'Load Material', source: 'shipments', plannedCol: 'planned_load', actualCol: 'logistics_arranged_at' },
  { key: 'weighment_entry', name: 'Weighment Entry', page: 'Weighment Entry', source: 'shipments', plannedCol: 'planned_weighment', actualCol: 'weighment_done_at' },
  { key: 'make_invoice', name: 'Make Invoice', page: 'Make Invoice', source: 'shipments', plannedCol: 'planned_invoice', actualCol: 'invoice_done_at' },
  { key: 'sales_form_3', name: 'Sales Form 3', page: 'Sales Form 3', source: 'shipments', plannedCol: 'planned_sales_form3', actualCol: 'sales_form3_done_at' },
  { key: 'entry_in_bilty', name: 'Entry In Bilty', page: 'Entry In Bilty', source: 'shipments', plannedCol: 'planned_bilty_entry', actualCol: 'bilty_entry_done_at' },
  { key: 'send_test_certificate', name: 'Send Test Certificate', page: 'Send Test Certificate', source: 'shipments', plannedCol: 'planned_test_certificate', actualCol: 'test_certificate_sent_at' },
  { key: 'party_get_report', name: 'Party Get Report', page: 'Party Get Report', source: 'shipments', plannedCol: 'planned_party_report', actualCol: 'party_report_received_at' },
  { key: 'full_kitting', name: 'Full Kitting', page: 'Full Kitting', source: 'shipments', plannedCol: 'planned_full_kitting', actualCol: 'full_kitting_done_at' },
  {
    key: 'order_cancel',
    name: 'Order Cancel',
    page: 'Order Cancel',
    source: 'order_cancellations',
    plannedCol: 'planned_approval',
    actualCol: 'approved_at',
    note: 'Planned = request time + offset; pending while status is empty / Pending Approval.',
  },
  { key: 'material_return_1', name: 'Material Return: Arrange Logistics', page: 'Material Return', source: 'material_returns', plannedCol: 'planned_logistics', actualCol: 'logistics_arranged_at', note: 'Planned = return request time + offset.' },
  { key: 'material_return_2', name: 'Material Return: Received from Party', page: 'Material Return', source: 'material_returns', plannedCol: 'planned_received', actualCol: 'material_received_at', note: 'Planned = Arrange Logistics actual + offset.' },
  { key: 'material_return_3', name: 'Material Return: Issue Note', page: 'Material Return', source: 'material_returns', plannedCol: 'planned_issue_note', actualCol: 'issue_note_at', note: 'Planned = Received from Party actual + offset.' },
  { key: 'material_return_4', name: 'Material Return: Send to Party', page: 'Material Return', source: 'material_returns', plannedCol: 'planned_send', actualCol: 'sent_to_party_at', note: 'Planned = Issue Note actual + offset.' },
];

// The first twelve stages are applied by tat_apply_offset(); these six by tat_apply_offset_more().
export const MORE_STAGES = new Set(['dispatch_planning', 'order_cancel', 'material_return_1', 'material_return_2', 'material_return_3', 'material_return_4']);

const SOURCES = {
  orders: 'id, quantity, do_number, party_names, planned_dispatch, planned_check_po, check_po_at, planned_received_accounts, received_accounts_at, planned_check_for_delivery, check_for_delivery_at',
  dispatches: 'id, d_number, order_id, qty_to_be_dispatched, created_at, planned_logistics, order:orders(do_number, party_names)',
  order_cancellations: 'id, cancel_no, qty, status, created_at, approved_at, planned_approval, order_id, order:orders(party_names)',
  material_returns: 'id, return_no, created_at, planned_logistics, planned_received, planned_issue_note, planned_send, logistics_arranged_at, material_received_at, issue_note_at, sent_to_party_at, order:orders(party_names)',
  shipments: 'id, lgst_no, dispatch_id, created_at, planned_load, logistics_arranged_at, planned_weighment, weighment_done_at, planned_invoice, invoice_done_at, planned_sales_form3, sales_form3_done_at, planned_bilty_entry, bilty_entry_done_at, planned_test_certificate, test_certificate_sent_at, planned_party_report, party_report_received_at, planned_full_kitting, full_kitting_done_at, dispatch:dispatches(d_number, order:orders(party_names))',
};

export const toDate = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

// Pages through PostgREST in 1000-row chunks (the per-request cap).
async function fetchAll(table, select) {
  const pageSize = 1000;
  const all = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .order('seq', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    all.push(...data);
    if (data.length < pageSize) break;
  }
  return all;
}

export async function loadStageData() {
  const [orders, dispatches, shipments, cancellations, returns] = await Promise.all([
    fetchAll('orders', SOURCES.orders),
    fetchAll('dispatches', SOURCES.dispatches),
    fetchAll('shipments', SOURCES.shipments),
    fetchAll('order_cancellations', SOURCES.order_cancellations),
    fetchAll('material_returns', SOURCES.material_returns),
  ]);
  return { orders, dispatches, shipments, cancellations, returns };
}

export const isDone = (e) => Boolean(e.actual);

function makeEntry(ref, party, planned, actual, since = null) {
  const delay = planned && actual ? (actual.getTime() - planned.getTime()) / DAY : null;
  return { ref, party, planned, actual, delay, since };
}

// Entries per stage, straight from the stored planned / actual columns.
export function buildStageRows(data) {
  const out = {};
  const orders = data.orders || [];
  const dispatches = data.dispatches || [];
  const shipments = data.shipments || [];

  // earliest shipment per dispatch = Arrange Logistics actual
  const firstShipment = new Map();
  shipments.forEach((s) => {
    const t = toDate(s.created_at);
    const prev = firstShipment.get(s.dispatch_id);
    if (t && (!prev || t < prev)) firstShipment.set(s.dispatch_id, t);
  });

  const cancellations = data.cancellations || [];
  const returns = data.returns || [];
  const dispatchedByOrder = new Map();
  const lastDispatchByOrder = new Map();
  dispatches.forEach((d) => {
    dispatchedByOrder.set(d.order_id, (dispatchedByOrder.get(d.order_id) || 0) + (Number(d.qty_to_be_dispatched) || 0));
    const t = toDate(d.created_at);
    const prev = lastDispatchByOrder.get(d.order_id);
    if (t && (!prev || t > prev)) lastDispatchByOrder.set(d.order_id, t);
  });
  const cancelledByOrder = new Map();
  cancellations.filter((c) => c.status === 'Approved').forEach((c) =>
    cancelledByOrder.set(c.order_id, (cancelledByOrder.get(c.order_id) || 0) + (Number(c.qty) || 0)));

  STAGES.forEach((st) => {
    const entries = [];
    if (st.key === 'dispatch_planning') {
      orders.filter((r) => r.check_for_delivery_at).forEach((r) => {
        const remaining = (Number(r.quantity) || 0) - (dispatchedByOrder.get(r.id) || 0) - (cancelledByOrder.get(r.id) || 0);
        const done = remaining <= 0.0001;
        entries.push(makeEntry(r.do_number, r.party_names || '—', toDate(r.planned_dispatch), done ? lastDispatchByOrder.get(r.id) || null : null, toDate(r.check_for_delivery_at)));
      });
    } else if (st.key === 'order_cancel') {
      cancellations.forEach((r) =>
        entries.push(makeEntry(r.cancel_no, r.order?.party_names || '—', toDate(r.planned_approval), (!r.status || r.status === 'Pending Approval') ? null : toDate(r.approved_at) || toDate(r.created_at), toDate(r.created_at))));
    } else if (st.source === 'material_returns') {
      returns.filter((r) => r[st.plannedCol]).forEach((r) =>
        entries.push(makeEntry(r.return_no, r.order?.party_names || '—', toDate(r[st.plannedCol]), toDate(r[st.actualCol]), toDate(r.created_at))));
    } else if (st.source === 'orders') {
      orders.filter((r) => r[st.plannedCol]).forEach((r) =>
        entries.push(makeEntry(r.do_number, r.party_names || '—', toDate(r[st.plannedCol]), toDate(r[st.actualCol]))));
    } else if (st.key === 'arrange_logistics') {
      dispatches.filter((r) => r.planned_logistics).forEach((r) =>
        entries.push(makeEntry(r.d_number, r.order?.party_names || '—', toDate(r.planned_logistics), firstShipment.get(r.id) || null)));
    } else {
      shipments.filter((r) => r[st.plannedCol]).forEach((r) =>
        entries.push(makeEntry(r.lgst_no, r.dispatch?.order?.party_names || '—', toDate(r[st.plannedCol]), toDate(r[st.actualCol]))));
    }
    out[st.key] = entries;
  });
  return out;
}
