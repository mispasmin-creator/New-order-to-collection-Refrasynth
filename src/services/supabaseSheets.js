import { createClient } from '@supabase/supabase-js';

// Presents the Supabase tables in the exact shape the app already understood from
// Google Sheets (a 2D array: 5 filler rows, a header row, then data rows, with the
// same header names) and translates header-keyed writes back into column updates.
// This keeps every page's grouping/stage logic untouched.

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();

export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);
export const supabase = supabaseConfigured ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Field spec helpers
const T = (header, col, type = 'text') => ({ header, col, type });   // real column
const X = (header) => ({ header, extra: true });                       // stored in `extra` jsonb
const B = (header) => ({ header, blank: true });                       // sheet formula column, not stored
const P = (header, col) => ({ header, col, type: 'ts', readonly: true }); // Planned date, computed by a database trigger
const V = (header, read, link) => ({ header, virtual: true, read, link }); // joined / linked field

const orderOf = (row) => row.order || {};
const dispatchOf = (row) => row.dispatch || {};

const SHEETS = {
  FMS: {
    table: 'orders',
    select: '*',
    fields: [
      T('Timestamp', 'created_at', 'ts'),
      T('DO-Delivery Order No.', 'do_number'),
      T('PARTY PO NO (As Per Po Exact)', 'party_po_no'),
      T('Party PO Date', 'party_po_date', 'date'),
      T('Party Names', 'party_names'),
      T('Product Name', 'product_name'),
      T('Quantity', 'quantity', 'num'),
      T('Rate Of Material', 'rate_of_material', 'num'),
      T('Type Of Transporting', 'type_of_transporting'),
      T('Upload SO', 'upload_so_url'),
      T('Is This Order Through Some Agent', 'is_through_agent', 'bool'),
      T('Order Received From', 'order_received_from'),
      T('Type Of Measurement', 'type_of_measurement'),
      T('Contact Person Name', 'contact_person_name'),
      T('Contact Person WhatsApp No.', 'contact_person_whatsapp'),
      T('Alumina%', 'alumina_pct', 'num'),
      T('Iron%', 'iron_pct', 'num'),
      T('Type Of PI', 'type_of_pi'),
      T('Lead Time For Collection Of Final Payment', 'lead_time_final_payment'),
      T('Type Of Application', 'type_of_application'),
      T('Customer Category', 'customer_category'),
      T('Free Replacement (FOC)', 'free_replacement_foc', 'bool'),
      T('Gst Number', 'gst_number'),
      T('Address', 'address'),
      T('Firm Name', 'firm_name'),
      T('Total PO Basic Value', 'total_po_basic_value', 'num'),
      T('Payment to Be Taken', 'payment_to_be_taken'),
      T('Advance', 'advance', 'num'),
      T('Basic', 'basic', 'num'),
      T('Retention Payment', 'retention_payment', 'bool'),
      T('Retention Percentage', 'retention_percentage', 'num'),
      T('Lead Time for Retention', 'lead_time_retention'),
      T('Specific Concern', 'specific_concern'),
      T('Reference No.', 'reference_no'),
      T('Adjusted Amount', 'adjusted_amount', 'num'),
      T('Total PO Value', 'total_po_value', 'num'),
      T('Sales Person Name', 'sales_person_name'),
      T('TC Required', 'tc_required', 'bool'),
      P('Planned 1', 'planned_check_po'),
      T('Actual 1', 'check_po_at', 'ts'),
      B('Time Delay 1'),
      X('Expected Delivery Date'),
      X('Status 1'),
      T('Remark 1', 'check_po_remark'),
      P('Planned 2', 'planned_received_accounts'),
      T('Actual 2', 'received_accounts_at', 'ts'),
      B('Time Delay 2'),
      X('Remark 2'),
      X('Status 2'),
      P('Planned 3', 'planned_check_for_delivery'),
      T('Actual 3', 'check_for_delivery_at', 'ts'),
      B('Time Delay 3'),
      X('Remark 3'),
      X('Status 3'),
      T('In Stock Or Not ', 'in_stock_or_not'),
      X('Self Order No/ Indent No.'),
      X('Order Number Of The Production'),
      X('Qty Transfered'),
      X('Batch Number In Remarks'),
      X('GP %'),
      P('Planned 4', 'planned_dispatch'),
    ],
  },

  Dispatch: {
    table: 'dispatches',
    select: '*, order:orders(id, do_number, party_names, product_name)',
    fields: [
      T('Timestamp', 'created_at', 'ts'),
      T('D Number', 'd_number'),
      V('Delivery Order No.', (r) => orderOf(r).do_number, 'order'),
      V('Party Name', (r) => orderOf(r).party_names),
      V('Product Name', (r) => orderOf(r).product_name),
      T('Qty To Be Dispatched', 'qty_to_be_dispatched', 'num'),
      T('Type Of Transporting', 'type_of_transporting'),
      T('Date Of Dispatch', 'date_of_dispatch', 'date'),
      P('Planned 2', 'planned_logistics'),
      B('Actual 2'),
      B('Time Delay 3'),
      X('lgst No.'),
      T('Address', 'address'),
      T('TC Required', 'tc_required', 'bool'),
    ],
  },

  Billing: {
    table: 'shipments',
    select: '*, dispatch:dispatches(id, d_number, type_of_transporting, order:orders(do_number, party_names, product_name))',
    fields: [
      T('Timestamp', 'created_at', 'ts'),
      V('Delivery Order No', (r) => orderOf(dispatchOf(r)).do_number),
      V('Dispatch No.', (r) => dispatchOf(r).d_number, 'dispatch'),
      T('LGST-Sr Number', 'lgst_no'),
      V('Party Name', (r) => orderOf(dispatchOf(r)).party_names),
      V('Product Name', (r) => orderOf(dispatchOf(r)).product_name),
      V('Type Of Transporting', (r) => dispatchOf(r).type_of_transporting),
      T('Transporter Name', 'transporter_name'),
      T('Truck No.', 'truck_no'),
      T('Vehicle No. Plate Image', 'vehicle_no_plate_image_url'),
      T('Driver Mobile No.', 'driver_mobile_no'),
      T('Bilty No.', 'bilty_no'),
      T('Actual Truck Qty', 'actual_truck_qty', 'num'),
      T('Type Of Rate', 'type_of_rate'),
      T('Transport Rate @Per Matric Ton  ', 'transport_rate_per_mt', 'num'),
      T('Fixed Amount', 'fixed_amount', 'num'),
      P('Planned', 'planned_load'),
      T('Actual', 'logistics_arranged_at', 'ts'),
      B('Time Delay'),
      T('Load Iamge 1', 'load_image_1_url'),
      T('Load Iamge 2', 'load_image_2_url'),
      P('Planned2', 'planned_weighment'),
      T('Actual2', 'weighment_done_at', 'ts'),
      B('Time Delay2'),
      T('Weighment  Iamge 1', 'weighment_image_1_url'),
      T('Weighment  Iamge 2', 'weighment_image_2_url'),
      T('Weighment  Iamge 3', 'weighment_image_3_url'),
      P('Planned 3', 'planned_invoice'),
      T('Actual 3', 'invoice_done_at', 'ts'),
      B('Time Delay 3'),
      T('Bill No.', 'bill_no'),
      T('Bill Copy', 'bill_copy_url'),
      P('Planned 4', 'planned_sales_form3'),
      T('Actual 4', 'sales_form3_done_at', 'ts'),
      B('Time Delay 4'),
      T('Status4', 'sales_form3_status'),
      P('Planned 5', 'planned_bilty_entry'),
      T('Actual 5', 'bilty_entry_done_at', 'ts'),
      B('Time Delay 5'),
      T('Bilty No.5', 'bilty_entry_no'),
      T('Bilty Copy', 'bilty_entry_copy_url'),
      P('Planned 6', 'planned_test_certificate'),
      T('Actual 6', 'test_certificate_sent_at', 'ts'),
      B('Time Delay 6'),
      T('Tc Copy', 'tc_copy_url'),
      P('Planned 7', 'planned_party_report'),
      T('Actual 7', 'party_report_received_at', 'ts'),
      B('Time Delay 7'),
      T('Received Date', 'received_date', 'date'),
      T('Image Of Received Copy', 'received_copy_image_url'),
      T('Grn Number', 'grn_number'),
      P('Planned 8', 'planned_full_kitting'),
      T('Actual 8', 'full_kitting_done_at', 'ts'),
      B('Time Delay 8'),
      T('Status8', 'kitting_status'),
    ],
  },

  'Order Cancel': {
    table: 'order_cancellations',
    select: '*, order:orders(id, do_number, party_names, product_name)',
    fields: [
      T('Timestamp', 'created_at', 'ts'),
      T('Cancel No.', 'cancel_no'),
      V('DO-Delivery Order No.', (r) => orderOf(r).do_number, 'order'),
      V('Party Names', (r) => orderOf(r).party_names),
      V('Product Name', (r) => orderOf(r).product_name),
      T('Qty', 'qty', 'num'),
      T('Reason', 'reason'),
      P('Planned', 'planned_approval'),
      T('Actual', 'approved_at', 'ts'),
      B('Time Delay'),
      T('Status', 'status'),
    ],
  },

  'Material Return': {
    table: 'material_returns',
    select: '*, order:orders(id, do_number, party_names, product_name)',
    fields: [
      T('Timestamp', 'created_at', 'ts'),
      T('Return No.', 'return_no'),
      V('DO-Delivery Order No.', (r) => orderOf(r).do_number, 'order'),
      V('Party Names', (r) => orderOf(r).party_names),
      V('Product Name', (r) => orderOf(r).product_name),
      T('Qty', 'qty', 'num'),
      T('Rate Of Material', 'rate_of_material', 'num'),
      T('Bill No.', 'bill_no'),
      T('Bill Copy', 'bill_copy_url'),
      T('Tranport Payment', 'transport_payment'),
      T('Party Debit Note Copy', 'party_debit_note_copy_url'),
      T('Reason Of Material Return', 'reason'),
      P('Planned1', 'planned_logistics'),
      T('Actual1', 'logistics_arranged_at', 'ts'),
      B('Time Delay1'),
      T('Transporter Name', 'transporter_name'),
      T('Bilty No.', 'bilty_no'),
      T('Vehicle No.', 'vehicle_no'),
      T('Type Of Rate', 'type_of_rate'),
      P('Planned2', 'planned_received'),
      T('Actual2', 'material_received_at', 'ts'),
      B('Time Delay2'),
      T('Qty Of Return Material', 'qty_of_return_material', 'num'),
      T('Condition of Material', 'condition_of_material'),
      T('Photo Of Return Material', 'photo_of_return_material_url'),
      P('Planned3', 'planned_issue_note'),
      T('Actual3', 'issue_note_at', 'ts'),
      B('Time Delay3'),
      T('Credit Note Copy', 'credit_note_copy_url'),
      T('Credit Note No.', 'credit_note_no'),
      P('Planned4', 'planned_send'),
      T('Actual4', 'sent_to_party_at', 'ts'),
      B('Time Delay4'),
      T('Status4', 'status'),
    ],
  },

  // Free-form rows: every header lives in `data` jsonb, keyed by its normalised name.
  'Full Kitting': {
    table: 'full_kitting',
    select: '*',
    json: true,
    fields: [
      X('Timestamp'),
      X('Delivery Order No'),
      X('LGST-Sr Number'),
      X('Party Name'),
      X('Type Of Transporting'),
      X('Transporter Name'),
      X('Truck No.'),
      X('Vehicle No. Plate Image'),
      X('Driver Mobile No.'),
      X('Bilty No.'),
      X('Actual Truck Qty'),
      X('Type Of Rate'),
      X('Transport Rate @Per Matric Ton  '),
      X('Fixed Amount'),
      X('Transport Amount'),
    ],
  },
};

