import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import StatCard from '../components/common/StatCard';
import {
  ShoppingCart,
  IndianRupee,
  Clock,
  TrendingUp,
  ArrowRight,
  RefreshCw,
  ClipboardCheck,
  Truck,
  Boxes,
  FileText,
  PackageCheck,
  BarChart3,
  Trophy,
  AlertCircle,
  CalendarDays,
} from 'lucide-react';

const fmtQty = (n) => {
  const num = Number(n) || 0;
  return Number.isInteger(num) ? num.toLocaleString('en-IN') : num.toFixed(2);
};

// Parses the app's "dd/MM/yyyy HH:mm:ss" timestamp format into a Date, or null
const parseTimestamp = (ts) => {
  if (!ts) return null;
  const m = String(ts).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
};

const isSameDay = (a, b) =>
  a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function DashboardPage() {
  const [orders, setOrders]                 = useState([]);
  const [dispatchEntries, setDispatchEntries] = useState([]);
  const [billingEntries, setBillingEntries]   = useState([]);
  const [loading, setLoading]               = useState(true);
  const [syncing, setSyncing]               = useState(false);

  const loadData = async (isSync = false) => {
    if (isSync) setSyncing(true);
    else setLoading(true);

    try {
      const [ordersRes, dispatchRes, billingRes] = await Promise.all([
        api.getOrders(),
        api.getDispatchEntries(),
        api.getLogisticsEntries(),
      ]);
      if (ordersRes && ordersRes.success && Array.isArray(ordersRes.data)) {
        setOrders(ordersRes.data);
      }
      if (dispatchRes && dispatchRes.success && Array.isArray(dispatchRes.data)) {
        setDispatchEntries(dispatchRes.data);
      }
      if (billingRes && billingRes.success && Array.isArray(billingRes.data)) {
        setBillingEntries(billingRes.data);
      }
    } catch (err) {
      console.error('Error loading dashboard data', err);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // ── Core metrics, derived from the real FMS/Dispatch/Billing sheet fields ──
  const totalOrders = orders.length;
  const totalPoValue = useMemo(() => orders.reduce((sum, o) => sum + (Number(o.totalPoValue) || 0), 0), [orders]);

  const dispatchedDoSet = useMemo(() => {
    const set = new Set();
    dispatchEntries.forEach((e) => {
      const key = (e.doNumber || '').trim().toLowerCase();
      if (key) set.add(key);
    });
    return set;
  }, [dispatchEntries]);

  const arrangedCount = useMemo(() => billingEntries.filter((e) => e.lgstNo).length, [billingEntries]);
  const invoicedCount = useMemo(() => billingEntries.filter((e) => e.invoiceActual).length, [billingEntries]);
  const kittingDoneCount = useMemo(() => billingEntries.filter((e) => e.kittingActual).length, [billingEntries]);

  // Whole order-to-collection pipeline, in the real sequence this app implements
  const pipeline = useMemo(() => {
    const checkPoApproved = orders.filter((o) => o.status1 === 'Approved').length;
    const accountsReceived = orders.filter((o) => Boolean(o.actual2)).length;
    const deliveryChecked = orders.filter((o) => Boolean(o.actual3)).length;
    const dispatched = orders.filter((o) => dispatchedDoSet.has((o.doNumber || '').trim().toLowerCase())).length;

    return [
      { label: 'Orders Created', count: totalOrders, color: 'bg-slate-400', to: '/orders' },
      { label: 'Check PO Approved', count: checkPoApproved, color: 'bg-indigo-500', to: '/check-po' },
      { label: 'Accounts Received', count: accountsReceived, color: 'bg-violet-500', to: '/received-accounts' },
      { label: 'Delivery Checked', count: deliveryChecked, color: 'bg-blue-500', to: '/check-for-delivery' },
      { label: 'Dispatched', count: dispatched, color: 'bg-amber-500', to: '/dispatch-planning' },
      { label: 'Logistics Arranged', count: arrangedCount, color: 'bg-orange-500', to: '/arrange-logistics' },
      { label: 'Invoiced', count: invoicedCount, color: 'bg-teal-500', to: '/make-invoice' },
      { label: 'Full Kitting Done', count: kittingDoneCount, color: 'bg-emerald-500', to: '/full-kitting' },
    ];
  }, [orders, dispatchedDoSet, arrangedCount, invoicedCount, kittingDoneCount, totalOrders]);

  const checkPoPendingCount = useMemo(() => orders.filter((o) => !o.status1).length, [orders]);
  const maxPipelineCount = Math.max(1, ...pipeline.map((p) => p.count));

  // Which DO numbers have fully finished the pipeline (Full Kitting done)
  const kittingDoneDoSet = useMemo(() => {
    const set = new Set();
    billingEntries.forEach((e) => {
      if (e.kittingActual) {
        const key = (e.doNumber || '').trim().toLowerCase();
        if (key) set.add(key);
      }
    });
    return set;
  }, [billingEntries]);

  // Today's Sales — sum of Total PO Value for orders placed today
  const todaysSales = useMemo(() => {
    const today = new Date();
    return orders.reduce((sum, o) => {
      const d = parseTimestamp(o.timestamp);
      return isSameDay(d, today) ? sum + (Number(o.totalPoValue) || 0) : sum;
    }, 0);
  }, [orders]);

  // 7-day Sales Trend — PO value received each of the last 7 days
  const salesTrend = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push({ date: d, label: WEEKDAY_LABELS[d.getDay()], dateLabel: `${d.getDate()}/${d.getMonth() + 1}`, value: 0 });
    }
    orders.forEach((o) => {
      const d = parseTimestamp(o.timestamp);
      if (!d) return;
      const bucket = days.find((day) => isSameDay(day.date, d));
      if (bucket) bucket.value += Number(o.totalPoValue) || 0;
    });
    return days;
  }, [orders]);
  const maxTrendValue = Math.max(1, ...salesTrend.map((d) => d.value));

  // Best / Top Parties — ranked by total PO value across all their orders
  const topParties = useMemo(() => {
    const map = {};
    orders.forEach((o) => {
      const name = (o.partyNames || '').trim();
      if (!name) return;
      if (!map[name]) map[name] = { name, value: 0, orderCount: 0 };
      map[name].value += Number(o.totalPoValue) || 0;
      map[name].orderCount += 1;
    });
    return Object.values(map).sort((a, b) => b.value - a.value).slice(0, 5);
  }, [orders]);
  const maxPartyValue = Math.max(1, ...topParties.map((p) => p.value));

  // Pending Orders — haven't finished Full Kitting yet, oldest first
  const pendingOrdersList = useMemo(() => {
    return orders
      .filter((o) => !kittingDoneDoSet.has((o.doNumber || '').trim().toLowerCase()))
      .sort((a, b) => new Date(parseTimestamp(a.timestamp) || 0) - new Date(parseTimestamp(b.timestamp) || 0))
      .slice(0, 5);
  }, [orders, kittingDoneDoSet]);
  const pendingOrdersCount = useMemo(
    () => orders.filter((o) => !kittingDoneDoSet.has((o.doNumber || '').trim().toLowerCase())).length,
    [orders, kittingDoneDoSet]
  );

  const recentOrders = useMemo(() => {
    return [...orders]
      .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
      .slice(0, 6);
  }, [orders]);

  const stageBadge = (order) => {
    if (!order.status1) return { label: 'Awaiting Check PO', cls: 'bg-slate-100 text-slate-700' };
    if (order.status1 !== 'Approved') return { label: order.status1, cls: 'bg-rose-50 text-rose-700 border border-rose-200' };
    if (!order.actual2) return { label: 'Accounts Pending', cls: 'bg-amber-50 text-amber-700 border border-amber-200' };
    if (!order.actual3) return { label: 'Delivery Check Pending', cls: 'bg-blue-50 text-blue-700 border border-blue-200' };
    if (!dispatchedDoSet.has((order.doNumber || '').trim().toLowerCase())) return { label: 'Ready To Dispatch', cls: 'bg-violet-50 text-violet-700 border border-violet-200' };
    return { label: 'Dispatched', cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' };
  };

  return (
    <div className="h-full overflow-y-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 m-0">Executive Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">
            Live overview of the Order-to-Collection pipeline
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={syncing || loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-2xs transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin text-indigo-600' : 'text-slate-500'}`} />
            <span>{syncing ? 'Refreshing...' : 'Refresh Sheet Data'}</span>
          </button>

          <Link
            to="/orders"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-sm shadow-indigo-200 transition-all"
          >
            <span>Manage All Orders</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
        <StatCard
          title="Total Orders"
          value={loading ? '...' : totalOrders}
          subtitle="Products received from customers"
          icon={ShoppingCart}
          iconBg="bg-indigo-50 text-indigo-600"
        />

        <StatCard
          title="Total PO Value"
          value={loading ? '...' : `₹${(totalPoValue / 100000).toFixed(2)} L`}
          subtitle={`₹${totalPoValue.toLocaleString('en-IN')}`}
          icon={IndianRupee}
          iconBg="bg-emerald-50 text-emerald-600"
        />

        <StatCard
          title="Today's Sales"
          value={loading ? '...' : `₹${todaysSales.toLocaleString('en-IN')}`}
          subtitle="Total PO Value received today"
          icon={CalendarDays}
          iconBg="bg-sky-50 text-sky-600"
        />

        <StatCard
          title="Pending Orders"
          value={loading ? '...' : pendingOrdersCount}
          subtitle="Not yet through Full Kitting"
          icon={Clock}
          iconBg="bg-amber-50 text-amber-600"
        />

        <StatCard
          title="Full Kitting Done"
          value={loading ? '...' : kittingDoneCount}
          subtitle={`${arrangedCount ? Math.round((kittingDoneCount / arrangedCount) * 100) : 0}% of arranged shipments`}
          icon={PackageCheck}
          iconBg="bg-emerald-50 text-emerald-600"
        />
      </div>

      {/* Sales Trend + Top Parties + Pending Orders */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales Trend Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-6 shadow-2xs">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-indigo-600" />
              <div>
                <h3 className="text-base font-semibold text-slate-800">Sales Trend</h3>
                <p className="text-xs text-slate-500 mt-0.5">Total PO Value received — last 7 days</p>
              </div>
            </div>
          </div>

          <div className="flex items-end justify-between gap-2 h-40">
            {salesTrend.map((day) => {
              const heightPct = Math.max(4, Math.round((day.value / maxTrendValue) * 100));
              const isToday = isSameDay(day.date, new Date());
              return (
                <div key={day.dateLabel} className="flex-1 flex flex-col items-center justify-end h-full gap-2">
                  <div
                    title={`₹${day.value.toLocaleString('en-IN')}`}
                    className={`w-full max-w-10 rounded-t-md transition-all duration-500 ${
                      isToday ? 'bg-indigo-600' : 'bg-indigo-200 hover:bg-indigo-300'
                    }`}
                    style={{ height: `${heightPct}%` }}
                  />
                  <span className={`text-[10px] font-semibold ${isToday ? 'text-indigo-600' : 'text-slate-400'}`}>
                    {day.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top Parties */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs">
          <div className="flex items-center gap-2 mb-5">
            <Trophy className="w-5 h-5 text-amber-500" />
            <div>
              <h3 className="text-base font-semibold text-slate-800">Top Parties</h3>
              <p className="text-xs text-slate-500 mt-0.5">Ranked by total PO value</p>
            </div>
          </div>

          {topParties.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">No party data yet.</p>
          ) : (
            <div className="space-y-3.5">
              {topParties.map((party, idx) => {
                const pct = Math.round((party.value / maxPartyValue) * 100);
                return (
                  <div key={party.name}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="flex items-center gap-1.5 min-w-0 text-slate-700 font-medium">
                        <span className={`shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
                          idx === 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {idx + 1}
                        </span>
                        <span className="truncate">{party.name}</span>
                      </span>
                      <span className="text-slate-500 shrink-0 ml-2">₹{(party.value / 100000).toFixed(1)}L</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${idx === 0 ? 'bg-amber-500' : 'bg-indigo-400'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Pending Orders */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-500" />
            <div>
              <h3 className="text-base font-semibold text-slate-800">Pending Orders</h3>
              <p className="text-xs text-slate-500 mt-0.5">Oldest orders still awaiting Full Kitting</p>
            </div>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
            {pendingOrdersCount} pending
          </span>
        </div>

        {pendingOrdersList.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-8">
            {loading ? 'Loading...' : 'No pending orders — everything is through Full Kitting.'}
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {pendingOrdersList.map((order, idx) => {
              const badge = stageBadge(order);
              return (
                <div key={order.rowIndex ?? idx} className="px-6 py-3 flex items-center justify-between gap-4 hover:bg-slate-50/60 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-xs font-semibold text-indigo-600 shrink-0">{order.doNumber || '—'}</span>
                    <span className="text-sm text-slate-700 truncate">{order.partyNames || '—'}</span>
                    <span className="text-xs text-slate-400 truncate hidden sm:inline">{order.productName || ''}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs font-semibold text-slate-700">
                      ₹{Number(order.totalPoValue || 0).toLocaleString('en-IN')}
                    </span>
                    <span className={`inline-block px-2 py-0.5 text-[11px] font-medium rounded-full ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Middle Grid: Pipeline & Quick Nav */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Order-to-Collection Pipeline */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-6 shadow-2xs">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-base font-semibold text-slate-800">Order-to-Collection Pipeline</h3>
              <p className="text-xs text-slate-500 mt-0.5">How many orders have reached each stage</p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
              Live Tracker
            </span>
          </div>

          <div className="space-y-4">
            {pipeline.map((stage) => {
              const pct = Math.round((stage.count / maxPipelineCount) * 100);
              return (
                <Link key={stage.label} to={stage.to} className="block group">
                  <div className="flex items-center justify-between text-xs font-medium mb-1.5">
                    <span className="text-slate-700 flex items-center gap-2 group-hover:text-indigo-600 transition-colors">
                      <span className={`w-2.5 h-2.5 rounded-full ${stage.color}`} />
                      {stage.label}
                    </span>
                    <span className="text-slate-500">
                      <strong className="text-slate-800">{stage.count}</strong>
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${stage.color}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Quick summary highlights */}
          <div className="mt-6 pt-5 border-t border-slate-100 grid grid-cols-3 gap-4 text-center">
            <div className="p-3 rounded-lg bg-slate-50">
              <div className="text-xs text-slate-500 font-medium">Avg PO Value</div>
              <div className="text-sm font-bold text-slate-800 mt-0.5">
                ₹{totalOrders ? Math.round(totalPoValue / totalOrders).toLocaleString('en-IN') : 0}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-slate-50">
              <div className="text-xs text-slate-500 font-medium">Logistics Arranged</div>
              <div className="text-sm font-bold text-orange-600 mt-0.5">
                {arrangedCount} shipments
              </div>
            </div>
            <div className="p-3 rounded-lg bg-slate-50">
              <div className="text-xs text-slate-500 font-medium">Invoiced</div>
              <div className="text-sm font-bold text-teal-600 mt-0.5">
                {invoicedCount} shipments
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions & System Info */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-indigo-600 mb-2">
              <TrendingUp className="w-5 h-5" />
              <h3 className="text-base font-semibold text-slate-800">Quick Navigation</h3>
            </div>
            <p className="text-xs text-slate-500 mb-5">
              Jump straight into the stage that needs attention
            </p>

            <div className="space-y-2.5">
              {[
                { to: '/check-po', label: 'Check PO', desc: `${checkPoPendingCount} pending approval`, icon: ClipboardCheck },
                { to: '/check-for-delivery', label: 'Check for Delivery', desc: 'Confirm stock before dispatch', icon: Truck },
                { to: '/arrange-logistics', label: 'Arrange Logistics', desc: `${arrangedCount} shipments arranged`, icon: Boxes },
                { to: '/make-invoice', label: 'Make Invoice', desc: `${invoicedCount} invoiced`, icon: FileText },
              ].map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/50 transition-colors group"
                >
                  <span className="p-1.5 rounded-lg bg-slate-100 text-slate-500 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors shrink-0">
                    <item.icon className="w-4 h-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-xs text-slate-800 group-hover:text-indigo-700">{item.label}</div>
                    <p className="text-[11px] text-slate-400 truncate">{item.desc}</p>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all shrink-0" />
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 text-xs text-slate-400 flex items-center justify-between">
            <span>Refrasynth O2C Portal</span>
            <span>Version 2.0</span>
          </div>
        </div>
      </div>

      {/* Recent Orders Preview */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-800">Recent Orders</h3>
            <p className="text-xs text-slate-500 mt-0.5">Latest orders synchronized from the FMS sheet</p>
          </div>
          <Link
            to="/orders"
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
          >
            <span>View All</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50/80 border-b border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-6 py-3">DO Number</th>
                <th className="px-6 py-3">Party PO No.</th>
                <th className="px-6 py-3">Party Name</th>
                <th className="px-6 py-3">Product</th>
                <th className="px-6 py-3 text-right">Qty</th>
                <th className="px-6 py-3 text-right">Total PO Value</th>
                <th className="px-6 py-3">Stage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="7" className="px-6 py-10 text-center text-slate-400 text-sm">
                    Loading orders from Google Sheets...
                  </td>
                </tr>
              ) : recentOrders.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-8 text-center text-slate-400 text-sm">
                    No orders recorded yet.
                  </td>
                </tr>
              ) : (
                recentOrders.map((order, idx) => {
                  const badge = stageBadge(order);
                  return (
                    <tr key={order.rowIndex ?? idx} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-6 py-3.5 font-mono text-xs font-semibold text-indigo-600">
                        {order.doNumber || '—'}
                      </td>
                      <td className="px-6 py-3.5 text-slate-700">{order.partyPoNo || '—'}</td>
                      <td className="px-6 py-3.5 font-medium text-slate-800">{order.partyNames || '—'}</td>
                      <td className="px-6 py-3.5 text-slate-600">{order.productName || '—'}</td>
                      <td className="px-6 py-3.5 text-right text-slate-700">{fmtQty(order.quantity)}</td>
                      <td className="px-6 py-3.5 text-right font-semibold text-slate-800">
                        ₹{Number(order.totalPoValue || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="px-6 py-3.5">
                        <span className={`inline-block px-2 py-0.5 text-[11px] font-medium rounded-full ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
