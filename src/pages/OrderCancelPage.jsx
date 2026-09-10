import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import Modal from '../components/common/Modal';
import ExportButton from '../components/common/ExportButton';
import {
  Search,
  RefreshCw,
  Ban,
  CheckCircle2,
  XCircle,
  AlertCircle,
  PlusCircle,
} from 'lucide-react';

const fmtQty = (n) => {
  const num = Number(n) || 0;
  return Number.isInteger(num) ? String(num) : num.toFixed(2);
};

const emptyForm = () => ({
  orderKey: '',
  qty: '',
  reason: '',
});

export default function OrderCancelPage() {
  const [orders, setOrders]                 = useState([]);
  const [dispatchEntries, setDispatchEntries] = useState([]);
  const [cancelEntries, setCancelEntries]   = useState([]);
  const [maxCancelSeq, setMaxCancelSeq]     = useState(0);
  const [loading, setLoading]               = useState(true);
  const [syncing, setSyncing]               = useState(false);
  const [error, setError]                   = useState('');
  const [successNotice, setSuccessNotice]   = useState('');
  const [searchQuery, setSearchQuery]       = useState('');
  const [statusTab, setStatusTab]           = useState('Pending'); // 'Pending' | 'History'

  // Request modal
  const [isRequestOpen, setIsRequestOpen]   = useState(false);
  const [form, setForm]                     = useState(emptyForm());
  const [submitting, setSubmitting]         = useState(false);

  // Mgmt Approval modal
  const [approvalEntry, setApprovalEntry]   = useState(null);
  const [approving, setApproving]           = useState(false);

  const fetchAllData = async (showSync = false) => {
    if (showSync) setSyncing(true);
    else setLoading(true);
    setError('');
    try {
      const [ordersRes, dispatchRes, cancelRes] = await Promise.all([
        api.getOrders(),
        api.getDispatchEntries(),
        api.getOrderCancelEntries(),
      ]);

      if (ordersRes && ordersRes.success && Array.isArray(ordersRes.data)) {
        setOrders(ordersRes.data);
      } else {
        setError(ordersRes?.error || 'Could not fetch orders from Google Sheets.');
      }

      if (dispatchRes && dispatchRes.success && Array.isArray(dispatchRes.data)) {
        setDispatchEntries(dispatchRes.data);
      }

      if (cancelRes && cancelRes.success && Array.isArray(cancelRes.data)) {
        setCancelEntries(cancelRes.data);
        setMaxCancelSeq(cancelRes.maxCancelSeq || 0);
      }
    } catch (err) {
      setError(err.message || 'Error fetching data.');
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  const notifySuccess = (msg) => {
    setSuccessNotice(msg);
    setTimeout(() => setSuccessNotice(''), 4500);
  };

  const isResolved = (entry) => Boolean(entry.actual || entry.status);

  const pendingCount = useMemo(
    () => cancelEntries.filter((e) => !isResolved(e)).length,
    [cancelEntries]
  );
  const historyCount = useMemo(
    () => cancelEntries.filter((e) => isResolved(e)).length,
    [cancelEntries]
  );

  const filteredEntries = useMemo(() => {
    return cancelEntries.filter((e) => {
      const resolved = isResolved(e);
      if (statusTab === 'Pending' && resolved) return false;
      if (statusTab === 'History' && !resolved) return false;

      const q = searchQuery.toLowerCase();
      if (!q) return true;
      return (
        (e.cancelNo && e.cancelNo.toLowerCase().includes(q)) ||
        (e.doNumber && e.doNumber.toLowerCase().includes(q)) ||
        (e.partyNames && e.partyNames.toLowerCase().includes(q)) ||
        (e.productName && e.productName.toLowerCase().includes(q))
      );
    });
  }, [cancelEntries, statusTab, searchQuery]);

  // Order lines eligible for a new cancellation request — skip lines that
  // already have a Pending (unresolved) cancel request against them.
  const pendingKeys = useMemo(() => {
    const set = new Set();
    cancelEntries.forEach((e) => {
      if (!isResolved(e)) {
        set.add(`${(e.doNumber || '').trim().toLowerCase()}|${(e.productName || '').trim().toLowerCase()}`);
      }
    });
    return set;
  }, [cancelEntries]);

  const orderLineOptions = useMemo(() => {
    return orders
      .map((o, idx) => ({ ...o, orderKey: `${idx}` }))
      .filter((o) => o.doNumber && o.productName)
      .filter((o) => !pendingKeys.has(`${(o.doNumber || '').trim().toLowerCase()}|${(o.productName || '').trim().toLowerCase()}`));
  }, [orders, pendingKeys]);

  const selectedOrderLine = useMemo(
    () => orderLineOptions.find((o) => o.orderKey === form.orderKey) || null,
    [orderLineOptions, form.orderKey]
  );

  // Dispatched quantity per DO+Product, so the modal can show how much of an
  // order line is already dispatched vs. still pending (and worth cancelling).
  const dispatchedByLineKey = useMemo(() => {
    const map = {};
    dispatchEntries.forEach((e) => {
      const key = `${(e.doNumber || '').trim().toLowerCase()}|${(e.productName || '').trim().toLowerCase()}`;
      map[key] = (map[key] || 0) + (parseFloat(e.qtyToBeDispatched) || 0);
    });
    return map;
  }, [dispatchEntries]);

  const getDispatchedQty = (line) =>
    dispatchedByLineKey[`${(line.doNumber || '').trim().toLowerCase()}|${(line.productName || '').trim().toLowerCase()}`] || 0;
  const getPendingQty = (line) => Math.max(0, (Number(line.quantity) || 0) - getDispatchedQty(line));

  const buildExportRows = () => filteredEntries.map((e) => ({
    'Cancel No.': e.cancelNo,
    'Timestamp': e.timestamp,
    'DO-Delivery Order No.': e.doNumber,
    'Party Names': e.partyNames,
    'Product Name': e.productName,
    'Qty': e.qty,
    'Reason': e.reason,
    'Status': e.status || 'Pending Approval',
  }));

  const handleOpenRequest = () => {
    setForm(emptyForm());
    setIsRequestOpen(true);
  };

  const handleSelectOrderLine = (orderKey) => {
    const line = orderLineOptions.find((o) => o.orderKey === orderKey);
    setForm({
      orderKey,
      qty: line ? getPendingQty(line) : '',
      reason: '',
    });
  };

  const handleSubmitRequest = async () => {
    if (!selectedOrderLine) {
      alert('Please select an order to cancel.');
      return;
    }
    if (!form.qty || Number(form.qty) <= 0) {
      alert('Please enter a valid quantity.');
      return;
    }
    if (!form.reason.trim()) {
      alert('Please enter a reason for cancellation.');
      return;
    }

    setSubmitting(true);
    try {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const istTime = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      const cancelNo = `CANC-${pad(maxCancelSeq + 1)}`;

      const row = {
        'Timestamp': istTime,
        'Cancel No.': cancelNo,
        'DO-Delivery Order No.': selectedOrderLine.doNumber || '',
        'Party Names': selectedOrderLine.partyNames || '',
        'Product Name': selectedOrderLine.productName || '',
        'Qty': form.qty,
        'Reason': form.reason.trim(),
      };

      const res = await api.insertOrderCancelRows([row]);
      if (res && res.success) {
        notifySuccess(`Cancellation request ${cancelNo} submitted for Mgmt Approval!`);
        setMaxCancelSeq((prev) => prev + 1);
        setIsRequestOpen(false);
        fetchAllData(true);
      } else {
        alert(res?.error || 'Failed to submit cancellation request');
      }
    } catch (err) {
      alert(err.message || 'Error submitting cancellation request');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (status) => {
    if (!approvalEntry) return;
    setApproving(true);
    try {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const istTime = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

      const res = await api.updateOrderCancelFields(approvalEntry.rowIndex, {
        'Actual': istTime,
        'Status': status,
      });

      if (res && res.success) {
        notifySuccess(`${approvalEntry.cancelNo} marked as ${status}!`);
        setCancelEntries((prev) =>
          prev.map((e) =>
            e.rowIndex === approvalEntry.rowIndex ? { ...e, actual: istTime, status } : e
          )
        );
        setApprovalEntry(null);
      } else {
        alert(res?.error || 'Failed to update Order Cancel sheet');
      }
    } catch (err) {
      alert(err.message || 'Error saving Mgmt Approval');
    } finally {
      setApproving(false);
    }
  };

  const statusBadge = (status) => {
    if (status === 'Approved') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="w-3 h-3" /> Approved
        </span>
      );
    }
    if (status === 'Rejected') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
          <XCircle className="w-3 h-3" /> Rejected
        </span>
      );
    }
    return <span className="text-amber-600 font-medium text-[11px]">Pending Approval</span>;
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 space-y-4">
      {/* ── Sticky Page Header + Alerts + Filters ── */}
      <div className="shrink-0 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-rose-600 text-white shadow-sm">
              <Ban className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800">Order Cancel</h1>
              <p className="text-xs text-slate-500">
                {pendingCount} request{pendingCount === 1 ? '' : 's'} awaiting Mgmt Approval
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ExportButton getRows={buildExportRows} filename="Order Cancel" />
            <button
              onClick={() => fetchAllData(true)}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-xs disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Refresh'}
            </button>
            <button
              onClick={handleOpenRequest}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Request Cancellation
            </button>
          </div>
        </div>

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

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search cancellation requests..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-rose-300"
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setStatusTab('Pending')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                statusTab === 'Pending'
                  ? 'bg-white text-rose-600 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pending ({pendingCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusTab('History')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                statusTab === 'History'
                  ? 'bg-white text-slate-800 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              History ({historyCount})
            </button>
          </div>
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 bg-white rounded-xl border border-slate-200 shadow-2xs flex flex-col">
        <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto border-t border-slate-200">
          <table className="w-full text-left text-xs text-slate-600 border-collapse">
            <thead className="sticky top-0 bg-slate-100 z-20 shadow-xs border-b border-slate-300 font-semibold text-slate-700 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="sticky left-0 bg-slate-100 z-30 px-3.5 py-3 text-center whitespace-nowrap border-r border-slate-200 shadow-xs">
                  Action
                </th>
                <th className="px-3.5 py-3 whitespace-nowrap">Cancel No.</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Timestamp</th>
                <th className="px-3.5 py-3 whitespace-nowrap">DO-Delivery Order No.</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Party Names</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Product Name</th>
                <th className="px-3.5 py-3 whitespace-nowrap text-right">Qty</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Reason</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan="9" className="py-20 text-center text-slate-400">
                    <div className="w-8 h-8 border-3 border-rose-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-xs font-medium text-slate-500">
                      Loading cancellation requests from Google Sheets...
                    </p>
                  </td>
                </tr>
              ) : filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan="9" className="py-16 text-center text-slate-400">
                    <Ban className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <h3 className="text-sm font-semibold text-slate-700">
                      No cancellation requests
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      {statusTab === 'Pending'
                        ? 'New cancellation requests will appear here.'
                        : 'No requests match your filter.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredEntries.map((entry) => (
                  <tr key={entry.rowIndex} className="hover:bg-slate-50/80 transition-colors">
                    <td className="sticky left-0 bg-white z-10 px-3 py-2 text-center whitespace-nowrap border-r border-slate-200 shadow-xs">
                      {isResolved(entry) ? (
                        <span className="text-slate-300 text-[11px]">—</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setApprovalEntry(entry)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg shadow-sm hover:shadow-md transition-all bg-amber-500 hover:bg-amber-600 text-white"
                        >
                          Mgmt Approval
                        </button>
                      )}
                    </td>
                    <td className="px-3.5 py-3 whitespace-nowrap font-mono font-bold text-rose-600">
                      {entry.cancelNo || '—'}
                    </td>
                    <td className="px-3.5 py-3 whitespace-nowrap text-slate-500">
                      {entry.timestamp || '—'}
                    </td>
                    <td className="px-3.5 py-3 whitespace-nowrap font-mono font-semibold text-indigo-600">
                      {entry.doNumber || '—'}
                    </td>
                    <td className="px-3.5 py-3 whitespace-nowrap font-semibold text-slate-800">
                      {entry.partyNames || '—'}
                    </td>
                    <td className="px-3.5 py-3 whitespace-nowrap text-slate-700">
                      {entry.productName || '—'}
                    </td>
                    <td className="px-3.5 py-3 whitespace-nowrap text-right text-slate-800">
                      {fmtQty(entry.qty)}
                    </td>
                    <td className="px-3.5 py-3 max-w-xs truncate text-slate-600" title={entry.reason}>
                      {entry.reason || '—'}
                    </td>
                    <td className="px-3.5 py-3 whitespace-nowrap">
                      {statusBadge(entry.status)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Request Cancellation Modal ─────────────────────────────────── */}
      <Modal
        isOpen={isRequestOpen}
        onClose={() => setIsRequestOpen(false)}
        title="Request Order Cancellation"
        maxWidth="max-w-lg"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Select Order
            </label>
            <select
              value={form.orderKey}
              onChange={(e) => handleSelectOrderLine(e.target.value)}
              className="block w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400 focus:border-rose-400"
            >
              <option value="">— Choose a DO / Product to cancel —</option>
              {orderLineOptions.map((o) => (
                <option key={o.orderKey} value={o.orderKey}>
                  {o.doNumber} — {o.productName} — {o.partyNames} ({fmtQty(o.quantity)}{o.typeOfMeasurement ? ` ${o.typeOfMeasurement}` : ''})
                </option>
              ))}
            </select>
          </div>

          {selectedOrderLine && (
            <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Party Name</p>
                <p className="font-semibold text-slate-800">{selectedOrderLine.partyNames || '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Order Qty</p>
                <p className="font-semibold text-slate-800">
                  {fmtQty(selectedOrderLine.quantity)}{selectedOrderLine.typeOfMeasurement ? ` ${selectedOrderLine.typeOfMeasurement}` : ''}
                </p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Dispatched Qty</p>
                <p className="font-semibold text-slate-800">
                  {fmtQty(getDispatchedQty(selectedOrderLine))}{selectedOrderLine.typeOfMeasurement ? ` ${selectedOrderLine.typeOfMeasurement}` : ''}
                </p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Pending Qty</p>
                <p className="font-semibold text-amber-600">
                  {fmtQty(getPendingQty(selectedOrderLine))}{selectedOrderLine.typeOfMeasurement ? ` ${selectedOrderLine.typeOfMeasurement}` : ''}
                </p>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Qty To Cancel
            </label>
            <input
              type="number"
              min="0"
              step="any"
              value={form.qty}
              onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))}
              placeholder="Enter quantity"
              className="block w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400 focus:border-rose-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Reason
            </label>
            <textarea
              rows={3}
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder="Why is this order being cancelled?"
              className="block w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400 focus:border-rose-400 resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsRequestOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg"
            >
              Close
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmitRequest}
              className="px-5 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {submitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Mgmt Approval Modal ───────────────────────────────────────── */}
      <Modal
        isOpen={Boolean(approvalEntry)}
        onClose={() => setApprovalEntry(null)}
        title={`Mgmt Approval — ${approvalEntry?.cancelNo || ''}`}
        maxWidth="max-w-md"
      >
        {approvalEntry && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">DO Number</p>
                <p className="font-mono font-bold text-indigo-600">{approvalEntry.doNumber || '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Party Name</p>
                <p className="font-semibold text-slate-800">{approvalEntry.partyNames || '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Product</p>
                <p className="text-slate-700">{approvalEntry.productName || '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Qty</p>
                <p className="text-slate-700">{fmtQty(approvalEntry.qty)}</p>
              </div>
              <div className="col-span-2">
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Reason</p>
                <p className="text-slate-700">{approvalEntry.reason || '—'}</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={approving}
                onClick={() => handleApprove('Rejected')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg disabled:opacity-50"
              >
                <XCircle className="w-3.5 h-3.5" />
                Reject
              </button>
              <button
                type="button"
                disabled={approving}
                onClick={() => handleApprove('Approved')}
                className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-lg shadow-sm disabled:opacity-50"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {approving ? 'Saving...' : 'Approve'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
