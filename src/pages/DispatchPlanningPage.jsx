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
  ClipboardList,
  Send,
  Trash2,
  Eye,
} from 'lucide-react';

const TRANSPORTER_TYPE_OPTIONS = ['FOR', 'Ex-Works', 'To Pay', 'Self Pickup'];
const TEST_CERTIFICATE_OPTIONS = ['Yes', 'No'];

const fmtQty = (n) => {
  const num = Number(n) || 0;
  return Number.isInteger(num) ? String(num) : num.toFixed(2);
};

export default function DispatchPlanningPage() {
  const [orders, setOrders]                 = useState([]);
  const [loading, setLoading]               = useState(true);
  const [syncing, setSyncing]               = useState(false);
  const [error, setError]                   = useState('');
  const [successNotice, setSuccessNotice]   = useState('');
  const [searchQuery, setSearchQuery]       = useState('');
  const [statusTab, setStatusTab]           = useState('Pending'); // 'Pending' | 'History'

  // Dispatch Tab Entries from Google Sheets
  const [dispatchEntries, setDispatchEntries] = useState([]);
  const [maxDSeq, setMaxDSeq]                 = useState(0);

  // Modal State
  const [isModalOpen, setIsModalOpen]       = useState(false);
  const [activeGroup, setActiveGroup]       = useState([]);
  const [submitting, setSubmitting]         = useState(false);

  // View Modal State
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [viewGroup, setViewGroup]             = useState([]);

  // Modal form state
  const [removedDOs, setRemovedDOs]           = useState({});
  const [dispatchQtyByDo, setDispatchQtyByDo] = useState({});
  const [transporterType, setTransporterType] = useState('FOR');
  const [dispatchDate, setDispatchDate]       = useState('');
  const [testCertificateMade, setTestCertificateMade] = useState('');

  // Fetch orders from Google Sheet FMS tab and entries from Dispatch tab
  const fetchAllData = async (showSync = false) => {
    if (showSync) setSyncing(true);
    else setLoading(true);
    setError('');
    try {
      const [ordersRes, dispatchRes] = await Promise.all([
        api.getOrders(),
        api.getDispatchEntries(),
      ]);

      if (ordersRes && ordersRes.success && Array.isArray(ordersRes.data)) {
        setOrders(ordersRes.data);
      } else {
        setError(ordersRes?.error || 'Could not fetch orders from Google Sheets.');
      }

      if (dispatchRes && dispatchRes.success && Array.isArray(dispatchRes.data)) {
        setDispatchEntries(dispatchRes.data);
        if (dispatchRes.maxDSeq) {
          setMaxDSeq(dispatchRes.maxDSeq);
        }
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

  // Total already-dispatched quantity per DO number (sums every prior Dispatch sheet row)
  const dispatchedByDo = useMemo(() => {
    const map = {};
    dispatchEntries.forEach((e) => {
      const key = (e.doNumber || '').trim().toLowerCase();
      if (!key) return;
      map[key] = (map[key] || 0) + (parseFloat(e.qtyToBeDispatched) || 0);
    });
    return map;
  }, [dispatchEntries]);

  const getRemainingQty = (order) => {
    const orderQty = Number(order.quantity) || 0;
    const dispatched = dispatchedByDo[(order.doNumber || '').trim().toLowerCase()] || 0;
    return Math.max(0, orderQty - dispatched);
  };

  // Base list: ONLY orders passed Stage 3 (Check for Delivery: actual3 exists)
  const eligibleOrders = useMemo(() => {
    return orders.filter((o) => Boolean(o.actual3));
  }, [orders]);

  // Tab & Search filtered orders
  const filteredOrders = useMemo(() => {
    return eligibleOrders.filter((order) => {
      const isDone = getRemainingQty(order) <= 0.0001;
      if (statusTab === 'Pending' && isDone) return false;
      if (statusTab === 'History' && !isDone) return false;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligibleOrders, dispatchedByDo, statusTab, searchQuery]);

  // Group multi-product submissions (same Party PO No + Date + Party Name) into a
  // single row so one PO with several products reads — and gets dispatched — as one order
  const groupedOrders = useMemo(() => {
    const groups = [];
    const indexByKey = {};
    filteredOrders.forEach((order) => {
      const key = [
        String(order.partyPoNo ?? '').trim().toLowerCase(),
        String(order.partyPoDate ?? '').trim(),
        String(order.partyNames ?? '').trim().toLowerCase(),
      ].join('|');
      if (!order.partyPoNo || indexByKey[key] === undefined) {
        indexByKey[key] = groups.length;
        groups.push({ key: `${key}-${groups.length}`, orders: [order] });
      } else {
        groups[indexByKey[key]].orders.push(order);
      }
    });
    return groups;
  }, [filteredOrders]);

  // Counts
  const pendingCount = useMemo(
    () => eligibleOrders.filter((o) => getRemainingQty(o) > 0.0001).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [eligibleOrders, dispatchedByDo]
  );
  const completedCount = useMemo(
    () => eligibleOrders.filter((o) => getRemainingQty(o) <= 0.0001).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [eligibleOrders, dispatchedByDo]
  );

  // Open modal — accepts a single order or a group of orders sharing one PO
  const handleOpenModal = (orderOrGroup) => {
    const rows = Array.isArray(orderOrGroup) ? orderOrGroup : [orderOrGroup];
    setActiveGroup(rows);
    setRemovedDOs({});
    setDispatchQtyByDo(Object.fromEntries(rows.map((o) => [o.doNumber, ''])));
    setTransporterType(rows[0].typeOfTransporting || 'FOR');
    setDispatchDate('');
    setTestCertificateMade('');
    setIsModalOpen(true);
  };

  // Open View Modal — accepts a single order or a group of orders sharing one PO
  const handleOpenView = (orderOrGroup) => {
    setViewGroup(Array.isArray(orderOrGroup) ? orderOrGroup : [orderOrGroup]);
    setIsViewModalOpen(true);
  };

  const handleRemoveRow = (doNumber) => {
    setRemovedDOs((prev) => ({ ...prev, [doNumber]: true }));
  };

  const handleQtyChange = (doNumber, value) => {
    setDispatchQtyByDo((prev) => ({ ...prev, [doNumber]: value }));
  };

  const includedRows = activeGroup.filter((o) => !removedDOs[o.doNumber]);

  const allRowsValid =
    includedRows.length > 0 &&
    Boolean(transporterType) &&
    Boolean(dispatchDate) &&
    includedRows.every((o) => {
      const q = parseFloat(dispatchQtyByDo[o.doNumber]);
      return q > 0;
    });

  // Submit Dispatch: Inserts rows into 'Dispatch' tab with sequential D Numbers —
  // one row per included product, covering every DO in the group at once
  const handleSubmitDispatch = async () => {
    if (!allRowsValid) return;
    setSubmitting(true);
    try {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const istTime = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      const formattedDispatchDate = api.formatDate(dispatchDate) || '';

      let currentSeq = maxDSeq;
      const newEntriesForState = [];
      const rowsToInsert = [];

      includedRows.forEach((order) => {
        currentSeq += 1;
        const dNo = `D-${String(currentSeq).padStart(2, '0')}`;
        const qty = dispatchQtyByDo[order.doNumber];

        const rowObj = {
          'Timestamp': istTime,
          'D Number': dNo,
          'Delivery Order No.': order.doNumber || '',
          'Party Name': order.partyNames || '',
          'Product Name': order.productName || '',
          'Qty To Be Dispatched': qty,
          'Type Of Transporting': transporterType,
          'Date Of Dispatch': formattedDispatchDate,
          'Test Certificate Made': testCertificateMade || '',
        };

        newEntriesForState.push({
          ...rowObj,
          dNumber: dNo,
          doNumber: order.doNumber,
          qtyToBeDispatched: qty,
          typeOfTransporting: transporterType,
          dateOfDispatch: formattedDispatchDate,
        });

        rowsToInsert.push(rowObj);
      });

      const res = await api.insertDispatchRows(rowsToInsert);

      if (res && res.success) {
        const doNumbers = includedRows.map((o) => o.doNumber);
        const assignedD = rowsToInsert.map((r) => r['D Number']).join(', ');
        notifySuccess(
          doNumbers.length > 1
            ? `Dispatch plan for ${doNumbers.length} products (${doNumbers.join(', ')}) saved (${rowsToInsert.length} records: ${assignedD})!`
            : `Dispatch plan for Order ${doNumbers[0]} saved (${assignedD})!`
        );

        setMaxDSeq(currentSeq);
        setDispatchEntries((prev) => [...prev, ...newEntriesForState]);

        setIsModalOpen(false);
      } else {
        alert(res?.error || 'Failed to insert into Dispatch sheet');
      }
    } catch (err) {
      alert(err.message || 'Error submitting dispatch');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 space-y-4">
      {/* ── Sticky Page Header + Alerts + Filters (stays fixed like Navbar) ── */}
      <div className="shrink-0 space-y-4">
        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-sm">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800">Dispatch Planning</h1>
              <p className="text-xs text-slate-500">
                {pendingCount} pending dispatch • Orders passed Delivery Check
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

        {/* ── Alerts ───────────────────────────────────────────────────── */}
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

        {/* ── Search & Filter Tabs ─────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search pending orders..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>

          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setStatusTab('Pending')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                statusTab === 'Pending'
                  ? 'bg-white text-indigo-600 shadow-xs font-bold'
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
                <th className="px-3.5 py-3 whitespace-nowrap">Timestamp</th>
                <th className="px-3.5 py-3 whitespace-nowrap">DO-Delivery Order No.</th>
                <th className="px-3.5 py-3 whitespace-nowrap">PARTY PO NO</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Party Names</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Product Name</th>
                <th className="px-3.5 py-3 whitespace-nowrap text-right">Order Qty</th>
                <th className="px-3.5 py-3 whitespace-nowrap text-right">Qty To Be Dispatched</th>
                <th className="px-3.5 py-3 whitespace-nowrap text-right">Pending Qty</th>
                <th className="px-3.5 py-3 whitespace-nowrap text-right">Total PO Value</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Dispatch Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan="10" className="py-20 text-center text-slate-400">
                    <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-xs font-medium text-slate-500">
                      Loading orders from Google Sheets...
                    </p>
                  </td>
                </tr>
              ) : groupedOrders.length === 0 ? (
                <tr>
                  <td colSpan="10" className="py-16 text-center text-slate-400">
                    <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <h3 className="text-sm font-semibold text-slate-700">
                      No orders in this stage
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      {statusTab === 'Pending'
                        ? 'Orders completed in "Check for Delivery" will appear here.'
                        : 'No orders match your filter.'}
                    </p>
                  </td>
                </tr>
              ) : (
                groupedOrders.map((group) => {
                  const orderRows = group.orders;
                  const order = orderRows[0];
                  const isGroup = orderRows.length > 1;
                  const doNumbers = orderRows.map((o) => o.doNumber).filter(Boolean).join(', ');
                  const productNames = orderRows.map((o) => o.productName).filter(Boolean);
                  const sameMeasurement = orderRows.every((o) => o.typeOfMeasurement === order.typeOfMeasurement);
                  const totalQuantity = orderRows.reduce((sum, o) => sum + (Number(o.quantity) || 0), 0);
                  const totalPoValueSum = orderRows.reduce((sum, o) => sum + (Number(o.totalPoValue) || 0), 0);
                  const dispatchedList = orderRows.flatMap((o) =>
                    dispatchEntries.filter((e) => (e.doNumber || '').trim().toLowerCase() === (o.doNumber || '').trim().toLowerCase())
                  );
                  const dispatchedQtySum = orderRows.reduce(
                    (sum, o) => sum + (dispatchedByDo[(o.doNumber || '').trim().toLowerCase()] || 0),
                    0
                  );
                  const remainingSum = orderRows.reduce((sum, o) => sum + getRemainingQty(o), 0);
                  const isDone = remainingSum <= 0.0001;
                  const isPartial = dispatchedList.length > 0 && !isDone;

                  return (
                    <tr
                      key={group.key}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      {/* Sticky Action Button */}
                      <td className="sticky left-0 bg-white z-10 px-3 py-2 text-center whitespace-nowrap border-r border-slate-200 shadow-xs">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenView(orderRows)}
                            title={isGroup ? `View all ${orderRows.length} products` : 'View Full Details'}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors relative"
                          >
                            <Eye className="w-4 h-4" />
                            {isGroup && (
                              <span className="absolute -top-1 -right-1 flex items-center justify-center w-3.5 h-3.5 bg-indigo-600 text-white text-[9px] font-bold rounded-full">
                                {orderRows.length}
                              </span>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenModal(orderRows)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg shadow-sm hover:shadow-md transition-all ${
                              isDone
                                ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                            }`}
                          >
                            <Send className="w-3.5 h-3.5" />
                            {isDone ? 'Edit Dispatch' : 'Dispatch PO'}
                          </button>
                        </div>
                      </td>

                      <td className="px-3.5 py-3 whitespace-nowrap text-slate-400 text-[11px] font-mono">
                        {api.formatDate(order.timestamp) || '—'}
                      </td>
                      <td className="px-3.5 py-3 whitespace-nowrap font-mono font-bold text-indigo-600" title={isGroup ? doNumbers : undefined}>
                        {isGroup ? `${order.doNumber} +${orderRows.length - 1}` : (order.doNumber || '—')}
                      </td>
                      <td className="px-3.5 py-3 whitespace-nowrap font-semibold text-slate-800">
                        {order.partyPoNo || '—'}
                      </td>
                      <td className="px-3.5 py-3 whitespace-nowrap font-semibold text-slate-800">
                        {order.partyNames || '—'}
                      </td>
                      <td className="px-3.5 py-3 whitespace-nowrap text-slate-700" title={isGroup ? productNames.join(', ') : undefined}>
                        {isGroup ? `${orderRows.length} products` : (order.productName || '—')}
                      </td>
                      <td className="px-3.5 py-3 text-right text-slate-800">
                        {isGroup ? (
                          <div className="space-y-0.5">
                            {orderRows.map((o) => (
                              <div key={o.doNumber} className="text-[11px] whitespace-nowrap">
                                <span className="text-slate-400 font-mono mr-1">{o.doNumber}</span>
                                {fmtQty(Number(o.quantity) || 0)}
                              </div>
                            ))}
                            <div className="text-[11px] font-bold border-t border-slate-200 pt-0.5 mt-0.5">
                              Total: {totalQuantity.toLocaleString('en-IN')}{sameMeasurement && order.typeOfMeasurement ? ` ${order.typeOfMeasurement}` : ''}
                            </div>
                          </div>
                        ) : (
                          <span className="whitespace-nowrap">{totalQuantity ? `${totalQuantity.toLocaleString('en-IN')}${order.typeOfMeasurement ? ` ${order.typeOfMeasurement}` : ''}` : '—'}</span>
                        )}
                      </td>
                      <td className="px-3.5 py-3 text-right text-slate-700">
                        {isGroup ? (
                          <div className="space-y-0.5">
                            {orderRows.map((o) => (
                              <div key={o.doNumber} className="text-[11px] whitespace-nowrap">
                                <span className="text-slate-400 font-mono mr-1">{o.doNumber}</span>
                                {fmtQty(dispatchedByDo[(o.doNumber || '').trim().toLowerCase()] || 0)}
                              </div>
                            ))}
                            <div className="text-[11px] font-bold border-t border-slate-200 pt-0.5 mt-0.5">
                              Total: {fmtQty(dispatchedQtySum)}
                            </div>
                          </div>
                        ) : (
                          <span className="whitespace-nowrap">{fmtQty(dispatchedQtySum)}</span>
                        )}
                      </td>
                      <td className="px-3.5 py-3 text-right font-semibold text-amber-600">
                        {isGroup ? (
                          <div className="space-y-0.5">
                            {orderRows.map((o) => (
                              <div key={o.doNumber} className="text-[11px] whitespace-nowrap">
                                <span className="text-slate-400 font-mono mr-1 font-normal">{o.doNumber}</span>
                                {fmtQty(getRemainingQty(o))}
                              </div>
                            ))}
                            <div className="text-[11px] font-bold border-t border-slate-200 pt-0.5 mt-0.5">
                              Total: {fmtQty(remainingSum)}
                            </div>
                          </div>
                        ) : (
                          <span className="whitespace-nowrap">{fmtQty(remainingSum)}</span>
                        )}
                      </td>
                      <td className="px-3.5 py-3 whitespace-nowrap text-right font-bold text-emerald-700">
                        {totalPoValueSum ? `₹${totalPoValueSum.toLocaleString('en-IN')}` : '—'}
                      </td>
                      <td className="px-3.5 py-3">
                        {dispatchedList.length > 0 ? (
                          <div className="space-y-1">
                            {orderRows.map((o) => {
                              const doKey = (o.doNumber || '').trim().toLowerCase();
                              const doEntries = dispatchEntries.filter((e) => (e.doNumber || '').trim().toLowerCase() === doKey);
                              if (doEntries.length === 0) return null;
                              return (
                                <div key={o.doNumber} className="flex flex-wrap items-center gap-1">
                                  {isGroup && (
                                    <span className="text-[10px] font-mono text-slate-400 mr-0.5">{o.doNumber}:</span>
                                  )}
                                  {doEntries.map((e, i) => (
                                    <span
                                      key={e.dNumber ? `${e.dNumber}-${i}` : i}
                                      className="inline-block px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-mono font-semibold"
                                      title={`${e.qtyToBeDispatched || ''} on ${e.dateOfDispatch || ''}`}
                                    >
                                      {e.dNumber}
                                    </span>
                                  ))}
                                </div>
                              );
                            })}
                            {isPartial && (
                              <span className="inline-block px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-semibold">
                                Partial
                              </span>
                            )}
                          </div>
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

      {/* ── Dispatch PO Modal ────────────────────────────────────────────── */}
      {isModalOpen && activeGroup.length > 0 && (() => {
        const activePrimary = activeGroup[0];

        return (
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                <Package className="w-4 h-4" />
              </div>
              <span className="font-bold text-slate-800 text-base">Dispatch PO</span>
            </div>
          }
          maxWidth="max-w-4xl"
        >
          <div className="space-y-5">
            {/* 1. Header Info Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">PO Number</p>
                <p className="text-sm font-bold text-slate-800">{activePrimary.partyPoNo || '—'}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Party</p>
                <p className="text-sm font-bold text-slate-800">{activePrimary.partyNames || '—'}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Splits</p>
                <p className="text-sm font-bold text-slate-800">
                  {activeGroup.length} product{activeGroup.length > 1 ? 's' : ''}
                </p>
              </div>
            </div>

            {/* 2. Products to Dispatch */}
            <div>
              <p className="text-xs font-bold text-slate-800 border-l-4 border-indigo-600 pl-2.5 mb-3">
                Products to Dispatch
              </p>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] font-semibold">
                    <tr>
                      <th className="px-3 py-2.5">DO Number</th>
                      <th className="px-3 py-2.5">Product</th>
                      <th className="px-3 py-2.5 text-right">Product Order Qty</th>
                      <th className="px-3 py-2.5 text-right">Dispatched Quantity</th>
                      <th className="px-3 py-2.5 text-right">Pending</th>
                      <th className="px-3 py-2.5">Dispatch <span className="text-rose-500">*</span></th>
                      <th className="px-3 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {includedRows.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="px-3 py-6 text-center text-slate-400">
                          No products left in this plan — Cancel and reopen to reset.
                        </td>
                      </tr>
                    ) : (
                      includedRows.map((o) => {
                        const orderQty = Number(o.quantity) || 0;
                        const dispatchedQty = dispatchedByDo[(o.doNumber || '').trim().toLowerCase()] || 0;
                        const allocatedQty = Math.max(0, orderQty - dispatchedQty);
                        const enteredQty = parseFloat(dispatchQtyByDo[o.doNumber]) || 0;
                        const pendingQty = Math.max(0, allocatedQty - enteredQty);

                        return (
                          <tr key={o.doNumber}>
                            <td className="px-3 py-2.5 font-mono text-[11px] text-slate-500">{o.doNumber || '—'}</td>
                            <td className="px-3 py-2.5 font-semibold text-slate-800">{o.productName || '—'}</td>
                            <td className="px-3 py-2.5 text-right text-slate-700">{fmtQty(orderQty)}</td>
                            <td className="px-3 py-2.5 text-right text-slate-700">{fmtQty(dispatchedQty)}</td>
                            <td className="px-3 py-2.5 text-right font-semibold text-amber-600">{fmtQty(pendingQty)}</td>
                            <td className="px-3 py-2.5">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                max={allocatedQty || undefined}
                                value={dispatchQtyByDo[o.doNumber] || ''}
                                onChange={(e) => handleQtyChange(o.doNumber, e.target.value)}
                                placeholder="0.00"
                                className="w-24 px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                              />
                            </td>
                            <td className="px-3 py-2.5">
                              <button
                                type="button"
                                onClick={() => handleRemoveRow(o.doNumber)}
                                className="text-rose-400 hover:text-rose-600 transition-colors p-0.5 rounded"
                                title="Remove from this dispatch plan"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 3. Dispatch Details (applies to all rows) */}
            <div>
              <p className="text-xs font-bold text-slate-800 border-l-4 border-indigo-600 pl-2.5 mb-3">
                Dispatch Details <span className="text-slate-400 font-normal normal-case">(applies to all rows above)</span>
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Transporter Type <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={transporterType}
                    onChange={(e) => setTransporterType(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                  >
                    <option value="">Select Transporter Type...</option>
                    {TRANSPORTER_TYPE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Dispatch Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={dispatchDate}
                    onChange={(e) => setDispatchDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Test Certificate Made
                  </label>
                  <select
                    value={testCertificateMade}
                    onChange={(e) => setTestCertificateMade(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                  >
                    <option value="">Select...</option>
                    {TEST_CERTIFICATE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* 4. Info Banner */}
            <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700 font-medium">
              <Package className="w-4 h-4 text-blue-600 shrink-0" />
              Submitting will create <strong className="mx-1">{includedRows.length}</strong> DISPATCH record{includedRows.length === 1 ? '' : 's'} with sequential D-Sr numbers.
            </div>

            {/* 5. Footer Buttons */}
            <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!allRowsValid || submitting}
                onClick={handleSubmitDispatch}
                className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-xl shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <Send className="w-4 h-4" />
                {submitting ? 'Submitting...' : `Dispatch ${includedRows.length} Row${includedRows.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </Modal>
        );
      })()}

      {/* ── View Details Modal (Read-Only) ──────────────────────────────── */}
      {isViewModalOpen && viewGroup.length > 0 && (() => {
        const viewPrimary = viewGroup[0];
        const viewIsGroup = viewGroup.length > 1;
        const viewTotalPoValueSum = viewGroup.reduce((sum, o) => sum + (Number(o.totalPoValue) || 0), 0);
        const viewDispatchList = viewGroup.flatMap((o) =>
          dispatchEntries.filter((e) => (e.doNumber || '').trim().toLowerCase() === (o.doNumber || '').trim().toLowerCase())
        );

        return (
        <Modal
          isOpen={isViewModalOpen}
          onClose={() => setIsViewModalOpen(false)}
          title={`Order Details — ${viewPrimary.doNumber || ''}${viewIsGroup ? ` + ${viewGroup.length - 1} more` : ''}`}
          maxWidth="max-w-2xl"
        >
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 bg-slate-50 rounded-xl p-4 border border-slate-200 text-xs">
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">DO Number{viewIsGroup ? 's' : ''}</p>
                <p className="font-bold text-indigo-600 font-mono text-sm">{viewGroup.map((o) => o.doNumber).join(', ') || '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Party PO No.</p>
                <p className="font-semibold text-slate-800">{viewPrimary.partyPoNo || '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Party Name</p>
                <p className="font-semibold text-slate-800">{viewPrimary.partyNames || '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Type Of Transporting</p>
                <p className="text-slate-700">{viewPrimary.typeOfTransporting || '—'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-1">
                  Product{viewIsGroup ? `s (${viewGroup.length})` : ''}
                </p>
                <div className="space-y-1">
                  {viewGroup.map((o, idx) => (
                    <p key={o.rowIndex ?? idx} className="text-slate-700">
                      {viewIsGroup && <span className="font-mono font-bold text-indigo-600 mr-1.5">{o.doNumber}</span>}
                      {o.productName || '—'} — {o.quantity ? Number(o.quantity).toLocaleString('en-IN') : '—'}
                      {' @ '}{o.rateOfMaterial ? `₹${Number(o.rateOfMaterial).toLocaleString('en-IN')}` : '—'}
                      {' — Dispatched: '}{fmtQty(dispatchedByDo[(o.doNumber || '').trim().toLowerCase()] || 0)} / Pending: {fmtQty(getRemainingQty(o))}
                    </p>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Total PO Value{viewIsGroup ? ' (All Products)' : ''}</p>
                <p className="font-bold text-emerald-700">{viewTotalPoValueSum ? `₹${viewTotalPoValueSum.toLocaleString('en-IN')}` : '—'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-1">Dispatch Records</p>
                {viewDispatchList.length > 0 ? (
                  <div className="space-y-1">
                    {viewDispatchList.map((e, idx) => (
                      <p key={e.dNumber ?? idx} className="text-slate-700">
                        <span className="font-mono font-bold text-emerald-700 mr-1.5">{e.dNumber}</span>
                        {e.doNumber} — {e.qtyToBeDispatched || '—'} on {e.dateOfDispatch || '—'} via {e.typeOfTransporting || '—'}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-700">—</p>
                )}
              </div>
              <div className="col-span-2">
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Upload SO</p>
                {viewPrimary.uploadSo && viewPrimary.uploadSo.startsWith('http') ? (
                  <a
                    href={viewPrimary.uploadSo}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 hover:text-indigo-800 underline inline-flex items-center gap-1"
                  >
                    Open SO <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <p className="text-slate-700">—</p>
                )}
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
