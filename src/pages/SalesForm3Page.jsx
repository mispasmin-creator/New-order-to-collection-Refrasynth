import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import Modal from '../components/common/Modal';
import {
  Search,
  RefreshCw,
  Package,
  CheckCircle2,
  AlertCircle,
  ClipboardList,
  Eye,
} from 'lucide-react';

const fmtQty = (n) => {
  const num = Number(n) || 0;
  return Number.isInteger(num) ? String(num) : num.toFixed(2);
};

export default function SalesForm3Page() {
  const [orders, setOrders]                 = useState([]);
  const [loading, setLoading]               = useState(true);
  const [syncing, setSyncing]               = useState(false);
  const [error, setError]                   = useState('');
  const [successNotice, setSuccessNotice]   = useState('');
  const [searchQuery, setSearchQuery]       = useState('');
  const [statusTab, setStatusTab]           = useState('Pending'); // 'Pending' | 'History'

  const [dispatchEntries, setDispatchEntries]   = useState([]);
  const [billingEntries, setBillingEntries]     = useState([]);

  // Modal State
  const [isModalOpen, setIsModalOpen]       = useState(false);
  const [activeBatch, setActiveBatch]       = useState(null);
  const [submitting, setSubmitting]         = useState(false);
  const [status4, setStatus4]               = useState('');

  // View Modal State
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [viewBatch, setViewBatch]             = useState(null);

  const fetchAllData = async (showSync = false) => {
    if (showSync) setSyncing(true);
    else setLoading(true);
    setError('');
    try {
      const [ordersRes, dispatchRes, billingRes] = await Promise.all([
        api.getOrders(),
        api.getDispatchEntries(),
        api.getLogisticsEntries(),
      ]);

      if (ordersRes && ordersRes.success && Array.isArray(ordersRes.data)) {
        setOrders(ordersRes.data);
      } else {
        setError(ordersRes?.error || 'Could not fetch orders from Google Sheets.');
      }

      if (dispatchRes && dispatchRes.success && Array.isArray(dispatchRes.data)) {
        setDispatchEntries(dispatchRes.data);
      }

      if (billingRes && billingRes.success && Array.isArray(billingRes.data)) {
        setBillingEntries(billingRes.data);
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

  // Quick lookups
  const orderByDoNumber = useMemo(() => {
    const map = {};
    orders.forEach((o) => {
      const key = (o.doNumber || '').trim().toLowerCase();
      if (key) map[key] = o;
    });
    return map;
  }, [orders]);

  const dispatchByDNumber = useMemo(() => {
    const map = {};
    dispatchEntries.forEach((e) => {
      const key = (e.dNumber || '').trim().toLowerCase();
      if (key) map[key] = e;
    });
    return map;
  }, [dispatchEntries]);

  // Only Billing rows that already had an invoice made are eligible here
  const enrichedBillingEntries = useMemo(() => {
    return billingEntries
      .filter((e) => e.lgstNo && e.invoiceActual)
      .map((e) => {
        const dispatch = dispatchByDNumber[(e.dispatchNo || '').trim().toLowerCase()];
        const order = orderByDoNumber[(e.doNumber || '').trim().toLowerCase()];
        return {
          ...e,
          qtyToBeDispatched: dispatch?.qtyToBeDispatched || '',
          dateOfDispatch: dispatch?.dateOfDispatch || '',
          typeOfMeasurement: order?.typeOfMeasurement || '',
          partyPoNo: order?.partyPoNo || '',
          partyPoDate: order?.partyPoDate || '',
          partyNames: order?.partyNames || e.partyName || '',
        };
      });
  }, [billingEntries, dispatchByDNumber, orderByDoNumber]);

  // Group into the same shipment batches used across every earlier stage
  const batches = useMemo(() => {
    const groups = [];
    const indexByKey = {};
    enrichedBillingEntries.forEach((entry) => {
      const key = [
        String(entry.partyPoNo ?? '').trim().toLowerCase(),
        String(entry.partyPoDate ?? '').trim(),
        String(entry.partyNames ?? '').trim().toLowerCase(),
        String(entry.typeOfTransporting ?? '').trim().toLowerCase(),
        String(entry.dateOfDispatch ?? '').trim(),
      ].join('|');
      if (indexByKey[key] === undefined) {
        indexByKey[key] = groups.length;
        groups.push({ key, entries: [entry] });
      } else {
        groups[indexByKey[key]].entries.push(entry);
      }
    });
    return groups;
  }, [enrichedBillingEntries]);

  const isBatchDone = (batch) => batch.entries.every((e) => Boolean(e.salesFormActual));

  const filteredBatches = useMemo(() => {
    return batches.filter((batch) => {
      const done = isBatchDone(batch);
      if (statusTab === 'Pending' && done) return false;
      if (statusTab === 'History' && !done) return false;

      const q = searchQuery.toLowerCase();
      if (!q) return true;
      return batch.entries.some(
        (e) =>
          (e.doNumber && e.doNumber.toLowerCase().includes(q)) ||
          (e.partyPoNo && e.partyPoNo.toLowerCase().includes(q)) ||
          (e.partyNames && e.partyNames.toLowerCase().includes(q)) ||
          (e.productName && e.productName.toLowerCase().includes(q))
      );
    });
  }, [batches, statusTab, searchQuery]);

  const pendingCount = useMemo(() => batches.filter((b) => !isBatchDone(b)).length, [batches]);
  const completedCount = useMemo(() => batches.filter((b) => isBatchDone(b)).length, [batches]);

  const handleOpenModal = (batch) => {
    setActiveBatch(batch);
    setStatus4('');
    setIsModalOpen(true);
  };

  const handleOpenView = (batch) => {
    setViewBatch(batch);
    setIsViewModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!activeBatch) return;
    setSubmitting(true);
    try {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const istTime = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

      const pending = activeBatch.entries.filter((e) => !e.salesFormActual);
      if (pending.length === 0) {
        alert('All products in this shipment are already done.');
        setSubmitting(false);
        return;
      }

      const updatePayload = {
        'Actual 4': istTime,
        'Status4': status4 || '',
      };

      const results = await Promise.all(
        pending.map((e) => api.updateBillingFields(e.rowIndex, updatePayload))
      );
      const failed = results.find((r) => !r || !r.success);

      if (!failed) {
        const doNumbers = pending.map((e) => e.doNumber).join(', ');
        notifySuccess(`Sales Form 3 recorded for ${doNumbers}!`);

        setBillingEntries((prev) =>
          prev.map((e) =>
            pending.some((p) => p.rowIndex === e.rowIndex)
              ? { ...e, salesFormActual: istTime, salesFormStatus: status4 }
              : e
          )
        );

        setIsModalOpen(false);
      } else {
        alert(failed.error || 'Failed to update Billing sheet');
      }
    } catch (err) {
      alert(err.message || 'Error saving Sales Form 3 entry');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 space-y-4">
      {/* ── Sticky Page Header + Alerts + Filters ── */}
      <div className="shrink-0 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-slate-700 text-white shadow-sm">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800">Sales Form 3</h1>
              <p className="text-xs text-slate-500">
                {pendingCount} pending shipment{pendingCount === 1 ? '' : 's'} • Shipments with invoice made
              </p>
            </div>
          </div>
          <button
            onClick={() => fetchAllData(true)}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-xs disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Refresh'}
          </button>
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
              placeholder="Search pending shipments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setStatusTab('Pending')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                statusTab === 'Pending'
                  ? 'bg-white text-slate-700 shadow-xs font-bold'
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
              History ({completedCount})
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
                <th className="px-3.5 py-3 whitespace-nowrap">DO-Delivery Order No.</th>
                <th className="px-3.5 py-3 whitespace-nowrap">PARTY PO NO</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Party Names</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Product Name</th>
                <th className="px-3.5 py-3 whitespace-nowrap text-right">Qty</th>
                <th className="px-3.5 py-3 whitespace-nowrap">LGST No.</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Bill No.</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Status4</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan="10" className="py-20 text-center text-slate-400">
                    <div className="w-8 h-8 border-3 border-slate-700 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-xs font-medium text-slate-500">
                      Loading invoiced shipments from Google Sheets...
                    </p>
                  </td>
                </tr>
              ) : filteredBatches.length === 0 ? (
                <tr>
                  <td colSpan="10" className="py-16 text-center text-slate-400">
                    <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <h3 className="text-sm font-semibold text-slate-700">
                      No shipments in this stage
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      {statusTab === 'Pending'
                        ? 'Shipments with invoice made will appear here.'
                        : 'No shipments match your filter.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredBatches.map((batch) => {
                  const primary = batch.entries[0];
                  const isMulti = batch.entries.length > 1;
                  const doNumbers = batch.entries.map((e) => e.doNumber).filter(Boolean).join(', ');
                  const productNames = batch.entries.map((e) => e.productName).filter(Boolean);
                  const totalQty = batch.entries.reduce((sum, e) => sum + (parseFloat(e.qtyToBeDispatched) || 0), 0);
                  const lgstNos = [...new Set(batch.entries.map((e) => e.lgstNo).filter(Boolean))];
                  const billNos = [...new Set(batch.entries.map((e) => e.billNo).filter(Boolean))];
                  const done = isBatchDone(batch);

                  return (
                    <tr key={batch.key} className="hover:bg-slate-50/80 transition-colors">
                      <td className="sticky left-0 bg-white z-10 px-3 py-2 text-center whitespace-nowrap border-r border-slate-200 shadow-xs">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenView(batch)}
                            title={isMulti ? `View all ${batch.entries.length} products` : 'View Full Details'}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors relative"
                          >
                            <Eye className="w-4 h-4" />
                            {isMulti && (
                              <span className="absolute -top-1 -right-1 flex items-center justify-center w-3.5 h-3.5 bg-indigo-600 text-white text-[9px] font-bold rounded-full">
                                {batch.entries.length}
                              </span>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenModal(batch)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg shadow-sm hover:shadow-md transition-all ${
                              done
                                ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                : 'bg-slate-700 hover:bg-slate-800 text-white'
                            }`}
                          >
                            <ClipboardList className="w-3.5 h-3.5" />
                            {done ? 'Edit Sales Form 3' : 'Sales Form 3'}
                          </button>
                        </div>
                      </td>

                      <td className="px-3.5 py-3 whitespace-nowrap font-mono font-bold text-indigo-600" title={isMulti ? doNumbers : undefined}>
                        {isMulti ? `${primary.doNumber} +${batch.entries.length - 1}` : (primary.doNumber || '—')}
                      </td>
                      <td className="px-3.5 py-3 whitespace-nowrap font-semibold text-slate-800">
                        {primary.partyPoNo || '—'}
                      </td>
                      <td className="px-3.5 py-3 whitespace-nowrap font-semibold text-slate-800">
                        {primary.partyNames || '—'}
                      </td>
                      <td className="px-3.5 py-3 whitespace-nowrap text-slate-700" title={isMulti ? productNames.join(', ') : undefined}>
                        {isMulti ? `${batch.entries.length} products` : (primary.productName || '—')}
                      </td>
                      <td className="px-3.5 py-3 whitespace-nowrap text-right text-slate-800">
                        {fmtQty(totalQty)}
                      </td>
                      <td className="px-3.5 py-3 whitespace-nowrap">
                        <div className="flex flex-wrap gap-1">
                          {lgstNos.map((l) => (
                            <span key={l} className="inline-block px-2 py-0.5 rounded-md bg-slate-50 text-slate-600 border border-slate-200 text-[11px] font-mono font-semibold">
                              {l}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3.5 py-3 whitespace-nowrap text-slate-700">
                        {billNos.join(', ') || '—'}
                      </td>
                      <td className="px-3.5 py-3 whitespace-nowrap text-slate-700">
                        {primary.salesFormStatus || '—'}
                      </td>
                      <td className="px-3.5 py-3 whitespace-nowrap">
                        {done ? (
                          <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Done
                          </span>
                        ) : (
                          <span className="text-amber-600 font-medium text-[11px]">Pending</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Sales Form 3 Modal ───────────────────────────────────────────── */}
      {isModalOpen && activeBatch && (() => {
        const primary = activeBatch.entries[0];
        const isMulti = activeBatch.entries.length > 1;

        return (
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={`Sales Form 3 — ${primary.doNumber || ''}${isMulti ? ` + ${activeBatch.entries.length - 1} more` : ''}`}
          maxWidth="max-w-2xl"
        >
          <div className="space-y-5">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-medium">
              <CheckCircle2 className="w-4 h-4 text-slate-500 shrink-0" />
              This will apply to all {activeBatch.entries.length} product{activeBatch.entries.length === 1 ? '' : 's'} in this shipment.
            </div>

            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Products In This Shipment ({activeBatch.entries.length})
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {activeBatch.entries.map((e, idx) => (
                  <div key={e.rowIndex ?? idx} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50">
                    <p className="text-xs font-semibold text-slate-800">
                      {e.productName || 'Product'}
                      <span className="ml-1.5 font-mono font-normal text-indigo-600">
                        ({e.doNumber} / {e.lgstNo})
                      </span>
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {fmtQty(e.qtyToBeDispatched)} {e.typeOfMeasurement || 'MT'}
                      {e.salesFormActual && (
                        <span className="ml-1.5 text-emerald-600 font-semibold">— Already done</span>
                      )}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Status4
              </label>
              <input
                type="text"
                value={status4}
                onChange={(e) => setStatus4(e.target.value)}
                placeholder="Enter status..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>

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
                onClick={handleSubmit}
                className="px-5 py-2 text-xs font-semibold text-white bg-slate-700 hover:bg-slate-800 active:bg-slate-900 rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {submitting ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </Modal>
        );
      })()}

      {/* ── View Details Modal (Read-Only) ──────────────────────────────── */}
      {isViewModalOpen && viewBatch && (() => {
        const primary = viewBatch.entries[0];
        const isMulti = viewBatch.entries.length > 1;

        return (
        <Modal
          isOpen={isViewModalOpen}
          onClose={() => setIsViewModalOpen(false)}
          title={`Shipment Details — ${primary.doNumber || ''}${isMulti ? ` + ${viewBatch.entries.length - 1} more` : ''}`}
          maxWidth="max-w-2xl"
        >
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 bg-slate-50 rounded-xl p-4 border border-slate-200 text-xs">
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">DO Number{isMulti ? 's' : ''}</p>
                <p className="font-bold text-indigo-600 font-mono text-sm">{viewBatch.entries.map((e) => e.doNumber).join(', ') || '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Party PO No.</p>
                <p className="font-semibold text-slate-800">{primary.partyPoNo || '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Party Name</p>
                <p className="font-semibold text-slate-800">{primary.partyNames || '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Bill No.</p>
                <p className="text-slate-700">{primary.billNo || '—'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-1">
                  Product{isMulti ? `s (${viewBatch.entries.length})` : ''}
                </p>
                <div className="space-y-1">
                  {viewBatch.entries.map((e, idx) => (
                    <p key={e.rowIndex ?? idx} className="text-slate-700">
                      <span className="font-mono font-bold text-indigo-600 mr-1.5">{e.doNumber}</span>
                      {e.productName || '—'} — {fmtQty(e.qtyToBeDispatched)} ({e.lgstNo})
                      {e.salesFormActual && (
                        <span className="ml-1.5 text-emerald-600 font-semibold">Done: {e.salesFormActual}</span>
                      )}
                    </p>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsViewModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
        );
      })()}
    </div>
  );
}
