import {
  getStoredMockOrders,
  saveStoredMockOrders,
} from './mockData';

import { supabase, supabaseConfigured, readSheet, sheetRequest } from './supabaseSheets';

const FORCE_MOCK = import.meta.env.VITE_USE_MOCK === 'true' || !supabaseConfigured;
const STORAGE_BUCKET = 'All Files';

// Short-lived read cache, keyed by sheet/tab. The sidebar's pending-count
// poller and whichever page is currently mounted routinely request the same
// sheet within the same second (e.g. both call getOrders()/getDispatchEntries()
// on page load) — against this rate-limited, often slow Apps Script backend,
// that doubles real load time for no benefit. Caching the in-flight PROMISE
// (not just the resolved value) means simultaneous callers share one network
// request instead of firing two, and a short TTL keeps data from going stale.
const READ_CACHE_TTL_MS = 15000;
const readCache = new Map();

function cachedRead(key, fetcher) {
  const cached = readCache.get(key);
  if (cached && Date.now() - cached.time < READ_CACHE_TTL_MS) {
    return cached.promise;
  }
  const promise = fetcher()
    .then((result) => {
      if (!result || result.success === false) readCache.delete(key);
      return result;
    })
    .catch((err) => {
      readCache.delete(key);
      throw err;
    });
  readCache.set(key, { promise, time: Date.now() });
  return promise;
}

/**
 * Normalise any timestamp value returned from Google Sheets into
 * the display format:  dd/MM/yyyy HH:mm:ss  (IST)
 *
/**
 * Normalise any date or timestamp value into the standard display format:
 *   dd/MM/yyyy HH:mm:ss  (IST)
 *
 * Handles:
 *  - Already-formatted string  "01/09/2026 14:47:03"
 *  - ISO string                "2026-08-31T18:30:00.000Z"
 *  - HTML date input           "2026-08-31" -> "31/08/2026 00:00:00"
 *  - Pure date string          "31/08/2026" -> "31/08/2026 00:00:00"
 *  - JS Date object
 *  - Excel serial number       e.g. 46300.123
 */
export function formatAppDate(val) {
  if (!val && val !== 0) return '';

  let d;

  if (typeof val === 'number') {
    // Excel/Sheets serial date (days since 30 Dec 1899)
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    d = new Date(excelEpoch.getTime() + val * 86400000);
  } else if (val instanceof Date) {
    d = val;
  } else {
    const str = val.toString().trim();
    if (!str) return '';

    // Already in dd/MM/yyyy HH:mm:ss — return as-is
    if (/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/.test(str)) return str;

    // YYYY-MM-DD (e.g. from input date)
    const ymd = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (ymd) return `${ymd[3]}/${ymd[2]}/${ymd[1]} 00:00:00`;

    // DD/MM/YYYY (no time)
    const dmy = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (dmy) return `${dmy[1]}/${dmy[2]}/${dmy[3]} 00:00:00`;

    d = new Date(str);
    if (isNaN(d.getTime())) return str; // unparseable — show raw
  }

  const pad = (n) => String(n).padStart(2, '0');
  // Display in IST (UTC+5:30)
  const ist = new Date(d.getTime() + (5 * 60 + 30) * 60000);
  return (
    `${pad(ist.getUTCDate())}/${pad(ist.getUTCMonth() + 1)}/${ist.getUTCFullYear()} ` +
    `${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}:${pad(ist.getUTCSeconds())}`
  );
}

export const formatTimestamp = formatAppDate;


/**
 * Parse raw Google Sheet 2D array into a dictionary of dropdown lists:
 * { "Firm Name": ["..."], "Type Of Transporting": ["..."] }
 */
function parseMasterSheet(data) {
  if (!Array.isArray(data) || data.length === 0) return {};

  const result = {
    _partyDirectory: {},
  };

  // Case 1: Standard column-based master tab (Row 0 contains Header Names)
  const headers = data[0];
  if (Array.isArray(headers) && headers.length > 0) {
    headers.forEach((header, colIdx) => {
      const cleanHeader = (header || '').toString().trim();
      if (!cleanHeader) return;

      const options = [];
      for (let r = 1; r < data.length; r++) {
        const val = (data[r]?.[colIdx] ?? '').toString().trim();
        if (val && !options.includes(val)) {
          options.push(val);
        }
      }
      if (options.length > 0) {
        result[cleanHeader] = options;
      }
    });

    // Build _partyDirectory by comparing "Party Name", "GST Number", "Delivery Address"
    let partyCol = -1;
    let gstCol = -1;
    let addrCol = -1;
    let headerRowIdx = 0;

    for (let c = 0; c < headers.length; c++) {
      const h = (headers[c] || '').toString().trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      if (h.includes('partyname') || h === 'party' || h === 'parties' || h.includes('customername')) {
        partyCol = c;
      } else if (h.includes('gst') || h.includes('gstin') || h.includes('gstnumber')) {
        gstCol = c;
      } else if (h.includes('deliveryaddress') || h.includes('address') || h.includes('plantaddress') || h.includes('siteaddress')) {
        addrCol = c;
      }
    }

    // If not found in row 0, search in first 5 rows
    if (partyCol === -1) {
      for (let r = 0; r < Math.min(data.length, 5); r++) {
        const row = data[r] || [];
        for (let c = 0; c < row.length; c++) {
          const h = (row[c] || '').toString().trim().toLowerCase().replace(/[^a-z0-9]/g, '');
          if (partyCol === -1 && (h.includes('partyname') || h === 'party' || h === 'parties' || h.includes('customername'))) {
            partyCol = c;
            headerRowIdx = r;
          } else if (gstCol === -1 && (h.includes('gst') || h.includes('gstin'))) {
            gstCol = c;
          } else if (addrCol === -1 && (h.includes('deliveryaddress') || h.includes('address') || h.includes('plantaddress') || h.includes('siteaddress'))) {
            addrCol = c;
          }
        }
        if (partyCol !== -1) break;
      }
    }

    if (partyCol !== -1) {
      for (let r = headerRowIdx + 1; r < data.length; r++) {
        const row = data[r] || [];
        const partyName = (row[partyCol] ?? '').toString().trim();
        if (!partyName) continue;

        const gst = gstCol !== -1 ? (row[gstCol] ?? '').toString().trim() : '';
        const addr = addrCol !== -1 ? (row[addrCol] ?? '').toString().trim() : '';

        result._partyDirectory[partyName.toLowerCase()] = {
          partyName,
          gstNumber: gst,
          address: addr,
        };
      }
    }
  }

  // Case 2: 2-column key-value format (Column 0: Category/Field Name, Column 1: Option Value)
  if (Object.keys(result).length <= 2 && data[0]?.length === 2) {
    for (let r = 0; r < data.length; r++) {
      const category = (data[r]?.[0] ?? '').toString().trim();
      const val = (data[r]?.[1] ?? '').toString().trim();
      if (category && val && !['category', 'type', 'field', 'dropdown'].includes(category.toLowerCase())) {
        if (!result[category]) result[category] = [];
        if (!result[category].includes(val)) {
          result[category].push(val);
        }
      }
    }
  }

  return result;
}

/**
 * Low-level read helper — returns the sheet-shaped 2D array for a table.
 */
