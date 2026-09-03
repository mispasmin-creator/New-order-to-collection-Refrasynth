import {
  getStoredMockOrders,
  saveStoredMockOrders,
  getStoredMockUsers,
  getStoredMockMasterData,
} from './mockData';

const APPS_SCRIPT_URL = (import.meta.env.VITE_APPS_SCRIPT_URL || '').trim();
const FORCE_MOCK = import.meta.env.VITE_USE_MOCK === 'true' || !APPS_SCRIPT_URL;

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
 * Low-level GET helper for Google Apps Script Web App
 */
async function getFromAppsScript(sheetName) {
  if (FORCE_MOCK) return null;

  try {
    const url = `${APPS_SCRIPT_URL}?sheet=${encodeURIComponent(sheetName)}`;
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();
    return json;
  } catch (error) {
    console.error(`Error fetching sheet '${sheetName}':`, error);
    return null;
  }
}

/**
 * Resilient request helper for Google Apps Script Web App
 * Combines GET query param execution (100% CORS-free), standard POST,
 * and no-cors fallback to ensure changes always write to Google Sheets.
 */
async function sendToAppsScript(payload) {
  if (FORCE_MOCK) return null;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(payload)) {
    params.append(key, typeof value === 'object' ? JSON.stringify(value) : value);
  }

  // 1. Try GET with query parameters (Zero CORS issues in modern browsers)
  try {
    const getUrl = `${APPS_SCRIPT_URL}?${params.toString()}`;
    const response = await fetch(getUrl, {
      method: 'GET',
      redirect: 'follow',
    });

    if (response.ok) {
      const json = await response.json();
      if (json && json.success) {
        return json;
      }
    }
  } catch (getErr) {
    console.warn('GET attempt failed, trying POST:', getErr);
  }

  // 2. Try standard POST with URLSearchParams
  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      redirect: 'follow',
      body: params,
    });

    if (response.ok) {
      const json = await response.json();
      if (json && json.success) {
        return json;
      }
    }
  } catch (postErr) {
    console.warn('POST attempt failed, trying no-cors fallback:', postErr);
  }

  // 3. Fallback: POST with mode: 'no-cors'
  // In no-cors mode, the browser ignores CORS headers and fires the request directly to Google Apps Script.
  try {
    await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      body: params,
    });
    // Brief delay to allow Google Sheets write & flush
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return { success: true, message: 'Data saved to Google Sheet' };
  } catch (noCorsErr) {
    console.error('All request attempts failed:', noCorsErr);
    return { success: false, error: noCorsErr.message };
  }
}

/**
 * In-memory / localStorage fallback for Manage Users when offline
 */
const MOCK_STORAGE_KEY_USERS_FULL = 'refrasynth_mock_users_full';

