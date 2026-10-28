import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { navPages } from '../config/navPages';
import { api } from '../services/api';
import { supabase } from '../services/supabaseSheets';
import StatCard from '../components/common/StatCard';
import ExportButton from '../components/common/ExportButton';
import { formatAppDate } from '../utils/dateFormatter';
import { STAGES, DAY, isDone, loadStageData, buildStageRows } from '../utils/tatData';
import { BarChart3, RefreshCw, AlertCircle, Info, Clock, CheckCircle2, Hourglass, Gauge, ChevronDown, ChevronRight } from 'lucide-react';

const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Last 7 days' },
  { key: 'month', label: 'Last 30 days' },
  { key: 'all', label: 'All time' },
];

const periodStart = (key, now) => {
  if (key === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (key === 'week') return new Date(now.getTime() - 7 * DAY);
  if (key === 'month') return new Date(now.getTime() - 30 * DAY);
  return null;
};

const norm = (s) => String(s || '').trim().toLowerCase();

const permsOf = (u) => {
  const p = u.pagePermissions;
  const list = Array.isArray(p) ? p : String(p || '').split(',');
  return list.map(norm).filter(Boolean);
};

// pending / overdue / completed-in-period / on-time % / avg delay / overdue age buckets
function statsOf(entries, since, now) {
  let pending = 0, overdue = 0, completed = 0, onTime = 0, late = 0, lateDays = 0, b1 = 0, b2 = 0, b3 = 0;
  entries.forEach((e) => {
    if (!isDone(e)) {
      pending += 1;
      if (e.planned && e.planned < now) {
        overdue += 1;
        const d = (now - e.planned) / DAY;
        if (d <= 1) b1 += 1; else if (d <= 3) b2 += 1; else b3 += 1;
      }
    } else if (!since || e.actual >= since) {
      completed += 1;
      if (e.delay !== null) {
        if (e.delay <= 0) onTime += 1;
        else { late += 1; lateDays += e.delay; }
      }
    }
  });
  const measured = onTime + late;
  return {
    pending, overdue, completed, b1, b2, b3,
    onTimePct: measured ? Math.round((onTime * 100) / measured) : null,
    avgDelay: late ? lateDays / late : 0,
  };
}

const pct = (v) => (v === null ? '—' : `${v}%`);

function OnTimeBadge({ value }) {
  if (value === null) return <span className="text-slate-400">—</span>;
  const tone = value >= 80 ? 'bg-emerald-100 text-emerald-700' : value >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700';
  return <span className={`rounded px-2 py-0.5 text-xs font-semibold ${tone}`}>{value}%</span>;
}

export default function MisPage() {
  const [data, setData] = useState({});
  const [users, setUsers] = useState([]);
  const [usersError, setUsersError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState('week');
  const [now, setNow] = useState(() => new Date());
  const [openOwner, setOpenOwner] = useState(''); // owner whose stage-wise breakdown is open
  const [openStage, setOpenStage] = useState(''); // `${owner}|${stageKey}` whose task list is open
  const [taskTab, setTaskTab] = useState('Pending'); // task list tab: 'Pending' | 'History'

  const loadAll = useCallback(async () => {
    if (!supabase) {
      setError('Supabase is not configured (check .env).');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [stageData, usersRes] = await Promise.all([loadStageData(), api.getUsers()]);
      setData(stageData);
      if (usersRes.success) {
        setUsers(usersRes.data);
        setUsersError('');
      } else {
        setUsers([]);
        setUsersError(usersRes.error || 'Could not load users.');
      }
      setNow(new Date());
    } catch (err) {
      setError(err.message || 'Could not load MIS data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const stageRows = useMemo(() => buildStageRows(data), [data]);
  const since = periodStart(period, now);

  // Owner of a stage = every user who has that page in Page Permissions (set in Manage Users).
  // "All" users can open every page, so they are not counted as owners.
  const { people, allAccess } = useMemo(() => {
    const everyone = users.map((u) => ({ ...u, perms: permsOf(u) }));
    const allAcc = everyone.filter((u) => u.perms.includes('all')).map((u) => u.username);
    const ppl = everyone
      .filter((u) => !u.perms.includes('all'))
      .map((u) => ({ ...u, stages: STAGES.filter((s) => u.perms.includes(norm(s.page))) }))
      .filter((u) => u.stages.length > 0);
    return { people: ppl, allAccess: allAcc };
  }, [users]);

  const stageStats = useMemo(() => STAGES.map((stage) => {
    const owners = people.filter((p) => p.stages.some((st) => st.key === stage.key)).map((p) => p.username);
    return { stage, owners, ...statsOf(stageRows[stage.key] || [], since, now) };
  }), [stageRows, people, since, now]);

  const personStats = useMemo(() => people.map((p) => {
    const entries = p.stages.flatMap((s) => stageRows[s.key] || []);
    return { person: p, ...statsOf(entries, since, now) };
  }).sort((a, b) => b.overdue - a.overdue || b.pending - a.pending), [people, stageRows, since, now]);

  const totals = useMemo(() => statsOf(STAGES.flatMap((s) => stageRows[s.key] || []), since, now), [stageRows, since, now]);
  const worstStage = stageStats.reduce((best, s) => (s.overdue > (best?.overdue ?? 0) ? s : best), null);

  // One group per owner (overall numbers + their stages). Stages nobody owns go in a "No owner" group.
  const ownerGroups = useMemo(() => {
    const groups = personStats.map((ps) => ({
      id: ps.person.username,
      name: ps.person.username,
      role: ps.person.role,
      totals: ps,
      stages: ps.person.stages.map((st) => stageStats.find((x) => x.stage.key === st.key)).filter(Boolean),
    }));
    const orphan = stageStats.filter((x) => x.owners.length === 0);
    if (orphan.length) {
      const sum = orphan.reduce((a, x) => ({ pending: a.pending + x.pending, overdue: a.overdue + x.overdue, completed: a.completed + x.completed }), { pending: 0, overdue: 0, completed: 0 });
      groups.push({ id: '__none', name: 'No owner', role: '', totals: { ...sum, onTimePct: null }, stages: orphan });
    }
    return groups;
  }, [personStats, stageStats]);

  // Tasks behind the Target number: everything pending + what was completed in the chosen period.
  const tasksFor = (stage) => (stageRows[stage.key] || [])
    .filter((e) => !isDone(e) || !since || e.actual >= since)
    .sort((a, b) => (isDone(a) - isDone(b)) || ((a.planned?.getTime() ?? Infinity) - (b.planned?.getTime() ?? Infinity)));
  const pagePath = (label) => navPages.find((p) => p.label === label)?.path;

  const exportRows = () => personStats.map((s) => ({
    User: s.person.username,
    Role: s.person.role,
    Stages: s.person.stages.map((x) => x.name).join(' | '),
    Pending: s.pending,
    Overdue: s.overdue,
    [`Completed (${PERIODS.find((x) => x.key === period).label})`]: s.completed,
    'On-time %': s.onTimePct ?? '',
    'Avg delay (days)': s.avgDelay ? s.avgDelay.toFixed(1) : '',
  }));

  return (
    <div className="h-full overflow-y-auto space-y-6 pr-1">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-indigo-50 text-indigo-600"><BarChart3 className="w-6 h-6" /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">MIS</h1>
            <p className="text-sm text-slate-500">Who is working on what, and how much is pending. Reference view built on live data.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1">
            {PERIODS.map((p) => (
              <button key={p.key} onClick={() => setPeriod(p.key)}
                className={`px-3 py-1.5 text-xs rounded-md border ${period === p.key ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                {p.label}
              </button>
            ))}
          </div>
          <ExportButton getRows={exportRows} filename="mis-person-wise" />
          <button onClick={loadAll} disabled={loading} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-800 px-4 py-3 text-sm">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <p>
          <b>Reference view.</b> The system does not yet record who completed each step. A person's work is taken from the
          <b> Page Permissions</b> given in Manage Users: everyone who can open a page is counted as its owner (a shared stage counts for each owner).
          Once an activity log is added, this page will also show who actually did each step.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Pending" value={totals.pending} subtitle="across all stages" icon={Hourglass} iconBg="bg-amber-50 text-amber-600" />
        <StatCard title="Overdue" value={totals.overdue} subtitle="pending and past planned date" icon={Clock} iconBg="bg-rose-50 text-rose-600" />
        <StatCard title="Completed" value={totals.completed} subtitle={PERIODS.find((x) => x.key === period).label} icon={CheckCircle2} iconBg="bg-emerald-50 text-emerald-600" />
        <StatCard title="On-time" value={pct(totals.onTimePct)} subtitle="completed within planned time" icon={Gauge} iconBg="bg-indigo-50 text-indigo-600" />
      </div>

      <section className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-x-auto">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Owner-wise workload</h2>
          <p className="text-xs text-slate-400">
            Target = pending + completed in the selected period, added up over all of the person's stages.
            Click a person to see the target stage by stage, then click a stage to see its tasks.
            {worstStage ? ` Biggest bottleneck right now: ${worstStage.stage.name} (${worstStage.overdue} overdue).` : ''}
          </p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3">Owner</th>
              <th className="text-right px-4 py-3">Stages</th>
              <th className="text-right px-4 py-3">Target</th>
              <th className="text-right px-4 py-3">Pending</th>
              <th className="text-right px-4 py-3">Overdue</th>
              <th className="text-right px-4 py-3">Completed</th>
              <th className="text-right px-4 py-3">On-time</th>
            </tr>
          </thead>
          <tbody>
            {ownerGroups.map((g) => {
              const open = openOwner === g.id;
              const t = g.totals;
              return (
                <React.Fragment key={g.id}>
                  <tr onClick={() => { setOpenOwner(open ? '' : g.id); setOpenStage(''); }}
                    className={`border-t border-slate-100 cursor-pointer hover:bg-slate-50 ${open ? 'bg-indigo-50/60' : ''}`}>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2 font-medium text-slate-800">
                        {open ? <ChevronDown className="w-4 h-4 text-indigo-600" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                        {g.name}
                      </span>
                      {g.role && <div className="ml-6 text-xs text-slate-400">{g.role}</div>}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">{g.stages.length}</td>
                    <td className="px-4 py-3 text-right"><span className="rounded-md border border-indigo-200 bg-white text-indigo-700 px-2.5 py-1 text-xs font-semibold">{t.pending + t.completed}</span></td>
                    <td className="px-4 py-3 text-right font-semibold">{t.pending}</td>
                    <td className={`px-4 py-3 text-right ${t.overdue ? 'text-rose-600 font-bold' : 'text-emerald-600'}`}>{t.overdue}</td>
                    <td className="px-4 py-3 text-right text-emerald-700 font-semibold">{t.completed}</td>
                    <td className="px-4 py-3 text-right"><OnTimeBadge value={t.onTimePct} /></td>
                  </tr>
                  {open && (
                    <tr className="bg-slate-50/70">
                      <td colSpan={7} className="px-4 py-3">
                        <p className="text-xs text-slate-500 mb-2">Stage-wise target for <b>{g.name}</b>. Click a stage to see its tasks.</p>
                        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-slate-100 text-slate-500 text-[11px] uppercase tracking-wider">
                              <tr>
                                <th className="text-left px-3 py-2">Stage</th>
                                <th className="text-right px-3 py-2">Target</th>
                                <th className="text-right px-3 py-2">Pending</th>
                                <th className="text-right px-3 py-2">Overdue</th>
                                <th className="text-right px-3 py-2">Completed</th>
                                <th className="text-right px-3 py-2">On-time</th>
                              </tr>
                            </thead>
                            <tbody>
                              {g.stages.map((sg) => {
                                const key = `${g.id}|${sg.stage.key}`;
                                const stageOpen = openStage === key;
                                const allTasks = stageOpen ? tasksFor(sg.stage) : [];
                                const pendingTasks = allTasks.filter((e) => !isDone(e));
                                const historyTasks = allTasks.filter(isDone);
                                const tasks = taskTab === 'Pending' ? pendingTasks : historyTasks;
                                const path = pagePath(sg.stage.page);
                                return (
                                  <React.Fragment key={key}>
                                    <tr onClick={() => setOpenStage(stageOpen ? '' : key)}
                                      className={`border-t border-slate-100 cursor-pointer hover:bg-slate-50 ${stageOpen ? 'bg-indigo-50/60' : ''}`}>
                                      <td className="px-3 py-2 font-medium text-slate-800">
                                        <span className="inline-flex items-center gap-2">
                                          {stageOpen ? <ChevronDown className="w-3.5 h-3.5 text-indigo-600" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                                          {sg.stage.name}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2 text-right"><span className="rounded-md border border-indigo-200 text-indigo-700 px-2 py-0.5 text-xs font-semibold">{sg.pending + sg.completed}</span></td>
                                      <td className="px-3 py-2 text-right font-semibold">{sg.pending}</td>
                                      <td className={`px-3 py-2 text-right ${sg.overdue ? 'text-rose-600 font-bold' : 'text-emerald-600'}`}>{sg.overdue}</td>
                                      <td className="px-3 py-2 text-right text-emerald-700 font-semibold">{sg.completed}</td>
                                      <td className="px-3 py-2 text-right"><OnTimeBadge value={sg.onTimePct} /></td>
                                    </tr>
                                    {stageOpen && (
                                      <tr className="bg-slate-50">
                                        <td colSpan={6} className="px-3 py-3">
                                          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                            <div className="flex gap-1">
                                              {[['Pending', pendingTasks.length], ['History', historyTasks.length]].map(([tab, count]) => (
                                                <button key={tab} type="button" onClick={() => setTaskTab(tab)}
                                                  className={`px-3 py-1.5 text-xs rounded-md border ${taskTab === tab ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                                                  {tab} ({count})
                                                </button>
                                              ))}
                                            </div>
                                            <div className="flex items-center gap-3">
                                              <p className="text-xs text-slate-500">
                                                Appears on the <b>{sg.stage.page}</b> page, {taskTab} tab.
                                              </p>
                                              {path && (
                                                <Link to={path} className="text-xs font-semibold text-indigo-600 hover:underline">
                                                  Open {sg.stage.page} page &rarr;
                                                </Link>
                                              )}
                                            </div>
                                          </div>
                                          <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                                            <table className="w-full text-sm">
                                              <thead className="sticky top-0 bg-slate-100 text-slate-500 text-[11px] uppercase tracking-wider">
                                                <tr>
                                                  <th className="text-left px-3 py-2">Task</th>
                                                  <th className="text-left px-3 py-2">Party</th>
                                                  <th className="text-left px-3 py-2">Appears on</th>
                                                  <th className="text-left px-3 py-2">Planned</th>
                                                  {taskTab === 'History' && <th className="text-left px-3 py-2">Actual</th>}
                                                  <th className="text-left px-3 py-2">{taskTab === 'History' ? 'Delay' : 'Status'}</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {tasks.slice(0, 200).map((e, i) => {
                                                  const done = isDone(e);
                                                  const late = !done && e.planned && e.planned < now ? (now - e.planned) / DAY : 0;
                                                  return (
                                                    <tr key={`${e.ref}-${i}`} className="border-t border-slate-100">
                                                      <td className="px-3 py-2 font-medium">{e.ref}</td>
                                                      <td className="px-3 py-2">{e.party}</td>
                                                      <td className="px-3 py-2 text-xs">
                                                        {path ? <Link to={path} className="text-indigo-600 hover:underline font-medium">{sg.stage.page}</Link> : sg.stage.page}
                                                        <span className="text-slate-400"> · {done ? 'History tab' : 'Pending tab'}</span>
                                                      </td>
                                                      <td className="px-3 py-2 text-xs font-mono">{formatAppDate(e.planned) || '—'}</td>
                                                      {taskTab === 'History' && <td className="px-3 py-2 text-xs font-mono">{formatAppDate(e.actual) || '—'}</td>}
                                                      <td className="px-3 py-2">
                                                        {done
                                                          ? (e.delay === null
                                                            ? <span className="text-slate-400">—</span>
                                                            : e.delay <= 0
                                                              ? <span className="rounded px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700">On time</span>
                                                              : <span className={`rounded px-2 py-0.5 text-xs font-medium ${e.delay > 3 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>{e.delay.toFixed(1)} days late</span>)
                                                          : late > 0
                                                            ? <span className={`rounded px-2 py-0.5 text-xs font-medium ${late > 3 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>{late.toFixed(1)} days overdue</span>
                                                            : <span className="rounded px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-600">Pending</span>}
                                                      </td>
                                                    </tr>
                                                  );
                                                })}
                                              </tbody>
                                            </table>
                                          </div>
                                          {tasks.length > 200 && <p className="pt-2 text-xs text-slate-400">Showing the first 200 of {tasks.length}.</p>}
                                        </td>
                                      </tr>
                                    )}
                                  </React.Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {ownerGroups.length === 0 && (
              <tr><td colSpan={7} className="text-center text-slate-400 py-6">{usersError ? `Users could not be loaded (${usersError}). Log in as Admin again to see owners.` : loading ? 'Loading...' : 'No owners found'}</td></tr>
            )}
          </tbody>
        </table>
        {allAccess.length > 0 && (
          <p className="px-4 py-3 text-xs text-slate-400 border-t border-slate-100">
            {allAccess.join(', ')} can open every page, so they are not counted as owners of any stage.
          </p>
        )}
      </section>

    </div>
  );
}
