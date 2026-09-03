import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import StatCard from '../components/common/StatCard';
import {
  ShoppingCart,
  IndianRupee,
  Clock,
  CheckCircle2,
  TrendingUp,
  ArrowRight,
  RefreshCw,
  Truck,
  AlertCircle,
} from 'lucide-react';

export default function DashboardPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const loadData = async (isSync = false) => {
    if (isSync) setSyncing(true);
    else setLoading(true);

    try {
      const res = await api.getOrders();
      if (res && res.success && Array.isArray(res.data)) {
        setOrders(res.data);
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

  // Compute metrics from actual Sheet orders
  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((sum, o) => sum + (Number(o.amount) || 0), 0);
  const pendingOrders = orders.filter((o) => o.status === 'Pending' || o.status === 'Processing').length;
  const deliveredOrders = orders.filter((o) => o.status === 'Delivered').length;
  const shippedOrders = orders.filter((o) => o.status === 'Shipped').length;

  // Status breakdown calculations
  const statusCounts = {
    Delivered: deliveredOrders,
    Shipped: shippedOrders,
    Processing: orders.filter((o) => o.status === 'Processing').length,
    Pending: orders.filter((o) => o.status === 'Pending').length,
    Cancelled: orders.filter((o) => o.status === 'Cancelled').length,
  };

  const recentOrders = [...orders]
    .sort((a, b) => new Date(b.orderDate || 0) - new Date(a.orderDate || 0))
    .slice(0, 5);

  return (
    <div className="h-full overflow-y-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 m-0">Executive Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">
            Overview of live orders, collection status, and sales metrics
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          title="Total Orders"
          value={loading ? '...' : totalOrders}
          subtitle="All active & completed orders"
          change="+12.5%"
          isPositive={true}
          icon={ShoppingCart}
          iconBg="bg-indigo-50 text-indigo-600"
        />

        <StatCard
          title="Total Order Value"
          value={loading ? '...' : `₹${(totalRevenue / 100000).toFixed(2)} Lakh`}
          subtitle={`₹${totalRevenue.toLocaleString('en-IN')}`}
          change="+18.2%"
          isPositive={true}
          icon={IndianRupee}
          iconBg="bg-emerald-50 text-emerald-600"
        />

        <StatCard
          title="Pending / In-Process"
          value={loading ? '...' : pendingOrders}
          subtitle="Orders requiring action"
          change="-4.0%"
          isPositive={true}
          icon={Clock}
          iconBg="bg-amber-50 text-amber-600"
        />

        <StatCard
          title="Delivered Successfully"
          value={loading ? '...' : deliveredOrders}
          subtitle={`${totalOrders ? Math.round((deliveredOrders / totalOrders) * 100) : 0}% completion rate`}
          change="+8.5%"
          isPositive={true}
          icon={CheckCircle2}
          iconBg="bg-emerald-50 text-emerald-600"
        />
      </div>

      {/* Middle Grid: Status Pipeline & Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Order Fulfillment Pipeline */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-6 shadow-2xs">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-base font-semibold text-slate-800">Order Pipeline & Fulfillment</h3>
              <p className="text-xs text-slate-500 mt-0.5">Status breakdown across current orders</p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
              Live Tracker
            </span>
          </div>

          <div className="space-y-4">
            {Object.entries(statusCounts).map(([status, count]) => {
              const pct = totalOrders ? Math.round((count / totalOrders) * 100) : 0;
              const barColors = {
                Delivered: 'bg-emerald-500',
                Shipped: 'bg-blue-500',
                Processing: 'bg-amber-500',
                Pending: 'bg-orange-500',
                Cancelled: 'bg-rose-500',
              };

              return (
                <div key={status} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="text-slate-700 flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${barColors[status] || 'bg-slate-400'}`} />
                      {status}
                    </span>
                    <span className="text-slate-500">
                      <strong className="text-slate-800">{count}</strong> ({pct}%)
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${barColors[status] || 'bg-slate-400'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick summary highlights */}
          <div className="mt-6 pt-5 border-t border-slate-100 grid grid-cols-3 gap-4 text-center">
            <div className="p-3 rounded-lg bg-slate-50">
              <div className="text-xs text-slate-500 font-medium">Avg Order Size</div>
              <div className="text-sm font-bold text-slate-800 mt-0.5">
                ₹{totalOrders ? Math.round(totalRevenue / totalOrders).toLocaleString('en-IN') : 0}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-slate-50">
              <div className="text-xs text-slate-500 font-medium">In Transit</div>
              <div className="text-sm font-bold text-blue-600 mt-0.5">
                {shippedOrders} orders
              </div>
            </div>
            <div className="p-3 rounded-lg bg-slate-50">
              <div className="text-xs text-slate-500 font-medium">Ready For Collection</div>
              <div className="text-sm font-bold text-emerald-600 mt-0.5">
                {deliveredOrders} orders
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
              Jump straight into managing operations and collections
            </p>

            <div className="space-y-3">
              <Link
                to="/orders"
                className="block p-3.5 rounded-xl border border-indigo-100 bg-indigo-50/50 hover:bg-indigo-50 transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-sm text-indigo-950">View & Filter Orders</div>
                  <ArrowRight className="w-4 h-4 text-indigo-600 group-hover:translate-x-0.5 transition-transform" />
                </div>
                <p className="text-xs text-indigo-600/80 mt-1">
                  Search, filter, edit statuses, and add new orders
                </p>
              </Link>

              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50">
                <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                  Connected Google Sheet
                </div>
                <div className="space-y-1 text-xs text-slate-600">
                  <div className="flex items-center justify-between">
                    <span>Database Tabs:</span>
                    <span className="font-mono font-medium text-indigo-600">Users, Orders</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Sync Engine:</span>
                    <span className="font-medium text-slate-800">Google Apps Script Web App</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 text-xs text-slate-400 flex items-center justify-between">
            <span>Refrasynth O2C Portal</span>
            <span>Version 1.0</span>
          </div>
        </div>
      </div>

      {/* Recent Orders Preview */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-800">Recent Orders</h3>
            <p className="text-xs text-slate-500 mt-0.5">Latest 5 orders synchronized from the database</p>
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
                <th className="px-6 py-3">Order ID</th>
                <th className="px-6 py-3">Customer</th>
                <th className="px-6 py-3">Product</th>
                <th className="px-6 py-3">Amount</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentOrders.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-8 text-center text-slate-400 text-sm">
                    No orders recorded yet.
                  </td>
                </tr>
              ) : (
                recentOrders.map((order) => (
                  <tr key={order.orderId} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-6 py-3.5 font-mono text-xs font-semibold text-indigo-600">
                      {order.orderId}
                    </td>
                    <td className="px-6 py-3.5 font-medium text-slate-800">{order.customerName}</td>
                    <td className="px-6 py-3.5 text-slate-600">{order.product}</td>
                    <td className="px-6 py-3.5 font-semibold text-slate-800">
                      ₹{Number(order.amount || 0).toLocaleString('en-IN')}
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="inline-block px-2 py-0.5 text-xs font-medium rounded-full bg-slate-100 text-slate-700">
                        {order.status}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-xs text-slate-400">{order.orderDate}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