async function getFromAppsScript(sheetName) {
  if (FORCE_MOCK) return null;
  return cachedRead(`get:${sheetName}`, () => readSheet(sheetName));
}

/**
 * Write/read helper. Same payload contract the app always used, now backed by
 * Supabase. Any write invalidates the read cache so the next fetch is fresh.
 */
async function sendToAppsScript(payload) {
  if (FORCE_MOCK) return null;
  if (payload.action !== 'read') readCache.clear();
  return sheetRequest(payload);
}

// Admin credentials are kept only for this browser tab (sessionStorage) and are
// re-sent to the secured user-management functions; passwords are never readable.
const ADMIN_CREDS_KEY = 'o2c_admin_session';

function getAdminCreds() {
  try {
    return JSON.parse(sessionStorage.getItem(ADMIN_CREDS_KEY) || 'null');
  } catch {
    return null;
  }
}

const ADMIN_EXPIRED = 'Admin session expired. Please sign out and sign in again as Admin.';

async function callRpc(fn, args) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

/**
 * Public API methods
 */
export const api = {
  isMockMode: FORCE_MOCK,

  // -------------------------------------------------------------
  // FILE UPLOAD (Supabase Storage, public bucket)
  // Returns the file's public URL.
  // -------------------------------------------------------------
  async uploadFile(file) {
    if (!supabase) throw new Error('Supabase is not configured');
    const safeName = (file.name || 'file').replace(/[^A-Za-z0-9._-]/g, '_');
    const path = `${new Date().toISOString().slice(0, 10)}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;
    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, {
      contentType: file.type || undefined,
      cacheControl: '3600',
      upsert: false,
    });
    if (error) throw new Error(error.message);
    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  },

  // -------------------------------------------------------------
  // USERS (admin-only, via secured database functions)
  // -------------------------------------------------------------
  // Username, role and page permissions only; no Admin session needed (used by the MIS page).
  async getOwners() {
    const res = await callRpc('app_list_owners', {});
    if (!res.success) return { success: false, error: res.error, data: [] };
    return {
      success: true,
      data: (res.data || []).map((u) => ({
        username: u.username,
        role: u.role,
        pagePermissions: u.page_permissions,
      })),
    };
  },

  async getUsers() {
    const creds = getAdminCreds();
    if (!creds) return { success: false, error: ADMIN_EXPIRED, data: [] };
    const res = await callRpc('app_list_users', { p_admin_user: creds.u, p_admin_pass: creds.p });
    if (!res.success) return { success: false, error: res.error, data: [] };
    return {
      success: true,
      data: (res.data || []).map((u) => ({
        rowIndex: u.id,
        username: u.username,
        password: '',
        role: u.role,
        firmAccess: u.firm_access,
        pagePermissions: u.page_permissions,
      })),
    };
  },

  async addUser(userData) {
    const creds = getAdminCreds();
    if (!creds) return { success: false, error: ADMIN_EXPIRED };
    const res = await callRpc('app_add_user', {
      p_admin_user: creds.u,
      p_admin_pass: creds.p,
      p_username: userData.username,
      p_password: userData.password,
      p_role: userData.role || 'Staff',
      p_firm_access: userData.firmAccess || 'All',
      p_permissions: userData.pagePermissions || 'All',
    });
    if (!res.success) return { success: false, error: res.error };
    return { success: true, message: 'User added successfully!' };
  },

  async updateUser(rowIndex, userData) {
    const creds = getAdminCreds();
    if (!creds) return { success: false, error: ADMIN_EXPIRED };
    const res = await callRpc('app_update_user', {
      p_admin_user: creds.u,
      p_admin_pass: creds.p,
      p_id: rowIndex,
      p_username: userData.username,
      p_password: userData.password || '',
      p_role: userData.role || 'Staff',
      p_firm_access: userData.firmAccess || 'All',
      p_permissions: userData.pagePermissions || 'All',
    });
    if (!res.success) return { success: false, error: res.error };
    return { success: true, message: 'User updated successfully!' };
  },

  async deleteUser(rowIndex) {
    const creds = getAdminCreds();
    if (!creds) return { success: false, error: ADMIN_EXPIRED };
    const res = await callRpc('app_delete_user', {
      p_admin_user: creds.u,
      p_admin_pass: creds.p,
      p_id: rowIndex,
    });
    if (!res.success) return { success: false, error: res.error };
    return { success: true, message: 'User deleted successfully!' };
  },

  // -------------------------------------------------------------
  // AUTHENTICATION (checked in the database; password hashes never leave it)
  // -------------------------------------------------------------
  async login(username, password) {
    const cleanUser = (username || '').trim();
    const cleanPass = (password || '').trim();

    if (!supabase) {
      return { success: false, message: 'Server is not configured. Please contact the administrator.' };
    }

    const res = await callRpc('app_login', { p_username: cleanUser, p_password: cleanPass });
    if (!res.success) {
      return { success: false, message: 'Could not reach the server. Please check your connection and try again.' };
    }

    const found = res.data;
    if (!found) {
      return { success: false, message: 'Invalid Username or Password.' };
    }

    if (found.role === 'Admin') {
      try {
        sessionStorage.setItem(ADMIN_CREDS_KEY, JSON.stringify({ u: cleanUser, p: cleanPass }));
      } catch { /* sessionStorage unavailable — admin user management will ask to re-login */ }
    } else {
      try { sessionStorage.removeItem(ADMIN_CREDS_KEY); } catch { /* ignore */ }
    }

    return {
      success: true,
      message: 'Login successful',
      user: {
        username: found.username,
        name: found.username,
        role: found.role,
        firmAccess: found.firm_access,
        pagePermissions: found.page_permissions,
        token: 'token_' + Date.now(),
      },
    };
  },

  // -------------------------------------------------------------
  // MASTER DATA (dropdown options + party directory)
  // -------------------------------------------------------------
  async getMasterData() {
    if (!FORCE_MOCK) {
      try {
        const { data, error } = await supabase
          .from('master_sheet')
          .select('data')
          .order('updated_at', { ascending: false })
          .limit(1);
        if (!error && data && data[0] && Array.isArray(data[0].data)) {
          const parsed = parseMasterSheet(data[0].data);
          if (parsed && Object.keys(parsed).length > 0) {
            return { success: true, data: parsed };
          }
        }
      } catch (err) {
        console.warn('Could not fetch Master data:', err);
      }
    }
    return { success: true, data: {} };
  },

  // Raw master matrix (header row + rows) for the Master Data editor
  async getMasterMatrix() {
    if (!supabase) return { success: false, error: 'Supabase is not configured' };
    const { data, error } = await supabase
      .from('master_sheet')
      .select('id, data')
      .order('updated_at', { ascending: false })
      .limit(1);
    if (error) return { success: false, error: error.message };
    if (!data || !data[0]) return { success: false, error: 'Master data not found' };
    return { success: true, id: data[0].id, data: data[0].data };
  },

  async saveMasterData(matrix) {
    if (!supabase) return { success: false, error: 'Supabase is not configured' };
    const current = await this.getMasterMatrix();
    const payload = { data: matrix, updated_at: new Date().toISOString() };
    const { error } = current.success && current.id
      ? await supabase.from('master_sheet').update(payload).eq('id', current.id)
      : await supabase.from('master_sheet').insert(payload);
    if (error) return { success: false, error: error.message };
    return { success: true };
  },

  // -------------------------------------------------------------
  // ORDERS / FMS TAB OPERATIONS (Exact 37 Columns starting from Row 7)
  // -------------------------------------------------------------
  async getOrders() {
    if (!FORCE_MOCK) {
      // First attempt to read from 'FMS' tab, fallback to 'Orders'
      let res = await getFromAppsScript('FMS');
      let targetTab = 'FMS';
      if (!res || !res.success || !Array.isArray(res.data) || res.data.length === 0) {
        res = await getFromAppsScript('Orders');
        targetTab = 'Orders';
      }

      if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {

        // ── Find header row (scan first 7 rows) ───────────────────────────────
        let headerRowIdx = -1;
        let colMap = {}; // { 'fieldKey': columnIndex (0-based) }

        // Map of header text (lowercase) → JS field key
        const HEADER_MAP = {
          'timestamp'                                     : 'timestamp',
          'do-delivery order no.'                         : 'doNumber',
          'party po no (as per po exact)'                 : 'partyPoNo',
          'party po date'                                 : 'partyPoDate',
          'party names'                                   : 'partyNames',
          'product name'                                  : 'productName',
          'quantity'                                      : 'quantity',
          'rate of material'                              : 'rateOfMaterial',
          'type of transporting'                          : 'typeOfTransporting',
          'upload so'                                     : 'uploadSo',
          'is this order through some agent'              : 'isThroughAgent',
          'order received from'                           : 'orderReceivedFrom',
          'type of measurement'                           : 'typeOfMeasurement',
          'contact person name'                           : 'contactPersonName',
          'contact person whatsapp no.'                   : 'contactPersonWhatsapp',
          'alumina%'                                      : 'aluminaPct',
          'iron%'                                         : 'ironPct',
          'type of pi'                                    : 'typeOfPi',
          'lead time for collection of final payment'     : 'leadTimeFinalPayment',
          'type of application'                           : 'typeOfApplication',
          'customer category'                             : 'customerCategory',
          'free replacement (foc)'                        : 'freeReplacementFoc',
          'gst number'                                    : 'gstNumber',
          'address'                                       : 'address',
          'firm name'                                     : 'firmName',
          'total po basic value'                          : 'totalPoBasicValue',
          'payment to be taken'                           : 'paymentToBeTaken',
          'advance'                                       : 'advance',
          'basic'                                         : 'basic',
          'retention payment'                             : 'retentionPayment',
          'retention percentage'                          : 'retentionPercentage',
          'lead time for retention'                       : 'leadTimeRetention',
          'specific concern'                              : 'specificConcern',
          'reference no.'                                 : 'referenceNo',
          'adjusted amount'                               : 'adjustedAmount',
          'total po value'                                : 'totalPoValue',
          'sales person name'                             : 'salesPersonName',
          'tc required'                                   : 'tcRequired',
          'planned 1'                                     : 'planned1',
          'planned 2'                                     : 'planned2',
          'planned 3'                                     : 'planned3',
          'planned 4'                                     : 'planned4',
          'actual 1'                                      : 'actual1',
          'expected delivery date'                        : 'expectedDeliveryDate',
          'status 1'                                      : 'status1',
          'remark 1'                                      : 'remark1',
          'actual 2'                                      : 'actual2',
          'status 2'                                      : 'status2',
          'remark 2'                                      : 'remark2',
          'actual 3'                                      : 'actual3',
          'status 3'                                      : 'status3',
          'remark 3'                                      : 'remark3',
          'in stock or not'                               : 'inStockOrNot',
          'self order no/ indent no.'                     : 'selfOrderNoIndentNo',
          'self order no / indent no.'                    : 'selfOrderNoIndentNo',
          'order number of the production'                : 'orderNumberOfProduction',
          'order number of production'                    : 'orderNumberOfProduction',
          'qty transfered'                                : 'qtyTransferred',
          'qty transferred'                               : 'qtyTransferred',
          'batch number in remarks'                       : 'batchNumberRemarks',
          'batch number remarks'                          : 'batchNumberRemarks',
          'gp %'                                          : 'gpPercent',
          'gp%'                                           : 'gpPercent',
        };

        for (let r = 0; r < Math.min(res.data.length, 7); r++) {
          const rowArr = res.data[r] || [];
          const rowStr = JSON.stringify(rowArr).toUpperCase();
          if (rowStr.includes('DO-DELIVERY') || rowStr.includes('PARTY PO NO') || rowStr.includes('PARTY NAMES')) {
            headerRowIdx = r;
            rowArr.forEach((cell, cIdx) => {
              const cleanHdr = (cell || '').toString().trim().toLowerCase();
              if (cleanHdr) {
                if (HEADER_MAP[cleanHdr]) {
                  colMap[HEADER_MAP[cleanHdr]] = cIdx;
                }
                colMap[cleanHdr] = cIdx;
              }
            });
            break;
          }
        }

        // ── Determine data start index ─────────────────────────────────────
        let startIdx = headerRowIdx >= 0 ? headerRowIdx + 1 : (targetTab === 'FMS' ? 6 : 1);
        if (targetTab === 'FMS' && startIdx < 6) startIdx = 6;

        if (res.data.length <= startIdx) {
          return { success: true, data: [] };
        }

        // Helper to read a field from a row by mapped column index
        const col = (row, fieldKey, fallback = '') => {
          const idx = colMap[fieldKey];
          if (idx === undefined) return fallback;
          const val = row[idx];
          return val !== undefined && val !== null ? val : fallback;
        };

        const orders = [];
        for (let i = startIdx; i < res.data.length; i++) {
          const row = res.data[i];

          // If header map was not found fall back to positional (col 1 = doNumber)
          const doNo = headerRowIdx >= 0
            ? (col(row, 'doNumber') || '').toString().trim()
            : (row[0] || '').toString().trim();

          const partyPoNo = headerRowIdx >= 0 ? col(row, 'partyPoNo') : row[1];
          const partyNames = headerRowIdx >= 0 ? col(row, 'partyNames') : row[3];

          if (!doNo && !partyPoNo && !partyNames) continue; // skip empty rows

          orders.push({
            rowIndex       : i + 1,
            timestamp      : formatTimestamp(col(row, 'timestamp', '')),
            doNumber       : doNo,
            // Sheet cells that look numeric (e.g. a purely-digit PO No.) come back
            // as JS numbers, not strings — coerce so downstream .trim()/.toLowerCase() are safe.
            partyPoNo      : String(col(row, 'partyPoNo', '') ?? '').trim(),
            partyPoDate    : formatAppDate(col(row, 'partyPoDate', '')),
            partyNames     : String(col(row, 'partyNames', '') ?? '').trim(),
            productName    : col(row, 'productName', ''),
            quantity       : Number(col(row, 'quantity', 0)) || 0,
            rateOfMaterial : Number(col(row, 'rateOfMaterial', 0)) || 0,
            typeOfTransporting   : col(row, 'typeOfTransporting', ''),
            uploadSo             : col(row, 'uploadSo', ''),
            isThroughAgent       : col(row, 'isThroughAgent', 'No'),
            orderReceivedFrom    : col(row, 'orderReceivedFrom', ''),
            typeOfMeasurement    : col(row, 'typeOfMeasurement', ''),
            contactPersonName    : col(row, 'contactPersonName', ''),
            contactPersonWhatsapp: col(row, 'contactPersonWhatsapp', ''),
            aluminaPct           : col(row, 'aluminaPct', ''),
            ironPct              : col(row, 'ironPct', ''),
            typeOfPi             : col(row, 'typeOfPi', ''),
            leadTimeFinalPayment : col(row, 'leadTimeFinalPayment', ''),
            typeOfApplication    : col(row, 'typeOfApplication', ''),
            customerCategory     : col(row, 'customerCategory', ''),
            freeReplacementFoc   : col(row, 'freeReplacementFoc', 'No'),
            gstNumber            : col(row, 'gstNumber', ''),
            address              : col(row, 'address', ''),
            firmName             : col(row, 'firmName', ''),
            totalPoBasicValue    : Number(col(row, 'totalPoBasicValue', 0)) || 0,
            paymentToBeTaken     : col(row, 'paymentToBeTaken', ''),
            advance              : Number(col(row, 'advance', 0)) || 0,
            basic                : Number(col(row, 'basic', 0)) || 0,
            retentionPayment     : col(row, 'retentionPayment', 'No'),
            retentionPercentage  : col(row, 'retentionPercentage', ''),
            leadTimeRetention    : col(row, 'leadTimeRetention', ''),
            specificConcern      : col(row, 'specificConcern', ''),
            referenceNo          : col(row, 'referenceNo', ''),
            adjustedAmount       : Number(col(row, 'adjustedAmount', 0)) || 0,
            totalPoValue         : Number(col(row, 'totalPoValue', 0)) || 0,
            salesPersonName      : col(row, 'salesPersonName', ''),
            tcRequired           : col(row, 'tcRequired', 'No'),

            // Stage 1 Workflow fields (Check PO)
            planned1             : formatAppDate(col(row, 'planned1', col(row, 'planned 1', ''))),
            planned2             : formatAppDate(col(row, 'planned2', col(row, 'planned 2', ''))),
            planned3             : formatAppDate(col(row, 'planned3', col(row, 'planned 3', ''))),
            planned4             : formatAppDate(col(row, 'planned4', col(row, 'planned 4', ''))),
            actual1              : formatAppDate(col(row, 'actual1', col(row, 'actual 1', ''))),
            expectedDeliveryDate : formatAppDate(col(row, 'expectedDeliveryDate', col(row, 'expected delivery date', ''))),
            status1              : col(row, 'status1', col(row, 'status 1', '')),
            remark1              : col(row, 'remark1', col(row, 'remark 1', '')),

            // Stage 2 Workflow fields (Received Accounts)
            actual2              : formatAppDate(col(row, 'actual2', col(row, 'actual 2', ''))),
            status2              : col(row, 'status2', col(row, 'status 2', '')),
            remark2              : col(row, 'remark2', col(row, 'remark 2', '')),

            // Stage 3 Workflow fields (Check for Delivery)
            actual3              : formatAppDate(col(row, 'actual3', col(row, 'actual 3', ''))),
            status3              : col(row, 'status3', col(row, 'status 3', '')),
            remark3              : col(row, 'remark3', col(row, 'remark 3', '')),
            inStockOrNot         : col(row, 'inStockOrNot', col(row, 'in stock or not', '')),
            selfOrderNoIndentNo  : col(row, 'selfOrderNoIndentNo', col(row, 'self order no/ indent no.', '')),
            orderNumberOfProduction: col(row, 'orderNumberOfProduction', col(row, 'order number of the production', '')),
            qtyTransferred       : col(row, 'qtyTransferred', col(row, 'qty transfered', '')),
            batchNumberRemarks   : col(row, 'batchNumberRemarks', col(row, 'batch number in remarks', '')),
            gpPercent            : col(row, 'gpPercent', col(row, 'gp %', '')),

            // Dashboard compatibility aliases
            orderId     : doNo || `ORD-${i}`,
            customerName: col(row, 'partyNames', ''),
            product     : col(row, 'productName', ''),
            amount      : Number(col(row, 'totalPoValue', 0)) || Number(col(row, 'totalPoBasicValue', 0)) || 0,
            orderDate   : formatAppDate(col(row, 'partyPoDate', '')),
            status      : 'Active',
          });
        }
        return { success: true, data: orders };
      }
    }

    // Return empty array when no orders in sheet
    return { success: true, data: [] };
  },

  async addOrder(orderData) {
    const doNumber = orderData.doNumber || 'DO-001';

    // Header-name keyed object — Apps Script finds the right column by header name.
    // Key names MUST exactly match the header row in the FMS Google Sheet.
    const rowDataObj = {
      'DO-Delivery Order No.'                       : doNumber,
      'PARTY PO NO (As Per Po Exact)'               : orderData.partyPoNo || '',
      'Party PO Date'                               : orderData.partyPoDate || '',
      'Party Names'                                 : orderData.partyNames || '',
      'Product Name'                                : orderData.productName || '',
      'Quantity'                                    : Number(orderData.quantity) || 0,
      'Rate Of Material'                            : Number(orderData.rateOfMaterial) || 0,
      'Type Of Transporting'                        : orderData.typeOfTransporting || '',
      'Upload SO'                                   : orderData.uploadSo || '',
      'Is This Order Through Some Agent'            : orderData.isThroughAgent || 'No',
      'Order Received From'                         : orderData.orderReceivedFrom || '',
      'Type Of Measurement'                         : orderData.typeOfMeasurement || '',
      'Contact Person Name'                         : orderData.contactPersonName || '',
      'Contact Person WhatsApp No.'                 : orderData.contactPersonWhatsapp || '',
      'Alumina%'                                    : orderData.aluminaPct || '',
      'Iron%'                                       : orderData.ironPct || '',
      'Type Of PI'                                  : orderData.typeOfPi || '',
      'Lead Time For Collection Of Final Payment'   : orderData.leadTimeFinalPayment || '',
      'Type Of Application'                         : orderData.typeOfApplication || '',
      'Customer Category'                           : orderData.customerCategory || '',
      'Free Replacement (FOC)'                      : orderData.freeReplacementFoc || 'No',
      'Gst Number'                                  : orderData.gstNumber || '',
      'Address'                                     : orderData.address || '',
      'Firm Name'                                   : orderData.firmName || '',
      'Total PO Basic Value'                        : Number(orderData.totalPoBasicValue) || 0,
      'Payment to Be Taken'                         : orderData.paymentToBeTaken || '',
      'Advance'                                     : Number(orderData.advance) || 0,
      'Basic'                                       : Number(orderData.basic) || 0,
      'Retention Payment'                           : orderData.retentionPayment || 'No',
      'Retention Percentage'                        : orderData.retentionPercentage || '',
      'Lead Time for Retention'                     : orderData.leadTimeRetention || '',
      'Specific Concern'                            : orderData.specificConcern || '',
      'Reference No.'                               : orderData.referenceNo || '',
      'Adjusted Amount'                             : Number(orderData.adjustedAmount) || 0,
      'Total PO Value'                              : Number(orderData.totalPoValue) || 0,
      'Sales Person Name'                           : orderData.salesPersonName || '',
      'TC Required'                                 : orderData.tcRequired || 'No',
      // 'Timestamp' is auto-added server-side by Apps Script
    };

    if (!FORCE_MOCK) {
      const res = await sendToAppsScript({
        action: 'insert',
        sheetName: 'FMS',
        rowDataObj: JSON.stringify(rowDataObj),
      });
      if (res && res.success) {
        return { success: true, message: 'Order inserted into FMS sheet successfully!' };
      }
      return { success: false, error: res?.error || 'Failed to insert into FMS sheet' };
    }

    const newOrder = {
      ...orderData,
      doNumber,
      orderId: doNumber,
      customerName: orderData.partyNames,
      product: orderData.productName,
      amount: Number(orderData.totalPoValue) || Number(orderData.totalPoBasicValue) || 0,
      orderDate: orderData.partyPoDate,
      rowIndex: 7,
    };
    saveStoredMockOrders([newOrder]);
    return { success: true, message: 'Order saved successfully' };
  },

  async updateOrder(rowIndex, orderData) {
    // Exactly 37 columns in order
    const rowData = [
      orderData.doNumber || '',
      orderData.partyPoNo || '',
      orderData.partyPoDate || '',
      orderData.partyNames || '',
      orderData.productName || '',
      Number(orderData.quantity) || 0,
      Number(orderData.rateOfMaterial) || 0,
      orderData.typeOfTransporting || '',
      orderData.uploadSo || '',
      orderData.isThroughAgent || 'No',
      orderData.orderReceivedFrom || '',
      orderData.typeOfMeasurement || 'MT',
      orderData.contactPersonName || '',
      orderData.contactPersonWhatsapp || '',
      orderData.aluminaPct || '',
      orderData.ironPct || '',
      orderData.typeOfPi || '',
      orderData.leadTimeFinalPayment || '',
      orderData.typeOfApplication || '',
      orderData.customerCategory || '',
      orderData.freeReplacementFoc || 'No',
      orderData.gstNumber || '',
      orderData.address || '',
      orderData.firmName || '',
      Number(orderData.totalPoBasicValue) || 0,
      orderData.paymentToBeTaken || '',
      Number(orderData.advance) || 0,
      Number(orderData.basic) || 0,
      orderData.retentionPayment || 'No',
      orderData.retentionPercentage || '',
      orderData.leadTimeRetention || '',
      orderData.specificConcern || '',
      orderData.referenceNo || '',
      Number(orderData.adjustedAmount) || 0,
      Number(orderData.totalPoValue) || 0,
      orderData.salesPersonName || '',
      orderData.tcRequired || 'No',
    ];

    if (!FORCE_MOCK) {
      const res = await sendToAppsScript({
        action: 'update',
        sheetName: 'FMS',
        rowIndex: rowIndex,
        rowData: JSON.stringify(rowData),
      });
      if (res && res.success) {
        return { success: true, message: 'Order updated in FMS sheet successfully!' };
      }
      return { success: false, error: res?.error || 'Failed to update FMS sheet' };
    }

    return { success: true, message: 'Order updated successfully' };
  },

  async updateOrderFields(rowIndex, fieldsObj, doNumber) {
    if (!FORCE_MOCK) {
      const res = await sendToAppsScript({
        action: 'update',
        sheetName: 'FMS',
        rowIndex: rowIndex,
        doNumber: doNumber || '',
        rowDataObj: JSON.stringify(fieldsObj),
      });
      if (res && res.success) {
        return { success: true, message: 'Order updated in FMS sheet successfully!' };
      }
      return { success: false, error: res?.error || 'Failed to update FMS sheet' };
    }

    const orders = getStoredMockOrders();
    const idx = orders.findIndex((o) => o.rowIndex === rowIndex || (doNumber && o.doNumber === doNumber));
    if (idx !== -1) {
      orders[idx] = {
        ...orders[idx],
        ...fieldsObj,
        actual1: fieldsObj['Actual 1'] || orders[idx].actual1,
        expectedDeliveryDate: fieldsObj['Expected Delivery Date'] || orders[idx].expectedDeliveryDate,
        status1: fieldsObj['Status 1'] || orders[idx].status1,
        remark1: fieldsObj['Remark 1'] || orders[idx].remark1,
      };
      saveStoredMockOrders(orders);
    }
    return { success: true, message: 'Order updated successfully' };
  },

  async deleteOrder(rowIndex) {
    if (!FORCE_MOCK) {
      const res = await sendToAppsScript({
        action: 'delete',
        sheetName: 'FMS',
        rowIndex: rowIndex,
      });
      if (res && res.success) {
        return { success: true, message: 'Order deleted from FMS sheet successfully!' };
      }
      return { success: false, error: res?.error || 'Failed to delete from FMS sheet' };
    }

    return { success: true, message: 'Order deleted successfully' };
  },

  // Arrange Logistics submissions are written to the real 'Billing' sheet tab —
  // it already carries the Dispatch No./LGST-Sr Number/Transporter columns this needs.
  async getLogisticsEntries() {
    if (!FORCE_MOCK) {
      try {
        const res = await cachedRead('read:Billing', () => sendToAppsScript({
          action: 'read',
          sheet: 'Billing',
        }));
        if (res && res.success && Array.isArray(res.data)) {
          let headerRowIdx = 5; // Default row 6 (0-indexed 5)
          const colMap = {};
          for (let r = 0; r < Math.min(res.data.length, 7); r++) {
            const rowArr = res.data[r] || [];
            const rowStr = JSON.stringify(rowArr).toUpperCase();
            if (rowStr.includes('DISPATCH NO') || rowStr.includes('LGST-SR NUMBER') || rowStr.includes('TRANSPORTER NAME')) {
              headerRowIdx = r;
              rowArr.forEach((cell, cIdx) => {
                const cleanHdr = (cell || '').toString().trim().toLowerCase();
                if (cleanHdr) {
                  colMap[cleanHdr] = cIdx;
                }
              });
              break;
            }
          }

          const entries = [];
          let maxLgstSeq = 0;
          for (let i = headerRowIdx + 1; i < res.data.length; i++) {
            const row = res.data[i];
            if (!row || row.length === 0 || !row.some((c) => c !== null && c !== '')) continue;
            const dispatchNo = (row[colMap['dispatch no.']] ?? '').toString().trim();
            const lgstNo = (row[colMap['lgst-sr number']] ?? '').toString().trim();
            const partyPoNumber = (row[colMap['party po number']] ?? '').toString().trim();
            if (!dispatchNo && !lgstNo) continue;

            {
              const m = lgstNo.match(/LGST-(\d+)/i);
              if (m) {
                const num = parseInt(m[1], 10);
                if (num > maxLgstSeq) maxLgstSeq = num;
              }
            }

            entries.push({
              rowIndex: i + 1,
              timestamp: formatAppDate(row[colMap['timestamp']] || ''),
              doNumber: (row[colMap['delivery order no']] ?? '').toString().trim(),
              dispatchNo,
              partyName: (row[colMap['party name']] ?? '').toString().trim(),
              productName: (row[colMap['product name']] ?? '').toString().trim(),
              typeOfTransporting: (row[colMap['type of transporting']] ?? '').toString().trim(),
              typeOfRate: (row[colMap['type of rate']] ?? '').toString().trim(),
              transporterName: (row[colMap['transporter name']] ?? '').toString().trim(),
              truckNo: (row[colMap['truck no.']] ?? '').toString().trim(),
              vehiclePlateImage: (row[colMap['vehicle no. plate image']] ?? '').toString().trim(),
              driverMobileNo: (row[colMap['driver mobile no.']] ?? '').toString().trim(),
              biltyNo: (row[colMap['bilty no.']] ?? '').toString().trim(),
              actualTruckQty: (row[colMap['actual truck qty']] ?? '').toString().trim(),
              transportRatePerMt: (row[colMap['transport rate @per matric ton  ']] ?? row[colMap['transport rate @per matric ton']] ?? '').toString().trim(),
              fixedAmount: (row[colMap['fixed amount']] ?? '').toString().trim(),
              partyPoNumber,
              partyPoDate: formatAppDate(row[colMap['party po date']] || ''),
              partyPoCopy: (row[colMap['party po copy']] ?? '').toString().trim(),
              rateOfMaterial: (row[colMap['rate of material']] ?? '').toString().trim(),
              lgstNo,
              // Load Material stage
              loadPlanned: formatAppDate(row[colMap['planned']] || ''),
              loadActual: formatAppDate(row[colMap['actual']] || ''),
              loadImage1: (row[colMap['load iamge 1']] ?? '').toString().trim(),
              loadImage2: (row[colMap['load iamge 2']] ?? '').toString().trim(),
              // Weighment Entry stage
              weighmentPlanned: formatAppDate(row[colMap['planned2']] || ''),
              weighmentActual: formatAppDate(row[colMap['actual2']] || ''),
              weighmentImage1: (row[colMap['weighment  iamge 1']] ?? '').toString().trim(),
              weighmentImage2: (row[colMap['weighment  iamge 2']] ?? '').toString().trim(),
              weighmentImage3: (row[colMap['weighment  iamge 3']] ?? '').toString().trim(),
              // Make Invoice stage
              invoicePlanned: formatAppDate(row[colMap['planned 3']] || ''),
              invoiceActual: formatAppDate(row[colMap['actual 3']] || ''),
              billNo: (row[colMap['bill no.']] ?? '').toString().trim(),
              billCopy: (row[colMap['bill copy']] ?? '').toString().trim(),
              // Sales Form 3 stage
              salesFormPlanned: formatAppDate(row[colMap['planned 4']] || ''),
              salesFormActual: formatAppDate(row[colMap['actual 4']] || ''),
              salesFormStatus: (row[colMap['status4']] ?? '').toString().trim(),
              // Entry In Bilty stage
              biltyEntryPlanned: formatAppDate(row[colMap['planned 5']] || ''),
              biltyEntryActual: formatAppDate(row[colMap['actual 5']] || ''),
              biltyEntryNo: (row[colMap['bilty no.5']] ?? '').toString().trim(),
              biltyEntryCopy: (row[colMap['bilty copy']] ?? '').toString().trim(),
              // Make & Send Test Certificate stage
              tcPlanned: formatAppDate(row[colMap['planned 6']] || ''),
              tcActual: formatAppDate(row[colMap['actual 6']] || ''),
              tcCopy: (row[colMap['tc copy']] ?? '').toString().trim(),
              // Party Get Report stage
              reportPlanned: formatAppDate(row[colMap['planned 7']] || ''),
              reportActual: formatAppDate(row[colMap['actual 7']] || ''),
              receivedDate: formatAppDate(row[colMap['received date']] || ''),
              receivedCopyImage: (row[colMap['image of received copy']] ?? '').toString().trim(),
              grnNumber: (row[colMap['grn number']] ?? '').toString().trim(),
              // Full Kitting stage
              kittingPlanned: formatAppDate(row[colMap['planned 8']] || ''),
              kittingActual: formatAppDate(row[colMap['actual 8']] || ''),
              kittingStatus: (row[colMap['status8']] ?? '').toString().trim(),
            });
          }

          return { success: true, data: entries, maxLgstSeq };
        }
      } catch (err) {
        console.warn('Error reading Billing/logistics entries:', err);
      }
    }
    return { success: true, data: [], maxLgstSeq: 0 };
  },

  // Full Kitting ("Status: Yes") submissions are written to the real 'Full Kitting'
  // sheet tab, one row per product, carrying forward the transporter details already
  // captured during Arrange Logistics plus the newly-entered Transport Amount.
  async getFullKittingEntries() {
    if (!FORCE_MOCK) {
      try {
        const res = await cachedRead('read:Full Kitting', () => sendToAppsScript({
          action: 'read',
          sheet: 'Full Kitting',
        }));
        if (res && res.success && Array.isArray(res.data)) {
          let headerRowIdx = 5;
          const colMap = {};
          for (let r = 0; r < Math.min(res.data.length, 7); r++) {
            const rowArr = res.data[r] || [];
            const rowStr = JSON.stringify(rowArr).toUpperCase();
            if (rowStr.includes('DELIVERY ORDER') || rowStr.includes('LGST-SR NUMBER') || rowStr.includes('TRANSPORT AMOUNT')) {
              headerRowIdx = r;
              rowArr.forEach((cell, cIdx) => {
                const cleanHdr = (cell || '').toString().trim().toLowerCase();
                if (cleanHdr) {
                  colMap[cleanHdr] = cIdx;
                }
              });
              break;
            }
          }

          const entries = [];
          for (let i = headerRowIdx + 1; i < res.data.length; i++) {
            const row = res.data[i];
            if (!row || row.length === 0 || !row.some((c) => c !== null && c !== '')) continue;
            const lgstNo = (row[colMap['lgst-sr number']] ?? '').toString().trim();
            const doNo = (row[colMap['delivery order no']] ?? '').toString().trim();
            if (!doNo && !lgstNo) continue;

            entries.push({
              rowIndex: i + 1,
              timestamp: formatAppDate(row[colMap['timestamp']] || ''),
              doNumber: doNo,
              lgstNo,
              partyName: (row[colMap['party name']] ?? '').toString().trim(),
              typeOfTransporting: (row[colMap['type of transporting']] ?? '').toString().trim(),
              transporterName: (row[colMap['transporter name']] ?? '').toString().trim(),
              truckNo: (row[colMap['truck no.']] ?? '').toString().trim(),
              vehiclePlateImage: (row[colMap['vehicle no. plate image']] ?? '').toString().trim(),
              driverMobileNo: (row[colMap['driver mobile no.']] ?? '').toString().trim(),
              biltyNo: (row[colMap['bilty no.']] ?? '').toString().trim(),
              actualTruckQty: (row[colMap['actual truck qty']] ?? '').toString().trim(),
              typeOfRate: (row[colMap['type of rate']] ?? '').toString().trim(),
              transportRatePerMt: (row[colMap['transport rate @per matric ton  ']] ?? row[colMap['transport rate @per matric ton']] ?? '').toString().trim(),
              fixedAmount: (row[colMap['fixed amount']] ?? '').toString().trim(),
              transportAmount: (row[colMap['transport amount']] ?? '').toString().trim(),
            });
          }

          return { success: true, data: entries };
        }
      } catch (err) {
        console.warn('Error reading Full Kitting entries:', err);
      }
    }
    return { success: true, data: [] };
  },

  async insertFullKittingRows(rows) {
    if (!FORCE_MOCK) {
      for (const rowObj of rows) {
        const res = await sendToAppsScript({
          action: 'insert',
          sheetName: 'Full Kitting',
          rowDataObj: JSON.stringify(rowObj),
        });
        if (!res || !res.success) {
          return { success: false, error: res?.error || 'Failed to insert row into Full Kitting' };
        }
      }
      return { success: true, message: `Successfully inserted ${rows.length} rows into Full Kitting` };
    }
    return { success: true, message: 'Inserted into mock' };
  },

  async insertLogisticsRows(rows) {
    if (!FORCE_MOCK) {
      for (const rowObj of rows) {
        const res = await sendToAppsScript({
          action: 'insert',
          sheetName: 'Billing',
          rowDataObj: JSON.stringify(rowObj),
        });
        if (!res || !res.success) {
          return { success: false, error: res?.error || 'Failed to insert row into Billing' };
        }
      }
      return { success: true, message: `Successfully inserted ${rows.length} rows into Billing` };
    }
    return { success: true, message: 'Inserted into mock' };
  },

  async updateBillingFields(rowIndex, fieldsObj) {
    if (!FORCE_MOCK) {
      const res = await sendToAppsScript({
        action: 'update',
        sheetName: 'Billing',
        rowIndex: rowIndex,
        rowDataObj: JSON.stringify(fieldsObj),
      });
      if (res && res.success) {
        return { success: true, message: 'Billing sheet updated successfully!' };
      }
      return { success: false, error: res?.error || 'Failed to update Billing sheet' };
    }
    return { success: true, message: 'Updated in mock' };
  },

  async getDispatchEntries() {
    if (!FORCE_MOCK) {
      try {
        const res = await cachedRead('read:Dispatch', () => sendToAppsScript({
          action: 'read',
          sheet: 'Dispatch',
        }));
        if (res && res.success && Array.isArray(res.data)) {
          let headerRowIdx = 5; // Default row 6 (0-indexed 5)
          const colMap = {};
          for (let r = 0; r < Math.min(res.data.length, 7); r++) {
            const rowArr = res.data[r] || [];
            const rowStr = JSON.stringify(rowArr).toUpperCase();
            if (rowStr.includes('DELIVERY ORDER') || rowStr.includes('D NUMBER') || rowStr.includes('QTY TO BE DISPATCHED')) {
              headerRowIdx = r;
              rowArr.forEach((cell, cIdx) => {
                const cleanHdr = (cell || '').toString().trim().toLowerCase();
                if (cleanHdr) {
                  colMap[cleanHdr] = cIdx;
                }
              });
              break;
            }
          }

          const entries = [];
          let maxDSeq = 0;
          for (let i = headerRowIdx + 1; i < res.data.length; i++) {
            const row = res.data[i];
            if (!row || row.length === 0 || !row.some((c) => c !== null && c !== '')) continue;
            const doNo = (row[colMap['delivery order no.']] ?? '').toString().trim();
            const dNo = (row[colMap['d number']] ?? '').toString().trim();
            if (!doNo && !dNo) continue;

            const m = dNo.match(/D-(\d+)/i);
            if (m) {
              const num = parseInt(m[1], 10);
              if (num > maxDSeq) maxDSeq = num;
            }

            entries.push({
              rowIndex: i + 1,
              timestamp: formatAppDate(row[colMap['timestamp']] || ''),
              dNumber: dNo,
              doNumber: doNo,
              partyName: (row[colMap['party name']] ?? '').toString().trim(),
              productName: (row[colMap['product name']] ?? '').toString().trim(),
              qtyToBeDispatched: (row[colMap['qty to be dispatched']] ?? '').toString().trim(),
              typeOfTransporting: (row[colMap['type of transporting']] ?? '').toString().trim(),
              dateOfDispatch: formatAppDate(row[colMap['date of dispatch']] || ''),
              plannedLogistics: formatAppDate(row[colMap['planned 2']] || ''),
            });
          }

          return { success: true, data: entries, maxDSeq };
        }
      } catch (err) {
        console.warn('Error reading Dispatch entries:', err);
      }
    }
    return { success: true, data: [], maxDSeq: 0 };
  },

  async insertDispatchRows(rows) {
    if (!FORCE_MOCK) {
      for (const rowObj of rows) {
        const res = await sendToAppsScript({
          action: 'insert',
          sheetName: 'Dispatch',
          rowDataObj: JSON.stringify(rowObj),
        });
        if (!res || !res.success) {
          return { success: false, error: res?.error || 'Failed to insert row into Dispatch' };
        }
      }
      return { success: true, message: `Successfully inserted ${rows.length} rows into Dispatch` };
    }
    return { success: true, message: 'Inserted into mock' };
  },

  // Order Cancel requests are written to a dedicated 'Order Cancel' sheet tab —
  // the requester fills Timestamp/Cancel No./DO/Party/Product/Qty/Reason, and
  // Mgmt Approval later fills Actual + Status (Planned/Time Delay are sheet formulas).
  async getOrderCancelEntries() {
    if (!FORCE_MOCK) {
      try {
        const res = await cachedRead('read:Order Cancel', () => sendToAppsScript({
          action: 'read',
          sheet: 'Order Cancel',
        }));
        if (res && res.success && Array.isArray(res.data)) {
          let headerRowIdx = 5; // Default row 6 (0-indexed 5)
          const colMap = {};
          for (let r = 0; r < Math.min(res.data.length, 7); r++) {
            const rowArr = res.data[r] || [];
            const rowStr = JSON.stringify(rowArr).toUpperCase();
            if (rowStr.includes('CANCEL NO') || rowStr.includes('DO-DELIVERY ORDER NO') || rowStr.includes('REASON')) {
              headerRowIdx = r;
              rowArr.forEach((cell, cIdx) => {
                const cleanHdr = (cell || '').toString().trim().toLowerCase();
                if (cleanHdr) {
                  colMap[cleanHdr] = cIdx;
                }
              });
              break;
            }
          }

          const entries = [];
          let maxCancelSeq = 0;
          for (let i = headerRowIdx + 1; i < res.data.length; i++) {
            const row = res.data[i];
            if (!row || row.length === 0 || !row.some((c) => c !== null && c !== '')) continue;
            const cancelNo = (row[colMap['cancel no.']] ?? '').toString().trim();
            const doNumber = (row[colMap['do-delivery order no.']] ?? '').toString().trim();
            if (!cancelNo && !doNumber) continue;

            const m = cancelNo.match(/CANC-(\d+)/i);
            if (m) {
              const num = parseInt(m[1], 10);
              if (num > maxCancelSeq) maxCancelSeq = num;
            }

            entries.push({
              rowIndex: i + 1,
              timestamp: formatAppDate(row[colMap['timestamp']] || ''),
              cancelNo,
              doNumber,
              partyNames: (row[colMap['party names']] ?? '').toString().trim(),
              productName: (row[colMap['product name']] ?? '').toString().trim(),
              qty: (row[colMap['qty']] ?? '').toString().trim(),
              reason: (row[colMap['reason']] ?? '').toString().trim(),
              planned: formatAppDate(row[colMap['planned']] || ''),
              actual: formatAppDate(row[colMap['actual']] || ''),
              timeDelay: (row[colMap['time delay']] ?? '').toString().trim(),
              status: (row[colMap['status']] ?? '').toString().trim(),
            });
          }

          return { success: true, data: entries, maxCancelSeq };
        }
      } catch (err) {
        console.warn('Error reading Order Cancel entries:', err);
      }
    }
    return { success: true, data: [], maxCancelSeq: 0 };
  },

  async insertOrderCancelRows(rows) {
    if (!FORCE_MOCK) {
      for (const rowObj of rows) {
        const res = await sendToAppsScript({
          action: 'insert',
          sheetName: 'Order Cancel',
          rowDataObj: JSON.stringify(rowObj),
        });
        if (!res || !res.success) {
          return { success: false, error: res?.error || 'Failed to insert row into Order Cancel' };
        }
      }
      return { success: true, message: `Successfully inserted ${rows.length} rows into Order Cancel` };
    }
    return { success: true, message: 'Inserted into mock' };
  },

  async updateOrderCancelFields(rowIndex, fieldsObj) {
    if (!FORCE_MOCK) {
      const res = await sendToAppsScript({
        action: 'update',
        sheetName: 'Order Cancel',
        rowIndex: rowIndex,
        rowDataObj: JSON.stringify(fieldsObj),
      });
      if (res && res.success) {
        return { success: true, message: 'Order Cancel sheet updated successfully!' };
      }
      return { success: false, error: res?.error || 'Failed to update Order Cancel sheet' };
    }
    return { success: true, message: 'Updated in mock' };
  },

  // Material Return requests are written to a dedicated 'Material Return' sheet
  // tab — the requester fills Return details, then 4 sequential stages (Arrange
  // Logistics, Received From Party, Issue Note, Send To Party) each fill their
  // own Actual1-4/Status4 columns (Planned/Time Delay are sheet formulas).
  async getMaterialReturnEntries() {
    if (!FORCE_MOCK) {
      try {
        const res = await cachedRead('read:Material Return', () => sendToAppsScript({
          action: 'read',
          sheet: 'Material Return',
        }));
        if (res && res.success && Array.isArray(res.data)) {
          let headerRowIdx = 5; // Default row 6 (0-indexed 5)
          const colMap = {};
          for (let r = 0; r < Math.min(res.data.length, 7); r++) {
            const rowArr = res.data[r] || [];
            const rowStr = JSON.stringify(rowArr).toUpperCase();
            if (rowStr.includes('RETURN NO') || rowStr.includes('DO-DELIVERY ORDER NO') || rowStr.includes('MATERIAL RETURN')) {
              headerRowIdx = r;
              rowArr.forEach((cell, cIdx) => {
                const cleanHdr = (cell || '').toString().trim().toLowerCase();
                if (cleanHdr) {
                  colMap[cleanHdr] = cIdx;
                }
              });
              break;
            }
          }

          const entries = [];
          let maxReturnSeq = 0;
          for (let i = headerRowIdx + 1; i < res.data.length; i++) {
            const row = res.data[i];
            if (!row || row.length === 0 || !row.some((c) => c !== null && c !== '')) continue;
            const returnNo = (row[colMap['return no.']] ?? '').toString().trim();
            const doNumber = (row[colMap['do-delivery order no.']] ?? '').toString().trim();
            if (!returnNo && !doNumber) continue;

            const m = returnNo.match(/RET-(\d+)/i);
            if (m) {
              const num = parseInt(m[1], 10);
              if (num > maxReturnSeq) maxReturnSeq = num;
            }

            entries.push({
              rowIndex: i + 1,
              timestamp: formatAppDate(row[colMap['timestamp']] || ''),
              returnNo,
              doNumber,
              partyNames: (row[colMap['party names']] ?? '').toString().trim(),
              productName: (row[colMap['product name']] ?? '').toString().trim(),
              qty: (row[colMap['qty']] ?? '').toString().trim(),
              rateOfMaterial: (row[colMap['rate of material']] ?? '').toString().trim(),
              billNo: (row[colMap['bill no.']] ?? '').toString().trim(),
              billCopy: (row[colMap['bill copy']] ?? '').toString().trim(),
              transportPayment: (row[colMap['tranport payment']] ?? '').toString().trim(),
              partyDebitNoteCopy: (row[colMap['party debit note copy']] ?? '').toString().trim(),
              reason: (row[colMap['reason of material return']] ?? '').toString().trim(),
              // Stage 1: Arrange Logistic For Lift Return Material
              planned1: formatAppDate(row[colMap['planned1']] || ''),
              actual1: formatAppDate(row[colMap['actual1']] || ''),
              transporterName: (row[colMap['transporter name']] ?? '').toString().trim(),
              biltyNo: (row[colMap['bilty no.']] ?? '').toString().trim(),
              vehicleNo: (row[colMap['vehicle no.']] ?? '').toString().trim(),
              typeOfRate: (row[colMap['type of rate']] ?? '').toString().trim(),
              // Stage 2: Recived Return Material From Party
              planned2: formatAppDate(row[colMap['planned2']] || ''),
              actual2: formatAppDate(row[colMap['actual2']] || ''),
              qtyOfReturnMaterial: (row[colMap['qty of return material']] ?? '').toString().trim(),
              conditionOfMaterial: (row[colMap['condition of material']] ?? '').toString().trim(),
              photoOfReturnMaterial: (row[colMap['photo of return material']] ?? '').toString().trim(),
              // Stage 3: Issue Note
              planned3: formatAppDate(row[colMap['planned3']] || ''),
              actual3: formatAppDate(row[colMap['actual3']] || ''),
              creditNoteCopy: (row[colMap['credit note copy']] ?? '').toString().trim(),
              creditNoteNo: (row[colMap['credit note no.']] ?? '').toString().trim(),
              // Stage 4: Send To Party
              planned4: formatAppDate(row[colMap['planned4']] || ''),
              actual4: formatAppDate(row[colMap['actual4']] || ''),
              status4: (row[colMap['status4']] ?? '').toString().trim(),
            });
          }

          return { success: true, data: entries, maxReturnSeq };
        }
      } catch (err) {
        console.warn('Error reading Material Return entries:', err);
      }
    }
    return { success: true, data: [], maxReturnSeq: 0 };
  },

  async insertMaterialReturnRows(rows) {
    if (!FORCE_MOCK) {
      for (const rowObj of rows) {
        const res = await sendToAppsScript({
          action: 'insert',
          sheetName: 'Material Return',
          rowDataObj: JSON.stringify(rowObj),
        });
        if (!res || !res.success) {
          return { success: false, error: res?.error || 'Failed to insert row into Material Return' };
        }
      }
      return { success: true, message: `Successfully inserted ${rows.length} rows into Material Return` };
    }
    return { success: true, message: 'Inserted into mock' };
  },

  async updateMaterialReturnFields(rowIndex, fieldsObj) {
    if (!FORCE_MOCK) {
      const res = await sendToAppsScript({
        action: 'update',
        sheetName: 'Material Return',
        rowIndex: rowIndex,
        rowDataObj: JSON.stringify(fieldsObj),
      });
      if (res && res.success) {
        return { success: true, message: 'Material Return sheet updated successfully!' };
      }
      return { success: false, error: res?.error || 'Failed to update Material Return sheet' };
    }
    return { success: true, message: 'Updated in mock' };
  },

  formatDate: formatAppDate,
};
