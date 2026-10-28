import { useState, useMemo } from 'react';

// Client-side pagination for an already filtered list.
// `resetKey` (a string built from the page's tab / search / filters) sends the user back to
// page 1 whenever it changes; the page also never exceeds the last page when the list shrinks
// (e.g. after an item moves from Pending to History).
export default function usePagination(items, resetKey = '', initialSize = 25) {
  const [pageSize, setPageSizeState] = useState(initialSize);
  const [state, setState] = useState({ page: 1, key: '' });

  const key = `${resetKey}|${pageSize}`;
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const requested = state.key === key ? state.page : 1;
  const page = Math.min(Math.max(1, requested), totalPages);

  const pageItems = useMemo(() => items.slice((page - 1) * pageSize, page * pageSize), [items, page, pageSize]);

  return {
    page,
    totalPages,
    total,
    pageSize,
    pageItems,
    from: total === 0 ? 0 : (page - 1) * pageSize + 1,
    to: Math.min(page * pageSize, total),
    setPage: (p) => setState({ page: p, key }),
    setPageSize: (n) => {
      setPageSizeState(n);
      setState({ page: 1, key: `${resetKey}|${n}` });
    },
  };
}
