import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import Modal from '../components/common/Modal';
import {
  Search,
  RefreshCw,
  Package,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  IndianRupee,
  Calendar,
} from 'lucide-react';

export default function ReceivedAccountsPage() {
  const [orders, setOrders]                 = useState([]);
  const [loading, setLoading]               = useState(true);
  const [syncing, setSyncing]               = useState(false);
  const [error, setError]                   = useState('');
  const [successNotice, setSuccessNotice]   = useState('');
  const [searchQuery, setSearchQuery]       = useState('');
  const [statusTab, setStatusTab]           = useState('Pending'); // 'Pending' | 'Completed' | 'All'

  // Modal State
  const [isModalOpen, setIsModalOpen]       = useState(false);
  const [activeOrder, setActiveOrder]       = useState(null);
  const [remark, setRemark]                 = useState('');
  const [submitting, setSubmitting]         = useState(false);

  // Fetch orders from Google Sheet FMS tab
  const fetchOrders = async (showSync = false) => {
    if (showSync) setSyncing(true);
    else setLoading(true);
    setError('');
    try {
      const res = await api.getOrders();
      if (res && res.success && Array.isArray(res.data)) {
        setOrders(res.data);
      } else {
        setError(res?.error || 'Could not fetch orders from Google Sheets.');
      }
    } catch (err) {
      setError(err.message || 'Error fetching orders.');
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const notifySuccess = (msg) => {
    setSuccessNotice(msg);
    setTimeout(() => setSuccessNotice(''), 4500);
  };

  // Base list: ONLY orders approved/done from Check PO stage
  const eligibleOrders = useMemo(() => {
    return orders.filter(
      (o) => o.actual1 || o.status1 === 'Approved' || o.status1 === 'Yes'
    );
  }, [orders]);

  // Tab & Search filtered orders
  const filteredOrders = useMemo(() => {
    return eligibleOrders.filter((order) => {
      // Tab filter
      const isDone = Boolean(order.actual2);
      if (statusTab === 'Pending' && isDone) return false;
      if (statusTab === 'Completed' && !isDone) return false;

      // Search filter
      const q = searchQuery.toLowerCase();
      if (!q) return true;
      return (
        (order.doNumber && order.doNumber.toLowerCase().includes(q)) ||
        (order.partyPoNo && order.partyPoNo.toLowerCase().includes(q)) ||
        (order.partyNames && order.partyNames.toLowerCase().includes(q)) ||
        (order.productName && order.productName.toLowerCase().includes(q)) ||
        (order.salesPersonName && order.salesPersonName.toLowerCase().includes(q))
      );
    });
  }, [eligibleOrders, statusTab, searchQuery]);

  // Counts for tabs
  const pendingCount = useMemo(
    () => eligibleOrders.filter((o) => !o.actual2).length,
    [eligibleOrders]
  );
  const completedCount = useMemo(
    () => eligibleOrders.filter((o) => Boolean(o.actual2)).length,
    [eligibleOrders]
  );

  // Open modal
  const handleOpenModal = (order) => {
    setActiveOrder(order);
    setRemark(order.remark2 || '');
    setIsModalOpen(true);
  };

  // Submit Entry: Updates ONLY Actual 2 and Remark 2 in FMS Sheet
  const handleSubmitEntry = async () => {
    if (!activeOrder) return;
    setSubmitting(true);
    try {
      // IST timestamp format: dd/MM/yyyy HH:mm:ss
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const istTime = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

      const updatePayload = {
        'Actual 2': istTime,
        'Remark 2': remark || '',
      };

      const res = await api.updateOrderFields(
        activeOrder.rowIndex,
        updatePayload,
        activeOrder.doNumber
      );

      if (res && res.success) {
        notifySuccess(
          `Order ${activeOrder.doNumber} entry submitted and forwarded to Check for Delivery!`
        );

        // Update local state so order is immediately marked done and moves to next page
        setOrders((prev) =>
          prev.map((o) =>
            o.doNumber === activeOrder.doNumber
              ? {
                  ...o,
                  actual2: istTime,
                  remark2: remark || '',
                }
              : o
          )
        );

        setIsModalOpen(false);
      } else {
        alert(res?.error || 'Failed to update Google Sheets');
      }
    } catch (err) {
      alert(err.message || 'Error updating order');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 space-y-4">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-blue-600 text-white shadow-sm">
            <IndianRupee className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">Received Accounts</h1>
            <p className="text-xs text-slate-500">
              {pendingCount} pending accounts check • Orders approved from Check PO
            </p>
          </div>
        </div>
        <button
          onClick={() => fetchOrders(true)}
          disabled={syncing}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-xs disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing...' : 'Refresh'}
        </button>
      </div>

      {/* ── Alerts ──────────────────────────────────────────────────────── */}
      {successNotice && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          {successNotice}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* ── Search & Filter Tabs ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search pending orders..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setStatusTab('Pending')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              statusTab === 'Pending'
                ? 'bg-white text-blue-600 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Pending Accounts ({pendingCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusTab('Completed')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              statusTab === 'Completed'
                ? 'bg-white text-emerald-600 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Completed ({completedCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusTab('All')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              statusTab === 'All'
                ? 'bg-white text-slate-800 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Approved ({eligibleOrders.length})
          </button>
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-270px)] border-t border-slate-200">
          <table className="w-full text-left text-xs text-slate-600 border-collapse">
            <thead className="sticky top-0 bg-slate-100 z-20 shadow-xs border-b border-slate-300 font-semibold text-slate-700 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="sticky left-0 bg-slate-100 z-30 px-3.5 py-3 text-center whitespace-nowrap border-r border-slate-200 shadow-xs">
                  Action
                </th>
                <th className="px-3.5 py-3 whitespace-nowrap">Timestamp</th>
                <th className="px-3.5 py-3 whitespace-nowrap">DO-Delivery Order No.</th>
                <th className="px-3.5 py-3 whitespace-nowrap">PARTY PO NO</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Party Names</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Product Name</th>
                <th className="px-3.5 py-3 whitespace-nowrap text-right">Quantity</th>
                <th className="px-3.5 py-3 whitespace-nowrap text-right">Rate</th>
                <th className="px-3.5 py-3 whitespace-nowrap text-right">Total PO Value</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Payment To Be Taken</th>
                <th className="px-3.5 py-3 whitespace-nowrap text-right">Advance</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Expected Delivery Date</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Check PO Remark (Remark 1)</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Accounts Remark (Remark 2)</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Upload SO</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan="15" className="py-20 text-center text-slate-400">
                    <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-xs font-medium text-slate-500">
                      Loading orders from Google Sheets...
                    </p>
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan="15" className="py-16 text-center text-slate-400">
                    <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <h3 className="text-sm font-semibold text-slate-700">
                      No orders in this stage
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      {statusTab === 'Pending'
                        ? 'Orders approved in "Check PO" will automatically appear here.'
                        : 'No orders match your filter.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order, idx) => (
                  <tr
                    key={order.doNumber || idx}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    {/* Sticky Action Button */}
                    <td className="sticky left-0 bg-white z-10 px-3 py-2 text-center whitespace-nowrap border-r border-slate-200 shadow-xs">
                      <button
                        type="button"
                        onClick={() => handleOpenModal(order)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg shadow-sm hover:shadow-md transition-all ${
                          order.actual2
                            ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                        }`}
                      >
                        <IndianRupee className="w-3.5 h-3.5" />
                        {order.actual2 ? 'Edit Remark' : 'Received Accounts'}
                      </button>
                    </td>

                    <td className="px-3.5 py-3 whitespace-nowrap text-slate-400 text-[11px] font-mono">
                      {api.formatDate(order.timestamp) || '—'}
                    </td>
                    <td className="px-3.5 py-3 whitespace-nowrap font-mono font-bold text-indigo-600">
                      {order.doNumber || '—'}
                    </td>
                    <td className="px-3.5 py-3 whitespace-nowrap font-semibold text-slate-800">
                      {order.partyPoNo || '—'}
                    </td>
                    <td className="px-3.5 py-3 whitespace-nowrap font-semibold text-slate-800">
                      {order.partyNames || '—'}
                    </td>
                    <td className="px-3.5 py-3 whitespace-nowrap text-slate-700">
                      {order.productName || '—'}
                    </td>
                    <td className="px-3.5 py-3 whitespace-nowrap text-right text-slate-800">
                      {order.quantity ? Number(order.quantity).toLocaleString('en-IN') : '—'}
                    </td>
                    <td className="px-3.5 py-3 whitespace-nowrap text-right text-slate-800">
                      {order.rateOfMaterial ? `₹${Number(order.rateOfMaterial).toLocaleString('en-IN')}` : '—'}
                    </td>
                    <td className="px-3.5 py-3 whitespace-nowrap text-right font-bold text-emerald-700">
                      {order.totalPoValue ? `₹${Number(order.totalPoValue).toLocaleString('en-IN')}` : '—'}
                    </td>
                    <td className="px-3.5 py-3 whitespace-nowrap text-slate-700">
                      {order.paymentToBeTaken || '—'}
                    </td>
                    <td className="px-3.5 py-3 whitespace-nowrap text-right text-slate-700">
                      {order.advance ? `₹${Number(order.advance).toLocaleString('en-IN')}` : '—'}
                    </td>
                    <td className="px-3.5 py-3 whitespace-nowrap text-indigo-600 font-medium">
                      {api.formatDate(order.expectedDeliveryDate) || '—'}
                    </td>
                    <td className="px-3.5 py-3 whitespace-nowrap text-slate-600">
                      {order.remark1 || '—'}
                    </td>
                    <td className="px-3.5 py-3 whitespace-nowrap text-slate-700 font-medium">
                      {order.remark2 || '—'}
                    </td>
                    <td className="px-3.5 py-3 whitespace-nowrap">
                      {order.uploadSo && order.uploadSo.startsWith('http') ? (
                        <a
                          href={order.uploadSo}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:text-indigo-800 underline inline-flex items-center gap-1"
                        >
                          Open SO <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Clean Received Accounts Modal ───────────────────────────────── */}
      {isModalOpen && activeOrder && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={`Received Accounts — ${activeOrder.doNumber || 'Order Details'}`}
          maxWidth="max-w-2xl"
        >
          <div className="space-y-5">
            {/* 1. Order Summary */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 bg-slate-50 rounded-xl p-4 border border-slate-200 text-xs">
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">
                  DO Number
                </p>
                <p className="font-bold text-indigo-600 font-mono text-sm">
                  {activeOrder.doNumber || '—'}
                </p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">
                  Party PO No.
                </p>
                <p className="font-semibold text-slate-800">{activeOrder.partyPoNo || '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">
                  Party Name
                </p>
                <p className="font-semibold text-slate-800">{activeOrder.partyNames || '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">
                  Product Name
                </p>
                <p className="text-slate-700">{activeOrder.productName || '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">
                  Quantity
                </p>
                <p className="text-slate-700">
                  {activeOrder.quantity ? Number(activeOrder.quantity).toLocaleString('en-IN') : '—'}
                </p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">
                  Rate
                </p>
                <p className="text-slate-700">
                  {activeOrder.rateOfMaterial ? `₹${Number(activeOrder.rateOfMaterial).toLocaleString('en-IN')}` : '—'}
                </p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">
                  Total PO Value
                </p>
                <p className="font-bold text-emerald-700">
                  {activeOrder.totalPoValue ? `₹${Number(activeOrder.totalPoValue).toLocaleString('en-IN')}` : '—'}
                </p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">
                  Payment To Be Taken
                </p>
                <p className="text-slate-700">{activeOrder.paymentToBeTaken || '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">
                  Advance
                </p>
                <p className="text-slate-700">
                  {activeOrder.advance ? `₹${Number(activeOrder.advance).toLocaleString('en-IN')}` : '—'}
                </p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">
                  Expected Delivery Date
                </p>
                <p className="text-indigo-600 font-medium">
                  {api.formatDate(activeOrder.expectedDeliveryDate) || '—'}
                </p>
              </div>
              {activeOrder.remark1 && (
                <div className="col-span-2">
                  <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">
                    Check PO Remark (Remark 1)
                  </p>
                  <p className="text-slate-700">{activeOrder.remark1}</p>
                </div>
              )}
            </div>

            {/* 2. Remark Input Field */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Remark <span className="text-slate-400 font-normal">(Remark 2)</span>
              </label>
              <textarea
                rows={3}
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder="Enter account remarks..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent resize-none"
              />
            </div>

            {/* 3. Footer with Submit Entry Button */}
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                Close
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmitEntry}
                className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {submitting ? 'Submitting to Sheet...' : 'Submit Entry'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}