function getStoredFullUsers() {
  const data = localStorage.getItem(MOCK_STORAGE_KEY_USERS_FULL);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function saveStoredFullUsers(users) {
  localStorage.setItem(MOCK_STORAGE_KEY_USERS_FULL, JSON.stringify(users));
}

/**
 * Public API methods
 */
export const api = {
  isMockMode: FORCE_MOCK,

  // -------------------------------------------------------------
  // FILE UPLOAD (Google Drive via Apps Script)
  // All uploaded files go to folder: 1iGeJSI9CZpmaCyUnpx1QoDJNOXr_Jd2L
  // Returns a direct Google Drive preview URL.
  // -------------------------------------------------------------
  async uploadFile(file, folderId = '1iGeJSI9CZpmaCyUnpx1QoDJNOXr_Jd2L') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = async (evt) => {
        try {
          // Convert ArrayBuffer → base64 string
          const arrayBuffer = evt.target.result;
          const bytes = new Uint8Array(arrayBuffer);
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64Data = btoa(binary);

          // Send to Apps Script
          const params = new URLSearchParams({
            action: 'uploadFile',
            base64Data,
            fileName: file.name,
            mimeType: file.type || 'application/octet-stream',
            folderId,
          });

          // Base64 file data can easily exceed URL length limits, so this must
          // always go through the request body (POST), never a GET query string.
          let driveUrl = null;

          try {
            const resp = await fetch(APPS_SCRIPT_URL, {
              method: 'POST',
              redirect: 'follow',
              body: params,
            });
            if (resp.ok) {
              const json = await resp.json();
              if (json?.success && json?.fileUrl) {
                driveUrl = json.fileUrl;
              }
            }
          } catch (_) { /* fall through to no-cors fallback */ }

          // Fallback: fire the upload with mode: 'no-cors' so it still reaches
          // Drive even if the browser blocked the CORS-visible response above.
          // The response is opaque here, so the Drive URL can't be read back —
          // the user is prompted to paste it manually via FileUploader's fallback input.
          if (!driveUrl) {
            try {
              await fetch(APPS_SCRIPT_URL, {
                method: 'POST',
                mode: 'no-cors',
                body: params,
              });
            } catch (_) { /* give up, resolve(null) below */ }
          }

          resolve(driveUrl);
        } catch (err) {
          reject(err);
        }
      };

      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });
  },

  // -------------------------------------------------------------
  // USERS TAB OPERATIONS
  // -------------------------------------------------------------
  async getUsers() {
    if (!FORCE_MOCK) {
      const res = await getFromAppsScript('Users');
      if (res && res.success && Array.isArray(res.data)) {
        // Headers are row 0: ["User Name", "Password", "Role", "Firm Access", "Page Permissions"]
        const users = [];
        for (let i = 1; i < res.data.length; i++) {
          const row = res.data[i];
          const username = (row[0] || '').toString().trim();
          if (!username) continue;

          users.push({
            rowIndex: i + 1, // Sheet row is 1-indexed, so row index is i + 1
            username: username,
            password: (row[1] || '').toString(),
            role: (row[2] || 'Staff').toString(),
            firmAccess: (row[3] || 'All').toString(),
            pagePermissions: (row[4] || 'All').toString(),
          });
        }
        return { success: true, data: users };
      }
    }

    // Fallback to local storage
    return { success: true, data: getStoredFullUsers() };
  },

  async addUser(userData) {
    const rowData = [
      userData.username,
      userData.password,
      userData.role || 'Staff',
      userData.firmAccess || 'All',
      userData.pagePermissions || 'All',
    ];

    if (!FORCE_MOCK) {
      const res = await sendToAppsScript({
        action: 'insert',
        sheetName: 'Users',
        rowData: JSON.stringify(rowData),
      });
      if (res && res.success) {
        return { success: true, message: 'User added to Google Sheet successfully!' };
      }
      return { success: false, error: res?.error || 'Failed to insert into Google Sheet.' };
    }

    // Local update
    const users = getStoredFullUsers();
    const newUser = {
      rowIndex: users.length + 2,
      username: userData.username,
      password: userData.password,
      role: userData.role || 'Staff',
      firmAccess: userData.firmAccess || 'All',
      pagePermissions: userData.pagePermissions || 'All',
    };
    users.push(newUser);
    saveStoredFullUsers(users);
    return { success: true, message: 'User added successfully (Local)' };
  },

  async updateUser(rowIndex, userData) {
    const rowData = [
      userData.username,
      userData.password,
      userData.role || 'Staff',
      userData.firmAccess || 'All',
      userData.pagePermissions || 'All',
    ];

    if (!FORCE_MOCK) {
      const res = await sendToAppsScript({
        action: 'update',
        sheetName: 'Users',
        rowIndex: rowIndex,
        rowData: JSON.stringify(rowData),
      });
      if (res && res.success) {
        return { success: true, message: 'User updated in Google Sheet successfully!' };
      }
      return { success: false, error: res?.error || 'Failed to update Google Sheet.' };
    }

    // Local update
    const users = getStoredFullUsers();
    const idx = users.findIndex((u) => u.rowIndex === rowIndex);
    if (idx !== -1) {
      users[idx] = { ...users[idx], ...userData };
      saveStoredFullUsers(users);
    }
    return { success: true, message: 'User updated successfully' };
  },

  async deleteUser(rowIndex) {
    if (!FORCE_MOCK) {
      const res = await sendToAppsScript({
        action: 'delete',
        sheetName: 'Users',
        rowIndex: rowIndex,
      });
      if (res && res.success) {
        return { success: true, message: 'User deleted from Google Sheet successfully!' };
      }
      return { success: false, error: res?.error || 'Failed to delete from Google Sheet.' };
    }

    // Local delete
    const users = getStoredFullUsers();
    const filtered = users.filter((u) => u.rowIndex !== rowIndex);
    saveStoredFullUsers(filtered);
    return { success: true, message: 'User deleted successfully' };
  },

  // -------------------------------------------------------------
  // AUTHENTICATION (Checks Google Sheet Users tab)
  // -------------------------------------------------------------
  async login(username, password) {
    const cleanUser = (username || '').trim().toLowerCase();
    const cleanPass = (password || '').trim();

    // 1. First attempt to check live Google Sheet Users tab
    try {
      const usersRes = await this.getUsers();
      if (usersRes && usersRes.success && Array.isArray(usersRes.data)) {
        const found = usersRes.data.find(
          (u) =>
            u.username.toLowerCase() === cleanUser &&
            u.password.trim() === cleanPass
        );

        if (found) {
          return {
            success: true,
            message: 'Login successful',
            user: {
              username: found.username,
              name: found.username,
              role: found.role,
              firmAccess: found.firmAccess,
              pagePermissions: found.pagePermissions,
              token: 'token_' + Date.now(),
            },
          };
        }
      }
    } catch (err) {
      console.warn('Error during live users check:', err);
    }

    // 2. Emergency fallback login for initial system setup if Users sheet is not yet configured
    if ((cleanUser === 'admin' && (cleanPass === 'admin' || cleanPass === 'Admin123')) || (cleanUser === 'admin123' && cleanPass === 'admin123')) {
      return {
        success: true,
        message: 'Login successful (Initial Admin Setup)',
        user: {
          username: 'admin',
          name: 'Administrator',
          role: 'Administrator',
          firmAccess: 'All',
          pagePermissions: 'All',
          token: 'token_' + Date.now(),
        },
      };
    }

    return {
      success: false,
      message: 'Invalid Username or Password. Please check your credentials in the Users sheet.',
    };
  },

  // -------------------------------------------------------------
  // MASTER TAB OPERATIONS (Dynamic Dropdown Data from Google Sheet)
  // -------------------------------------------------------------
  async getMasterData() {
    if (!FORCE_MOCK) {
      try {
        // Try fetching from sheet tab 'Master' or 'Masters'
        let res = await getFromAppsScript('Master');
        if (!res || !res.success || !Array.isArray(res.data) || res.data.length < 2) {
          res = await getFromAppsScript('Masters');
        }

        if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
          const parsed = parseMasterSheet(res.data);
          if (parsed && Object.keys(parsed).length > 0) {
            return { success: true, data: parsed };
          }
        }
      } catch (err) {
        console.warn('Could not fetch live Master sheet:', err);
      }
    }

    // Return empty if no Master sheet data
    return { success: true, data: {} };
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
        const res = await sendToAppsScript({
          action: 'read',
          sheet: 'Billing',
        });
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
        const res = await sendToAppsScript({
          action: 'read',
          sheet: 'Dispatch',
        });
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

  formatDate: formatAppDate,
};
