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
  Truck,
  Layers,
  FileText,
  Percent,
  Eye,
} from 'lucide-react';

export default function CheckForDeliveryPage() {
  const [orders, setOrders]                 = useState([]);
  const [loading, setLoading]               = useState(true);
  const [syncing, setSyncing]               = useState(false);
  const [error, setError]                   = useState('');
  const [successNotice, setSuccessNotice]   = useState('');
  const [searchQuery, setSearchQuery]       = useState('');
  const [statusTab, setStatusTab]           = useState('Pending'); // 'Pending' | 'History'

  // Master Data from Google Sheets Master tab
  const [masterData, setMasterData]         = useState({});

  // Modal State
  const [isModalOpen, setIsModalOpen]       = useState(false);
  const [activeGroup, setActiveGroup]       = useState([]);
  const [submitting, setSubmitting]         = useState(false);

  // View Modal State
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [viewGroup, setViewGroup]             = useState([]);

  // Form Fields State — keyed per DO number so each product in a grouped PO
  // can have its own independent In Stock Or Not status + conditional fields
  const [productForms, setProductForms] = useState({}); // { [doNumber]: { inStockOrNot, orderNumberOfProduction, qtyTransferred, batchNumberRemarks, gpPercent, selfOrderNoIndentNo } }

  const updateProductForm = (doNumber, field, value) => {
    setProductForms((prev) => ({
      ...prev,
      [doNumber]: { ...prev[doNumber], [field]: value },
    }));
  };

  // Fetch orders from Google Sheets FMS tab
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

  // Fetch Master Tab Data
  const fetchMaster = async () => {
    try {
      const res = await api.getMasterData();
      if (res && res.success && res.data) {
        setMasterData(res.data);
      }
    } catch (err) {
      console.warn('Could not load Master sheet data:', err);
    }
  };

  useEffect(() => {
    fetchOrders();
    fetchMaster();
  }, []);

  const notifySuccess = (msg) => {
    setSuccessNotice(msg);
    setTimeout(() => setSuccessNotice(''), 4500);
  };

  // Helper to extract options from Google Sheet Master tab
  const stockOptions = useMemo(() => {
    const aliases = [
      'In Stock Or Not',
      'In Stock',
      'Stock Or Not',
      'Stock Status',
      'InStock',
      'Stock',
    ];
    const defaultList = ['In Stock', 'For Production Planning', 'From Purchase'];

    if (!masterData || typeof masterData !== 'object') return defaultList;
    for (const alias of aliases) {
      if (Array.isArray(masterData[alias]) && masterData[alias].length > 0) {
        return masterData[alias];
      }
      const cleanAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
      const foundKey = Object.keys(masterData).find(
        (k) => k.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanAlias
      );
      if (foundKey && Array.isArray(masterData[foundKey]) && masterData[foundKey].length > 0) {
        return masterData[foundKey];
      }
    }
    return defaultList;
  }, [masterData]);

  // Base list: ONLY orders completed from Stage 2 (Received Accounts: Actual 2 exists)
  const eligibleOrders = useMemo(() => {
    return orders.filter((o) => Boolean(o.actual2));
  }, [orders]);

  // Tab & Search filtered orders
  const filteredOrders = useMemo(() => {
    return eligibleOrders.filter((order) => {
      const isDone = Boolean(order.actual3);
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
  }, [eligibleOrders, statusTab, searchQuery]);

  // Group multi-product submissions (same Party PO No + Date + Party Name) into a
  // single row so one PO with several products reads — and gets actioned — as one order
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
    () => eligibleOrders.filter((o) => !o.actual3).length,
    [eligibleOrders]
  );
  const completedCount = useMemo(
    () => eligibleOrders.filter((o) => Boolean(o.actual3)).length,
    [eligibleOrders]
  );

  // Open modal and initialize per-product fields — accepts a single order or a group sharing one PO
  const handleOpenModal = (orderOrGroup) => {
    const rows = Array.isArray(orderOrGroup) ? orderOrGroup : [orderOrGroup];
    setActiveGroup(rows);
    const forms = {};
    rows.forEach((o) => {
      forms[o.doNumber] = {
        inStockOrNot: o.inStockOrNot || '',
        orderNumberOfProduction: o.orderNumberOfProduction || '',
        qtyTransferred: o.qtyTransferred || '',
        batchNumberRemarks: o.batchNumberRemarks || '',
        gpPercent: o.gpPercent || '',
        selfOrderNoIndentNo: o.selfOrderNoIndentNo || '',
      };
    });
    setProductForms(forms);
    setIsModalOpen(true);
  };

  // Open View Modal — accepts a single order or a group of orders sharing one PO
  const handleOpenView = (orderOrGroup) => {
    setViewGroup(Array.isArray(orderOrGroup) ? orderOrGroup : [orderOrGroup]);
    setIsViewModalOpen(true);
  };

  // Every product in the active group must have its own In Stock Or Not status selected
  const allProductsStatusSet =
    activeGroup.length > 0 &&
    activeGroup.every((o) => Boolean(productForms[o.doNumber]?.inStockOrNot));

  // Submit Entry — writes each DO's OWN status/fields to that DO's row
  const handleSubmitEntry = async () => {
    if (activeGroup.length === 0 || !allProductsStatusSet) return;
    setSubmitting(true);
    try {
      // IST timestamp format: dd/MM/yyyy HH:mm:ss
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const istTime = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

      const results = await Promise.all(
        activeGroup.map((o) => {
          const f = productForms[o.doNumber] || {};
          const updatePayload = {
            'Actual 3': istTime,
            'In Stock Or Not': f.inStockOrNot || '',
            'Self Order No/ Indent No.': f.selfOrderNoIndentNo || '',
            'Order Number Of The Production': f.orderNumberOfProduction || '',
            'Qty Transfered': f.qtyTransferred || '',
            'Batch Number In Remarks': f.batchNumberRemarks || '',
            'GP %': f.gpPercent || '',
          };
          return api.updateOrderFields(o.rowIndex, updatePayload, o.doNumber);
        })
      );
      const failed = results.find((r) => !r || !r.success);

      if (!failed) {
        const doNumbers = activeGroup.map((o) => o.doNumber);
        notifySuccess(
          doNumbers.length > 1
            ? `${doNumbers.length} orders (${doNumbers.join(', ')}) delivery check submitted and forwarded to Arrange Logistics!`
            : `Order ${doNumbers[0]} delivery check submitted and forwarded to Arrange Logistics!`
        );

        // Update local order list so orders immediately move to next stage
        setOrders((prev) =>
          prev.map((o) => {
            const f = productForms[o.doNumber];
            if (!f) return o;
            return {
              ...o,
              actual3: istTime,
              inStockOrNot: f.inStockOrNot,
              selfOrderNoIndentNo: f.selfOrderNoIndentNo,
              orderNumberOfProduction: f.orderNumberOfProduction,
              qtyTransferred: f.qtyTransferred,
              batchNumberRemarks: f.batchNumberRemarks,
              gpPercent: f.gpPercent,
            };
          })
        );

        setIsModalOpen(false);
      } else {
        alert(failed.error || 'Failed to update Google Sheets');
      }
    } catch (err) {
      alert(err.message || 'Error updating order');
    } finally {
      setSubmitting(false);
    }
  };

  // Helper to normalize a status string for conditional-field matching
  const statusFlags = (status) => {
    const cleaned = String(status || '').trim().toLowerCase();
    return {
      isInStock: cleaned === 'in stock',
      isForProduction: cleaned === 'for production planning' || cleaned.includes('production'),
      isFromPurchase: cleaned === 'from purchase' || cleaned.includes('purchase'),
    };
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 space-y-4">
      {/* ── Sticky Page Header + Alerts + Filters (stays fixed while table scrolls) ── */}
      <div className="shrink-0 space-y-4">
        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-violet-600 text-white shadow-sm">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800">Check for Delivery</h1>
              <p className="text-xs text-slate-500">
                {pendingCount} pending delivery checks • Orders passed Received Accounts
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              fetchOrders(true);
              fetchMaster();
            }}
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
              className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-violet-300"
            />
          </div>

          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setStatusTab('Pending')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                statusTab === 'Pending'
                  ? 'bg-white text-violet-600 shadow-xs font-bold'
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
                <th className="px-3.5 py-3 whitespace-nowrap text-right">Quantity</th>
                <th className="px-3.5 py-3 whitespace-nowrap text-right">Total PO Value</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan="8" className="py-20 text-center text-slate-400">
                    <div className="w-8 h-8 border-3 border-violet-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-xs font-medium text-slate-500">
                      Loading orders from Google Sheets...
                    </p>
                  </td>
                </tr>
              ) : groupedOrders.length === 0 ? (
                <tr>
                  <td colSpan="8" className="py-16 text-center text-slate-400">
                    <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <h3 className="text-sm font-semibold text-slate-700">
                      No orders in this stage
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      {statusTab === 'Pending'
                        ? 'Orders completed from Received Accounts will automatically appear here.'
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
                  const isDone = orderRows.every((o) => Boolean(o.actual3));

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
                          {isDone ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Completed
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleOpenModal(orderRows)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg shadow-sm hover:shadow-md transition-all bg-violet-600 hover:bg-violet-700 text-white"
                            >
                              <Truck className="w-3.5 h-3.5" />
                              Check Delivery
                            </button>
                          )}
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
                      <td className="px-3.5 py-3 whitespace-nowrap text-right text-slate-800">
                        {totalQuantity ? `${totalQuantity.toLocaleString('en-IN')}${isGroup && sameMeasurement && order.typeOfMeasurement ? ` ${order.typeOfMeasurement}` : ''}` : '—'}
                      </td>
                      <td className="px-3.5 py-3 whitespace-nowrap text-right font-bold text-emerald-700">
                        {totalPoValueSum ? `₹${totalPoValueSum.toLocaleString('en-IN')}` : '—'}
                      </td>
                      <td className="px-3.5 py-3 whitespace-nowrap text-center">
                        {isDone ? (
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

      {/* ── Check Delivery Modal ────────────────────────────────────────── */}
      {isModalOpen && activeGroup.length > 0 && (() => {
        const activePrimary = activeGroup[0];
        const activeIsGroup = activeGroup.length > 1;
        const activeTotalPoValueSum = activeGroup.reduce((sum, o) => sum + (Number(o.totalPoValue) || 0), 0);

        return (
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={`Check Delivery — ${activePrimary.doNumber || 'Order Details'}${activeIsGroup ? ` + ${activeGroup.length - 1} more` : ''}`}
          maxWidth="max-w-2xl"
        >
          <div className="space-y-5">
            {activeIsGroup && (
              <div className="flex items-center gap-2 px-4 py-2.5 bg-violet-50 border border-violet-200 rounded-xl text-xs text-violet-700 font-medium">
                <CheckCircle2 className="w-4 h-4 text-violet-600 shrink-0" />
                This entry will apply to all {activeGroup.length} products from this PO: {activeGroup.map((o) => o.doNumber).join(', ')}
              </div>
            )}

            {/* 1. Order Summary */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 bg-slate-50 rounded-xl p-4 border border-slate-200 text-xs">
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">
                  DO Number{activeIsGroup ? 's' : ''}
                </p>
                <p className="font-bold text-indigo-600 font-mono text-sm">
                  {activeGroup.map((o) => o.doNumber).join(', ') || '—'}
                </p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">
                  Party PO No.
                </p>
                <p className="font-semibold text-slate-800">{activePrimary.partyPoNo || '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">
                  Party Name
                </p>
                <p className="font-semibold text-slate-800">{activePrimary.partyNames || '—'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-1">
                  Product{activeIsGroup ? `s (${activeGroup.length})` : ''}
                </p>
                <div className="space-y-1">
                  {activeGroup.map((o, idx) => (
                    <p key={o.rowIndex ?? idx} className="text-slate-700">
                      {activeIsGroup && <span className="font-mono font-bold text-indigo-600 mr-1.5">{o.doNumber}</span>}
                      {o.productName || '—'} — {o.quantity ? Number(o.quantity).toLocaleString('en-IN') : '—'}
                      {' @ '}{o.rateOfMaterial ? `₹${Number(o.rateOfMaterial).toLocaleString('en-IN')}` : '—'}
                    </p>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">
                  Total PO Value{activeIsGroup ? ' (All Products)' : ''}
                </p>
                <p className="font-bold text-emerald-700">
                  {activeTotalPoValueSum ? `₹${activeTotalPoValueSum.toLocaleString('en-IN')}` : '—'}
                </p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">
                  Expected Delivery Date
                </p>
                <p className="text-indigo-600 font-medium">
                  {api.formatDate(activePrimary.expectedDeliveryDate) || '—'}
                </p>
              </div>
              {activePrimary.remark1 && (
                <div>
                  <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">
                    Check PO Remark (Remark 1)
                  </p>
                  <p className="text-slate-700">{activePrimary.remark1}</p>
                </div>
              )}
              {activePrimary.remark2 && (
                <div>
                  <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">
                    Accounts Remark (Remark 2)
                  </p>
                  <p className="text-slate-700">{activePrimary.remark2}</p>
                </div>
              )}
            </div>

            {/* 2. Per-Product In Stock Or Not + Conditional Inputs */}
            <div className="space-y-4">
              {activeGroup.map((o, idx) => {
                const f = productForms[o.doNumber] || {};
                const { isInStock, isForProduction, isFromPurchase } = statusFlags(f.inStockOrNot);
                return (
                  <div
                    key={o.rowIndex ?? idx}
                    className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3"
                  >
                    {activeIsGroup && (
                      <p className="text-xs font-bold text-indigo-600 font-mono">
                        {o.doNumber} <span className="text-slate-500 font-sans font-normal">— {o.productName || '—'}</span>
                      </p>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        In Stock Or Not <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={f.inStockOrNot || ''}
                        onChange={(e) => updateProductForm(o.doNumber, 'inStockOrNot', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white"
                      >
                        <option value="">Select In Stock status...</option>
                        {stockOptions.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>

                    {isInStock && (
                      <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-lg space-y-3">
                        <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-emerald-600" />
                          In Stock Details
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              Order Number Of Production
                            </label>
                            <input
                              type="text"
                              value={f.orderNumberOfProduction || ''}
                              onChange={(e) => updateProductForm(o.doNumber, 'orderNumberOfProduction', e.target.value)}
                              placeholder="Enter production order number..."
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              Qty Transferred
                            </label>
                            <input
                              type="number"
                              value={f.qtyTransferred || ''}
                              onChange={(e) => updateProductForm(o.doNumber, 'qtyTransferred', e.target.value)}
                              placeholder="0"
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Batch Number Remarks
                          </label>
                          <textarea
                            rows={2}
                            value={f.batchNumberRemarks || ''}
                            onChange={(e) => updateProductForm(o.doNumber, 'batchNumberRemarks', e.target.value)}
                            placeholder="Enter batch number remarks..."
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none"
                          />
                        </div>
                      </div>
                    )}

                    {isForProduction && (
                      <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-lg space-y-3">
                        <p className="text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                          <Percent className="w-3.5 h-3.5 text-amber-600" />
                          Production Planning Details
                        </p>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            GP %
                          </label>
                          <input
                            type="text"
                            value={f.gpPercent || ''}
                            onChange={(e) => updateProductForm(o.doNumber, 'gpPercent', e.target.value)}
                            placeholder="e.g. 15% or 15"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                          />
                        </div>
                      </div>
                    )}

                    {isFromPurchase && (
                      <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-lg space-y-3">
                        <p className="text-xs font-bold text-blue-800 uppercase tracking-wider flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-blue-600" />
                          Purchase Details
                        </p>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Indent / Self Batch Number
                          </label>
                          <input
                            type="text"
                            value={f.selfOrderNoIndentNo || ''}
                            onChange={(e) => updateProductForm(o.doNumber, 'selfOrderNoIndentNo', e.target.value)}
                            placeholder="Enter indent / self batch number..."
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 4. Footer Buttons */}
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
                disabled={!allProductsStatusSet || submitting}
                onClick={handleSubmitEntry}
                className="px-5 py-2 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 active:bg-violet-800 rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {submitting ? 'Submitting to Sheet...' : 'Submit Entry'}
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
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Expected Delivery Date</p>
                <p className="text-indigo-600 font-medium">{api.formatDate(viewPrimary.expectedDeliveryDate) || '—'}</p>
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
                    </p>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Total PO Value{viewIsGroup ? ' (All Products)' : ''}</p>
                <p className="font-bold text-emerald-700">{viewTotalPoValueSum ? `₹${viewTotalPoValueSum.toLocaleString('en-IN')}` : '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">In Stock Or Not</p>
                <p className="text-slate-700">{viewPrimary.inStockOrNot || '—'}</p>
              </div>
              {viewPrimary.remark1 && (
                <div>
                  <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Check PO Remark</p>
                  <p className="text-slate-700">{viewPrimary.remark1}</p>
                </div>
              )}
              {viewPrimary.remark2 && (
                <div>
                  <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Accounts Remark</p>
                  <p className="text-slate-700">{viewPrimary.remark2}</p>
                </div>
              )}
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