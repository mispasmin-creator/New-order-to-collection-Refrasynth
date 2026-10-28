import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import {
  Database,
  Search,
  RefreshCw,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  AlertCircle,
  Building2,
  ListChecks,
} from 'lucide-react';
import usePagination from '../hooks/usePagination';
import Pagination from '../components/common/Pagination';

// Master sheet layout: column 1-3 are the party directory (row-aligned:
// Party Name / GST Number / Delivery Address); every other column is an
// independent dropdown list.
const PARTY_COLS = [1, 2, 3];

const clean = (v) => (v ?? '').toString().trim();

function parseMatrix(matrix) {
  const headers = (matrix[0] || []).map((h) => clean(h));
  const parties = [];
  const lists = {};
  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r] || [];
    if (clean(row[1])) {
      parties.push({ name: clean(row[1]), gst: clean(row[2]), address: clean(row[3]) });
    }
  }
  headers.forEach((h, c) => {
    if (PARTY_COLS.includes(c) || !h) return;
    const values = [];
    for (let r = 1; r < matrix.length; r++) {
      const v = clean((matrix[r] || [])[c]);
      if (v) values.push(v);
    }
    lists[c] = values;
  });
  return { headers, parties, lists };
}

function buildMatrix(headers, parties, lists) {
  const listLens = Object.values(lists).map((l) => l.length);
  const rows = Math.max(parties.length, ...listLens, 0);
  const out = [headers];
  for (let r = 0; r < rows; r++) {
    const row = headers.map(() => '');
    const p = parties[r];
    if (p) {
      row[1] = p.name;
      row[2] = p.gst;
      row[3] = p.address;
    }
    Object.entries(lists).forEach(([c, values]) => {
      if (values[r] !== undefined) row[Number(c)] = values[r];
    });
    out.push(row);
  }
  return out;
}

