import React from 'react';

// Last column(s) of every stage table: Pending tab shows the Planned Date;
// History tab shows both Planned Date and Actual Date. `planned` / `actual`
// may be a single value or an array (a grouped row spanning several records)
// — planned shows the first filled value, actual the last one filled.
const pick = (v, last) => {
  const list = (Array.isArray(v) ? v : [v]).filter((x) => x !== undefined && x !== null && String(x).trim() !== '');
  if (list.length === 0) return '';
  return last ? list[list.length - 1] : list[0];
};

const cellClass = 'px-3.5 py-3 whitespace-nowrap font-mono text-[11px] text-slate-700';
const dash = <span className="text-slate-300">—</span>;

export default function StageDateCell({ tab, planned, actual }) {
  const plannedValue = pick(planned, false);
  if (tab === 'Pending') return <td className={cellClass}>{plannedValue || dash}</td>;
  const actualValue = pick(actual, true);
  return (
    <>
      <td className={cellClass}>{plannedValue || dash}</td>
      <td className={cellClass}>{actualValue || dash}</td>
    </>
  );
}
