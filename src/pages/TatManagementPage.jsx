import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../services/supabaseSheets';
import { useAuth } from '../context/AuthContext';
import { formatAppDate } from '../utils/dateFormatter';
import usePagination from '../hooks/usePagination';
import Pagination from '../components/common/Pagination';
import { STAGES, MORE_STAGES, isDone, loadStageData, buildStageRows } from '../utils/tatData';
import { Timer, Save, RotateCcw, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';

const UNIT_LABEL = { hours: 'hours', days: 'days', workdays: 'working days' };
const offsetText = (c) => (c ? `${c.value} ${UNIT_LABEL[c.unit] || c.unit}` : '—');

// hours can be any whole number up to 720; days / working days whole 0-60
function validateOffset(value, unit) {
  const n = Number(value);
  if (value === '' || !Number.isInteger(n) || n < 0) return 'Offset must be a whole number, 0 or more.';
  if (unit === 'hours' && n > 720) return 'Hours can be at most 720.';
  if (unit !== 'hours' && n > 60) return 'Days / working days can be at most 60.';
  return '';
}

// delay<=0 on time; 0-3 days amber; >3 days red
function DelayBadge({ days }) {
  if (days === null) return <span className="text-slate-400">—</span>;
  if (days <= 0) return <span className="rounded px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700">On time</span>;
  const tone = days > 3 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700';
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${tone}`}>{days.toFixed(1)} days late</span>;
}

export default function TatManagementPage() {
  const { user } = useAuth();
  const canEdit = user?.role === 'Admin';

  const [config, setConfig] = useState({});
  const [draft, setDraft] = useState({});
  const [selected, setSelected] = useState(STAGES[0].key);
  const [statusFilter, setStatusFilter] = useState('all');
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const flash = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 4000);
  };

  const loadAll = useCallback(async () => {
    if (!supabase) {
      setError('Supabase is not configured (check .env).');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [stageData, cfg] = await Promise.all([
        loadStageData(),
        supabase.from('tat_config').select('stage_key, offset_value, offset_unit, default_value, default_unit'),
      ]);
      const confMap = {};
      if (cfg.error) {
        setError(`Could not read tat_config (run supabase/tat_config.sql): ${cfg.error.message}`);
      } else {
        cfg.data.forEach((r) => {
          confMap[r.stage_key] = {
            value: Number(r.offset_value), unit: r.offset_unit,
            defaultValue: Number(r.default_value), defaultUnit: r.default_unit,
          };
        });
      }
      setConfig(confMap);
      setData(stageData);
    } catch (err) {
      setError(err.message || 'Could not load TAT data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const stageRows = useMemo(() => buildStageRows(data), [data]);

  const summary = useMemo(() => STAGES.map((stage) => {
    const rows = stageRows[stage.key] || [];
    const delayed = rows.filter((r) => r.delay !== null && r.delay > 0);
    return {
      stage,
      offset: config[stage.key],
      pending: rows.filter((r) => !isDone(r)).length,
      complete: rows.filter(isDone).length,
      delayed: delayed.length,
      avgDelay: delayed.length ? delayed.reduce((s, r) => s + r.delay, 0) / delayed.length : 0,
    };
  }), [stageRows, config]);

  const selectedStage = STAGES.find((s) => s.key === selected);
  const selectedOffset = config[selected];

  const detailRows = useMemo(() => (stageRows[selected] || [])
    .filter((r) => (statusFilter === 'all' ? true : statusFilter === 'pending' ? !isDone(r) : isDone(r)))
    .sort((a, b) => (a.planned?.getTime() ?? 0) - (b.planned?.getTime() ?? 0)), [stageRows, selected, statusFilter]);
  const pg = usePagination(detailRows, `${selected}|${statusFilter}`);

  // Stores the offset, then recomputes planned for that stage's pending rows in the DB.
  async function applyOffset(key, value, unit) {
    const { data: saved, error: err } = await supabase
      .from('tat_config')
      .update({ offset_value: value, offset_unit: unit, updated_at: new Date().toISOString() })
      .eq('stage_key', key)
      .select('stage_key');
    if (err) throw err;
    if (!saved || saved.length === 0) throw new Error('Stage is missing from tat_config.');
    const rpcName = MORE_STAGES.has(key) ? 'tat_apply_offset_more' : 'tat_apply_offset';
    const { data: updated, error: rpcErr } = await supabase.rpc(rpcName, { p_stage_key: key });
    if (rpcErr) throw rpcErr;
    return updated;
  }

  async function handleSave(key) {
    const d = draft[key];
    const cur = config[key];
    const value = d?.value ?? String(cur?.value ?? 0);
    const unit = d?.unit ?? cur?.unit ?? 'days';
    const problem = validateOffset(value, unit);
    if (problem) {
      setError(problem);
      return;
    }
    const stage = STAGES.find((s) => s.key === key);
    setSavingKey(key);
    setError('');
    try {
      const updated = await applyOffset(key, Number(value), unit);
      setDraft(({ [key]: _removed, ...rest }) => rest);
      flash(`${stage.name}: planned = previous step + ${value} ${UNIT_LABEL[unit]}. Planned date recomputed for ${updated} row(s) (pending and complete).`);
      await loadAll();
    } catch (err) {
      setError(`Save failed: ${err.message || err}`);
    } finally {
      setSavingKey(null);
    }
  }

  async function handleResetAll() {
    if (!window.confirm('Reset every stage to its original offset? Planned dates of all rows (pending and complete) will be recomputed.')) return;
    setError('');
    try {
      for (const s of STAGES) {
        const c = config[s.key];
        if (c) await applyOffset(s.key, c.defaultValue, c.defaultUnit);
      }
      setDraft({});
      flash('All stages reset to their original offsets.');
      await loadAll();
    } catch (err) {
      setError(`Reset failed: ${err.message || err}`);
    }
  }

  return (
    <div className="h-full overflow-y-auto space-y-6 pr-1">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-indigo-50 text-indigo-600"><Timer className="w-6 h-6" /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">TAT Management</h1>
            <p className="text-sm text-slate-500">Planned vs actual per stage. Planned = previous step's actual + the offset below.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={loadAll} disabled={loading} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          {canEdit && (
            <button onClick={handleResetAll} disabled={loading} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50">
              <RotateCcw className="w-4 h-4" /> Reset all to original
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}
      {notice && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 text-sm">
          <CheckCircle2 className="w-4 h-4 shrink-0" /> {notice}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3">Stage</th>
              <th className="text-left px-4 py-3">Planned column</th>
              <th className="text-right px-4 py-3">Pending</th>
              <th className="text-right px-4 py-3">Complete</th>
              <th className="text-right px-4 py-3">Delayed</th>
              <th className="text-right px-4 py-3">Avg delay</th>
              <th className="text-left px-4 py-3">Planned = previous step +</th>
            </tr>
          </thead>
          <tbody>
            {summary.map(({ stage, offset, pending, complete, delayed, avgDelay }) => {
              const d = draft[stage.key];
              const valueShown = d?.value ?? String(offset?.value ?? '');
              const unitShown = d?.unit ?? offset?.unit ?? 'days';
              const changed = d !== undefined && offset && (Number(valueShown) !== offset.value || unitShown !== offset.unit);
              const editable = canEdit && !stage.noPlanned && offset;
              return (
                <tr key={stage.key} onClick={() => setSelected(stage.key)}
                  className={`border-t border-slate-100 cursor-pointer hover:bg-slate-50 ${selected === stage.key ? 'bg-indigo-50/60' : ''}`}>
                  <td className="px-4 py-3 font-medium text-slate-800">{stage.name}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{stage.noPlanned ? 'no planned date' : `${stage.source}.${stage.plannedCol}`}</td>
                  <td className="px-4 py-3 text-right font-semibold">{pending}</td>
                  <td className="px-4 py-3 text-right font-semibold text-emerald-700">{complete}</td>
                  <td className={`px-4 py-3 text-right ${delayed ? 'text-rose-600 font-bold' : 'text-emerald-600'}`}>{delayed}</td>
                  <td className="px-4 py-3 text-right">{avgDelay ? `${avgDelay.toFixed(1)} days` : '—'}</td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <input
                        type="number" min={0} max={720} disabled={!editable}
                        className="h-8 w-20 rounded-md border border-slate-200 px-2 disabled:bg-slate-50 disabled:text-slate-500"
                        value={stage.noPlanned ? '' : valueShown}
                        placeholder={stage.noPlanned ? '—' : ''}
                        onChange={(e) => setDraft((cur) => ({ ...cur, [stage.key]: { value: e.target.value, unit: unitShown } }))}
                      />
                      {!stage.noPlanned && (
                        <select
                          disabled={!editable}
                          className="h-8 rounded-md border border-slate-200 px-2 text-xs disabled:bg-slate-50 disabled:text-slate-500"
                          value={unitShown}
                          onChange={(e) => setDraft((cur) => ({ ...cur, [stage.key]: { value: valueShown, unit: e.target.value } }))}
                        >
                          <option value="hours">hours</option>
                          <option value="days">days</option>
                          <option value="workdays">working days</option>
                        </select>
                      )}
                      {editable && (
                        <button disabled={!changed || savingKey === stage.key} onClick={() => handleSave(stage.key)}
                          className="inline-flex items-center gap-1 h-8 px-3 text-xs rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40">
                          <Save className="w-3.5 h-3.5" /> {savingKey === stage.key ? 'Saving...' : 'Save'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">
            {selectedStage.name}
            {!selectedStage.noPlanned && <span className="ml-2 text-sm font-normal text-slate-400">planned = previous step + {offsetText(selectedOffset)}</span>}
          </h2>
          <div className="flex gap-1">
            {['all', 'pending', 'complete'].map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 text-xs rounded-md border ${statusFilter === s ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                {s === 'all' ? 'ALL' : s === 'pending' ? 'Pending' : 'Complete'}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto p-4">
          {selectedStage.note && <p className="mb-3 rounded-md bg-slate-50 p-2 text-xs text-slate-500">{selectedStage.note}</p>}
          <table className="w-full text-sm">
            <thead className="text-slate-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left py-2 pr-4">Ref</th>
                <th className="text-left py-2 pr-4">Party</th>
                <th className="text-left py-2 pr-4">{selectedStage.noPlanned ? 'Started at' : 'Planned'}</th>
                <th className="text-left py-2 pr-4">Actual</th>
                <th className="text-left py-2">Delay</th>
              </tr>
            </thead>
            <tbody>
              {pg.pageItems.map((r, i) => (
                <tr key={`${r.ref}-${i}`} className="border-t border-slate-100">
                  <td className="py-2 pr-4 font-medium">{r.ref}</td>
                  <td className="py-2 pr-4">{r.party}</td>
                  <td className="py-2 pr-4 text-xs font-mono">{formatAppDate(selectedStage.noPlanned ? r.since : r.planned) || '—'}</td>
                  <td className="py-2 pr-4 text-xs font-mono">
                    {r.actual ? formatAppDate(r.actual) : <span className="text-amber-600 font-medium">Pending</span>}
                  </td>
                  <td className="py-2"><DelayBadge days={r.delay} /></td>
                </tr>
              ))}
              {detailRows.length === 0 && (
                <tr><td colSpan={5} className="text-center text-slate-400 py-6">{loading ? 'Loading...' : 'No records for this stage'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination {...pg} />
      </div>
    </div>
  );
}
