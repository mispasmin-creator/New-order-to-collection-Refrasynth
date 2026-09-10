import React from 'react';
import { Download } from 'lucide-react';
import { exportToCsv } from '../../utils/exportCsv';

// Drop-in header button — pass `getRows` (a function returning the current
// array of flat row objects to export) so it always exports live data,
// respecting whatever search/tab filter is currently applied on the page.
export default function ExportButton({ getRows, filename, label = 'Export' }) {
  const handleExport = () => {
    const rows = typeof getRows === 'function' ? getRows() : getRows;
    exportToCsv(filename, rows || []);
  };

  return (
    <button
      type="button"
      onClick={handleExport}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-xs"
    >
      <Download className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}