export default function MasterDataPage() {
  const [headers, setHeaders] = useState([]);
  const [parties, setParties] = useState([]);
  const [lists, setLists] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState('parties');
  const [search, setSearch] = useState('');
  const [activeList, setActiveList] = useState(null);
  const [newValue, setNewValue] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.getMasterMatrix();
      if (res.success && Array.isArray(res.data) && res.data.length > 0) {
        const parsed = parseMatrix(res.data);
        setHeaders(parsed.headers);
        setParties(parsed.parties);
        setLists(parsed.lists);
        setDirty(false);
        setActiveList((prev) => prev ?? Number(Object.keys(parsed.lists)[0]));
      } else {
        setError(res.error || 'Master data not found.');
      }
    } catch (err) {
      setError(err.message || 'Could not load master data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filteredParties = useMemo(() => {
    const q = search.trim().toLowerCase();
    return parties
      .map((p, idx) => ({ ...p, idx }))
      .filter((p) => !q || `${p.name} ${p.gst} ${p.address}`.toLowerCase().includes(q));
  }, [parties, search]);

  const pg = usePagination(filteredParties, `${search}`);

  const updateParty = (idx, field, value) => {
    setParties((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)));
    setDirty(true);
  };
  const addParty = () => {
    setParties((prev) => [{ name: '', gst: '', address: '' }, ...prev]);
    setSearch('');
    setDirty(true);
  };
  const deleteParty = (idx) => {
    setParties((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
  };

  const updateListValue = (c, i, value) => {
    setLists((prev) => ({ ...prev, [c]: prev[c].map((v, k) => (k === i ? value : v)) }));
    setDirty(true);
  };
  const deleteListValue = (c, i) => {
    setLists((prev) => ({ ...prev, [c]: prev[c].filter((_, k) => k !== i) }));
    setDirty(true);
  };
  const addListValue = () => {
    const v = newValue.trim();
    if (!v || activeList === null) return;
    if (lists[activeList].some((x) => x.toLowerCase() === v.toLowerCase())) {
      setError(`"${v}" is already in ${headers[activeList]}.`);
      return;
    }
    setError('');
    setLists((prev) => ({ ...prev, [activeList]: [...prev[activeList], v] }));
    setNewValue('');
    setDirty(true);
  };

  const handleSave = async () => {
    setError('');
    const names = new Set();
    for (const p of parties) {
      if (!clean(p.name)) {
        setError('Every party needs a Party Name (remove empty rows).');
        return;
      }
      const key = clean(p.name).toLowerCase();
      if (names.has(key)) {
        setError(`Duplicate party: "${clean(p.name)}".`);
        return;
      }
      names.add(key);
    }
    const cleanedParties = parties.map((p) => ({ name: clean(p.name), gst: clean(p.gst), address: clean(p.address) }));
    const cleanedLists = {};
    Object.entries(lists).forEach(([c, values]) => {
      cleanedLists[c] = values.map(clean).filter(Boolean);
    });

    setSaving(true);
    try {
      const res = await api.saveMasterData(buildMatrix(headers, cleanedParties, cleanedLists));
      if (res.success) {
        setParties(cleanedParties);
        setLists(cleanedLists);
        setDirty(false);
        setNotice('Master data saved. New values are available in all forms.');
        setTimeout(() => setNotice(''), 4000);
      } else {
        setError(res.error || 'Failed to save master data.');
      }
    } catch (err) {
      setError(err.message || 'Failed to save master data.');
    } finally {
      setSaving(false);
    }
  };

  const listEntries = Object.keys(lists).map((c) => ({ c: Number(c), name: headers[Number(c)], count: lists[c].length }));
  const inputCls =
    'w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400';

  return (
    <div className="h-full flex flex-col space-y-4">
      <div className="shrink-0 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 m-0 flex items-center gap-2.5">
              <Database className="w-7 h-7 text-indigo-600" />
              <span>Master Data</span>
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Party directory and dropdown options used across the Order form
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={load}
              disabled={loading || saving}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-600' : 'text-slate-500'}`} />
              <span>Reload</span>
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!dirty || saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Saving...' : dirty ? 'Save Changes' : 'Saved'}</span>
            </button>
          </div>
        </div>

        {notice && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{notice}</span>
          </div>
        )}
        {error && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm text-rose-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold w-fit">
          <button
            type="button"
            onClick={() => setTab('parties')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg transition-all ${
              tab === 'parties' ? 'bg-white text-indigo-600 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" /> Parties ({parties.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('lists')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg transition-all ${
              tab === 'lists' ? 'bg-white text-indigo-600 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ListChecks className="w-3.5 h-3.5" /> Dropdown Lists ({listEntries.length})
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400">
            <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="mt-3 text-sm font-medium">Loading master data...</p>
          </div>
        ) : tab === 'parties' ? (
          <>
            <div className="shrink-0 p-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="relative max-w-sm w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search party, GST or address..."
                  className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
              <button
                type="button"
                onClick={addParty}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" /> Add Party
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-left text-xs text-slate-600 border-collapse">
                <thead className="sticky top-0 bg-slate-100 z-10 border-b border-slate-300 font-semibold text-slate-700 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="px-3 py-3 w-[28%]">Party Name</th>
                    <th className="px-3 py-3 w-[20%]">GST Number</th>
                    <th className="px-3 py-3">Delivery Address</th>
                    <th className="px-3 py-3 w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredParties.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="py-14 text-center text-slate-400">No parties found.</td>
                    </tr>
                  ) : (
                    pg.pageItems.map((p) => (
                      <tr key={p.idx} className="hover:bg-slate-50/80">
                        <td className="px-3 py-2">
                          <input className={inputCls} value={p.name} onChange={(e) => updateParty(p.idx, 'name', e.target.value)} placeholder="Party name" />
                        </td>
                        <td className="px-3 py-2">
                          <input className={inputCls} value={p.gst} onChange={(e) => updateParty(p.idx, 'gst', e.target.value)} placeholder="GST number" />
                        </td>
                        <td className="px-3 py-2">
                          <input className={inputCls} value={p.address} onChange={(e) => updateParty(p.idx, 'address', e.target.value)} placeholder="Delivery address" />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => deleteParty(p.idx)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md"
                            title="Delete party"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <Pagination {...pg} />
          </>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col md:flex-row">
            <div className="md:w-64 shrink-0 border-b md:border-b-0 md:border-r border-slate-200 overflow-auto p-2 space-y-1">
              {listEntries.map((l) => (
                <button
                  key={l.c}
                  type="button"
                  onClick={() => setActiveList(l.c)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-left transition-colors ${
                    activeList === l.c ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'text-slate-600 hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  <span className="truncate">{l.name}</span>
                  <span className="text-[10px] text-slate-400 font-medium">{l.count}</span>
                </button>
              ))}
            </div>
            <div className="flex-1 min-w-0 flex flex-col">
              {activeList !== null && lists[activeList] && (
                <>
                  <div className="shrink-0 p-3 border-b border-slate-200 flex items-center gap-2">
                    <input
                      className={inputCls}
                      value={newValue}
                      onChange={(e) => setNewValue(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addListValue()}
                      placeholder={`Add a new value to "${headers[activeList]}"`}
                    />
                    <button
                      type="button"
                      onClick={addListValue}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add
                    </button>
                  </div>
                  <div className="flex-1 min-h-0 overflow-auto divide-y divide-slate-100">
                    {lists[activeList].length === 0 ? (
                      <p className="py-14 text-center text-xs text-slate-400">No values yet.</p>
                    ) : (
                      lists[activeList].map((v, i) => (
                        <div key={i} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50/80">
                          <input className={inputCls} value={v} onChange={(e) => updateListValue(activeList, i, e.target.value)} />
                          <button
                            type="button"
                            onClick={() => deleteListValue(activeList, i)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md shrink-0"
                            title="Remove"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
