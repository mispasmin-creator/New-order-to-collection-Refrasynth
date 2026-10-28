import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const SIZES = [10, 25, 50, 100];

// First page, last page, and the current page with its neighbours; gaps become an ellipsis.
function pageList(page, totalPages) {
  const nums = [...new Set([1, totalPages, page - 1, page, page + 1])]
    .filter((n) => n >= 1 && n <= totalPages)
    .sort((a, b) => a - b);
  const out = [];
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1] > 1) out.push(`gap-${n}`);
    out.push(n);
  });
  return out;
}

// Footer bar for a paginated table. Pass the object returned by usePagination: <Pagination {...pg} />
export default function Pagination({ page, totalPages, total, from, to, pageSize, setPage, setPageSize }) {
  if (total === 0) return null;
  const btn = 'h-7 min-w-7 px-2 inline-flex items-center justify-center rounded-md border text-xs font-medium';

  return (
    <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-t border-slate-200 bg-white text-xs text-slate-500">
      <div className="flex items-center gap-3">
        <span>
          Showing <b className="text-slate-700">{from}-{to}</b> of <b className="text-slate-700">{total}</b>
        </span>
        <label className="inline-flex items-center gap-1.5">
          Rows
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="h-7 rounded-md border border-slate-200 bg-white px-1.5 text-xs text-slate-700"
          >
            {SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setPage(page - 1)}
          disabled={page <= 1}
          className={`${btn} border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed`}
          aria-label="Previous page"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        {pageList(page, totalPages).map((item) => (typeof item === 'number' ? (
          <button
            key={item}
            type="button"
            onClick={() => setPage(item)}
            className={`${btn} ${item === page ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            {item}
          </button>
        ) : (
          <span key={item} className="px-1 text-slate-400">…</span>
        )))}
        <button
          type="button"
          onClick={() => setPage(page + 1)}
          disabled={page >= totalPages}
          className={`${btn} border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed`}
          aria-label="Next page"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
