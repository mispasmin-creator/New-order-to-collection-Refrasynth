/**
 * Universal Date Formatter for the entire App
 * Formats any date input (ISO string, Google Sheets Date, serial number, YYYY-MM-DD, etc.)
 * into the standard format: dd/MM/yyyy HH:mm:ss (Asia/Kolkata / IST)
 */
export function formatAppDate(val) {
  if (!val && val !== 0) return '';
  
  let d;
  if (val instanceof Date) {
    d = val;
  } else if (typeof val === 'number') {
    // Excel / Google Sheets serial date (days since 30 Dec 1899)
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    d = new Date(excelEpoch.getTime() + val * 86400000);
  } else {
    let str = val.toString().trim();
    if (!str) return '';

    // If already in dd/MM/yyyy HH:mm:ss format
    if (/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/.test(str)) return str;

    // Plain YYYY-MM-DD date without time (e.g. HTML date input '2026-09-01')
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      str = str + 'T00:00:00+05:30';
    } else if (/^(\d{2})\/(\d{2})\/(\d{4})$/.test(str)) {
      const parts = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      return `${parts[1]}/${parts[2]}/${parts[3]} 00:00:00`;
    } else if (/^(\d{2})-(\d{2})-(\d{4})$/.test(str)) {
      const parts = str.match(/^(\d{2})-(\d{2})-(\d{4})$/);
      return `${parts[1]}/${parts[2]}/${parts[3]} 00:00:00`;
    }

    d = new Date(str);
    if (isNaN(d.getTime())) return str; // Unparseable string, return as-is
  }

  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    // en-GB produces "dd/mm/yyyy, hh:mm:ss" -> remove comma
    return formatter.format(d).replace(',', '');
  } catch (e) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
}