// Sheet's FMS positional layout used by the legacy full-row updateOrder(): columns 1..37.
const FMS_POSITIONAL = SHEETS.FMS.fields.slice(1, 38).map((f) => f.header);

const HEADER_ROW_INDEX = 5;
const DATA_ROW_OFFSET = 6; // rowIndex = seq + 6, so array position = seq + 5 (row 7 = first data row)

function fieldLookup(spec) {
  if (!spec._lookup) {
    spec._lookup = {};
    spec.fields.forEach((f) => {
      spec._lookup[norm(f.header)] = f;
    });
  }
  return spec._lookup;
}

function formatForRead(field, row) {
  if (field.blank) return '';
  if (field.virtual) return field.read(row) ?? '';
  if (field.extra) {
    const bag = row.extra ?? row.data;
    const v = bag ? bag[norm(field.header)] : undefined;
    return v ?? '';
  }
  const source = row[field.col];
  if (source === null || source === undefined) return '';
  if (field.type === 'bool') return source ? 'Yes' : 'No';
  if (field.type === 'num') return Number(source);
  return source;
}

async function fetchAll(table, select) {
  const pageSize = 1000;
  let from = 0;
  const rows = [];
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .order('seq', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

// Same return shape as the Apps Script GET: { success, data: 2D array }
export async function readSheet(sheetName) {
  const spec = SHEETS[sheetName];
  if (!spec || !supabase) return { success: false, error: `Unknown sheet '${sheetName}'` };
  try {
    const rows = await fetchAll(spec.table, spec.select);
    const width = spec.fields.length;
    const out = [];
    for (let i = 0; i < DATA_ROW_OFFSET - 1; i++) out.push([]);
    out[HEADER_ROW_INDEX] = spec.fields.map((f) => f.header);
    rows.forEach((row) => {
      out[row.seq + DATA_ROW_OFFSET - 1] = spec.fields.map((f) => formatForRead(f, row));
    });
    for (let i = 0; i < out.length; i++) if (!out[i]) out[i] = [];
    return { success: true, rows: out.length, width, data: out };
  } catch (err) {
    console.error(`Supabase read failed for '${sheetName}':`, err);
    return { success: false, error: err.message || String(err) };
  }
}

// ---- value conversion for writes ----
const pad2 = (n) => String(n).padStart(2, '0');

function toTimestamp(v) {
  const s = String(v ?? '').trim();
  if (!s || s === '#VALUE!') return null;
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    return `${m[3]}-${pad2(m[2])}-${pad2(m[1])}T${pad2(m[4] || 0)}:${pad2(m[5] || 0)}:${pad2(m[6] || 0)}+05:30`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00:00+05:30`;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s;
  return null;
}

function toDate(v) {
  const s = String(v ?? '').trim();
  if (!s || s === '#VALUE!') return null;
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${pad2(m[2])}-${pad2(m[1])}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;
    const ist = new Date(d.getTime() + 330 * 60000);
    return `${ist.getUTCFullYear()}-${pad2(ist.getUTCMonth() + 1)}-${pad2(ist.getUTCDate())}`;
  }
  return null;
}

function convert(type, v) {
  if (v === undefined || v === null || v === '') return null;
  if (type === 'num') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  if (type === 'bool') return /^(yes|y|true)$/i.test(String(v).trim());
  if (type === 'ts') return toTimestamp(v);
  if (type === 'date') return toDate(v);
  return String(v);
}

async function lookupId(table, column, value) {
  const { data, error } = await supabase.from(table).select('id').eq(column, String(value).trim()).limit(1);
  if (error) throw error;
  return data && data[0] ? data[0].id : null;
}

// Splits a header-keyed object into real columns, extra/json bag, and FK links.
async function buildWrite(spec, obj, { forInsert }) {
  const lookup = fieldLookup(spec);
  const cols = {};
  const bag = {};
  const links = {};

  for (const [key, value] of Object.entries(obj)) {
    const field = lookup[norm(key)];
    if (!field) {
      bag[norm(key)] = value;
      continue;
    }
    if (field.blank || field.readonly) continue;
    if (field.virtual) {
      if (field.link) links[field.link] = value;
      continue;
    }
    if (field.extra) {
      bag[norm(field.header)] = value;
      continue;
    }
    cols[field.col] = convert(field.type, value);
  }

  if (links.order) {
    if (!String(links.order).trim()) {
      if (forInsert) throw new Error('Delivery Order No. is required');
    } else {
      const id = await lookupId('orders', 'do_number', links.order);
      if (!id) throw new Error(`Order '${links.order}' not found`);
      cols.order_id = id;
    }
  }
  if (links.dispatch) {
    if (!String(links.dispatch).trim()) {
      if (forInsert) throw new Error('Dispatch No. is required');
    } else {
      const id = await lookupId('dispatches', 'd_number', links.dispatch);
      if (!id) throw new Error(`Dispatch '${links.dispatch}' not found`);
      cols.dispatch_id = id;
    }
  }
  return { cols, bag };
}

function parseObj(v) {
  return typeof v === 'string' ? JSON.parse(v) : v || {};
}

async function findRowBySeq(spec, rowIndex) {
  const seq = Number(rowIndex) - DATA_ROW_OFFSET;
  if (!Number.isFinite(seq) || seq < 1) return null;
  const sel = spec.json ? 'id, seq, data' : 'id, seq, extra';
  const { data, error } = await supabase.from(spec.table).select(sel).eq('seq', seq).limit(1);
  if (error) throw error;
  return data && data[0] ? data[0] : null;
}

// Mirrors sendToAppsScript()'s payload contract for read/insert/update/delete.
export async function sheetRequest(payload) {
  if (!supabase) return { success: false, error: 'Supabase is not configured (check .env)' };
  const sheetName = payload.sheetName || payload.sheet;
  const spec = SHEETS[sheetName];
  if (!spec) return { success: false, error: `Sheet '${sheetName}' is not supported` };

  try {
    if (payload.action === 'read') return await readSheet(sheetName);

    if (payload.action === 'insert') {
      const obj = parseObj(payload.rowDataObj);
      const { cols, bag } = await buildWrite(spec, obj, { forInsert: true });
      const row = spec.json ? { data: bag } : { ...cols, ...(Object.keys(bag).length ? { extra: bag } : {}) };
      const { error } = await supabase.from(spec.table).insert(row);
      if (error) return { success: false, error: error.message };
      return { success: true, message: 'Inserted' };
    }

    if (payload.action === 'update') {
      let obj;
      if (payload.rowDataObj) {
        obj = parseObj(payload.rowDataObj);
      } else {
        // Legacy positional full-row update (FMS order edit): skip blanks like the sheet did
        const arr = JSON.parse(payload.rowData || '[]');
        obj = {};
        arr.forEach((val, i) => {
          if (val !== '' && val !== undefined && FMS_POSITIONAL[i]) obj[FMS_POSITIONAL[i]] = val;
        });
      }

      let target = await findRowBySeq(spec, payload.rowIndex);
      if (!target && payload.doNumber && spec.table === 'orders') {
        const id = await lookupId('orders', 'do_number', payload.doNumber);
        if (id) {
          const { data } = await supabase.from('orders').select('id, seq, extra').eq('id', id).limit(1);
          target = data && data[0];
        }
      }
      if (!target) return { success: false, error: 'Row not found for update' };

      const { cols, bag } = await buildWrite(spec, obj, { forInsert: false });
      const patch = { ...cols };
      if (Object.keys(bag).length) {
        const current = (spec.json ? target.data : target.extra) || {};
        patch[spec.json ? 'data' : 'extra'] = { ...current, ...bag };
      }
      if (Object.keys(patch).length === 0) return { success: true, message: 'Nothing to update' };
      const { error } = await supabase.from(spec.table).update(patch).eq('id', target.id);
      if (error) return { success: false, error: error.message };
      return { success: true, message: 'Updated' };
    }

    if (payload.action === 'delete') {
      const target = await findRowBySeq(spec, payload.rowIndex);
      if (!target) return { success: false, error: 'Row not found for delete' };
      const { error } = await supabase.from(spec.table).delete().eq('id', target.id);
      if (error) return { success: false, error: error.message };
      return { success: true, message: 'Deleted' };
    }

    return { success: false, error: `Unsupported action '${payload.action}'` };
  } catch (err) {
    console.error('Supabase request failed:', err);
    return { success: false, error: err.message || String(err) };
  }
}
