import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import Modal from '../components/common/Modal';
import FileUploader from '../components/common/FileUploader';
import {
  Search,
  RefreshCw,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  PlusCircle,
  Truck,
  PackageCheck,
  FileText,
  Send,
} from 'lucide-react';

const fmtQty = (n) => {
  const num = Number(n) || 0;
  return Number.isInteger(num) ? String(num) : num.toFixed(2);
};

const nowIST = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
};

const emptyRequestForm = () => ({
  orderKey: '',
  qty: '',
  rateOfMaterial: '',
  billNo: '',
  billCopy: '',
  transportPayment: '',
  partyDebitNoteCopy: '',
  reason: '',
});

const STAGE_META = {
  1: { title: 'Arrange Logistics For Lift Return Material', label: 'Arrange Logistics', icon: Truck, color: 'indigo' },
  2: { title: 'Received Return Material From Party', label: 'Receive Material', icon: PackageCheck, color: 'teal' },
  3: { title: 'Issue Note', label: 'Issue Note', icon: FileText, color: 'amber' },
  4: { title: 'Send To Party', label: 'Send To Party', icon: Send, color: 'emerald' },
};

// Which stage an entry is currently waiting on — 0 means fully completed.
const getStage = (e) => {
  if (!e.actual1) return 1;
  if (!e.actual2) return 2;
  if (!e.actual3) return 3;
  if (!e.actual4) return 4;
  return 0;
};

export default function MaterialReturnPage() {
  const [orders, setOrders]                 = useState([]);
  const [returnEntries, setReturnEntries]   = useState([]);
  const [maxReturnSeq, setMaxReturnSeq]     = useState(0);
  const [loading, setLoading]               = useState(true);
  const [syncing, setSyncing]               = useState(false);
  const [error, setError]                   = useState('');
  const [successNotice, setSuccessNotice]   = useState('');
  const [searchQuery, setSearchQuery]       = useState('');
  const [statusTab, setStatusTab]           = useState('Pending'); // 'Pending' | 'History'

  // Request modal
  const [isRequestOpen, setIsRequestOpen]   = useState(false);
  const [form, setForm]                     = useState(emptyRequestForm());
  const [submitting, setSubmitting]         = useState(false);

  // Stage action modal
  const [actionEntry, setActionEntry]       = useState(null);
  const [actionStage, setActionStage]       = useState(0);
  const [stageForm, setStageForm]           = useState({});
  const [acting, setActing]                 = useState(false);

  const fetchAllData = async (showSync = false) => {
    if (showSync) setSyncing(true);
    else setLoading(true);
    setError('');
    try {
      const [ordersRes, returnRes] = await Promise.all([
        api.getOrders(),
        api.getMaterialReturnEntries(),
      ]);

      if (ordersRes && ordersRes.success && Array.isArray(ordersRes.data)) {
        setOrders(ordersRes.data);
      } else {
        setError(ordersRes?.error || 'Could not fetch orders from Google Sheets.');
      }

      if (returnRes && returnRes.success && Array.isArray(returnRes.data)) {
        setReturnEntries(returnRes.data);
        setMaxReturnSeq(returnRes.maxReturnSeq || 0);
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

  const pendingCount = useMemo(
    () => returnEntries.filter((e) => getStage(e) !== 0).length,
    [returnEntries]
  );
  const historyCount = useMemo(
    () => returnEntries.filter((e) => getStage(e) === 0).length,
    [returnEntries]
  );

  const filteredEntries = useMemo(() => {
    return returnEntries.filter((e) => {
      const resolved = getStage(e) === 0;
      if (statusTab === 'Pending' && resolved) return false;
      if (statusTab === 'History' && !resolved) return false;

      const q = searchQuery.toLowerCase();
      if (!q) return true;
      return (
        (e.returnNo && e.returnNo.toLowerCase().includes(q)) ||
        (e.doNumber && e.doNumber.toLowerCase().includes(q)) ||
        (e.partyNames && e.partyNames.toLowerCase().includes(q)) ||
        (e.productName && e.productName.toLowerCase().includes(q))
      );
    });
  }, [returnEntries, statusTab, searchQuery]);

  // Order lines eligible for a new return request — skip lines that already
  // have an in-progress (not yet fully completed) return request against them.
  const activeKeys = useMemo(() => {
    const set = new Set();
    returnEntries.forEach((e) => {
      if (getStage(e) !== 0) {
        set.add(`${(e.doNumber || '').trim().toLowerCase()}|${(e.productName || '').trim().toLowerCase()}`);
      }
    });
    return set;
  }, [returnEntries]);

  const orderLineOptions = useMemo(() => {
    return orders
      .map((o, idx) => ({ ...o, orderKey: `${idx}` }))
      .filter((o) => o.doNumber && o.productName)
      .filter((o) => !activeKeys.has(`${(o.doNumber || '').trim().toLowerCase()}|${(o.productName || '').trim().toLowerCase()}`));
  }, [orders, activeKeys]);

  const selectedOrderLine = useMemo(
    () => orderLineOptions.find((o) => o.orderKey === form.orderKey) || null,
    [orderLineOptions, form.orderKey]
  );

  const handleOpenRequest = () => {
    setForm(emptyRequestForm());
    setIsRequestOpen(true);
  };

  const handleSelectOrderLine = (orderKey) => {
    const line = orderLineOptions.find((o) => o.orderKey === orderKey);
    setForm({
      ...emptyRequestForm(),
      orderKey,
      rateOfMaterial: line ? line.rateOfMaterial : '',
    });
  };

  const handleSubmitRequest = async () => {
    if (!selectedOrderLine) {
      alert('Please select an order.');
      return;
    }
    if (!form.qty || Number(form.qty) <= 0) {
      alert('Please enter a valid quantity.');
      return;
    }
    if (!form.reason.trim()) {
      alert('Please enter a reason for material return.');
      return;
    }

    setSubmitting(true);
    try {
      const istTime = nowIST();
      const pad = (n) => String(n).padStart(2, '0');
      const returnNo = `RET-${pad(maxReturnSeq + 1)}`;

      const row = {
        'Timestamp': istTime,
        'Return No.': returnNo,
        'DO-Delivery Order No.': selectedOrderLine.doNumber || '',
        'Party Names': selectedOrderLine.partyNames || '',
        'Product Name': selectedOrderLine.productName || '',
        'Qty': form.qty,
        'Rate Of Material': form.rateOfMaterial,
        'Bill No.': form.billNo,
        'Bill Copy': form.billCopy,
        'Tranport Payment': form.transportPayment,
        'Party Debit Note Copy': form.partyDebitNoteCopy,
        'Reason Of Material Return': form.reason.trim(),
      };

      const res = await api.insertMaterialReturnRows([row]);
      if (res && res.success) {
        notifySuccess(`Material Return request ${returnNo} submitted!`);
        setMaxReturnSeq((prev) => prev + 1);
        setIsRequestOpen(false);
        fetchAllData(true);
      } else {
        alert(res?.error || 'Failed to submit material return request');
      }
    } catch (err) {
      alert(err.message || 'Error submitting material return request');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenStageAction = (entry) => {
    const stage = getStage(entry);
    if (stage === 0) return;
    setActionEntry(entry);
    setActionStage(stage);
    setStageForm({
      transporterName: entry.transporterName || '',
      biltyNo: entry.biltyNo || '',
      vehicleNo: entry.vehicleNo || '',
      typeOfRate: entry.typeOfRate || '',
      qtyOfReturnMaterial: entry.qtyOfReturnMaterial || entry.qty || '',
      conditionOfMaterial: entry.conditionOfMaterial || '',
      photoOfReturnMaterial: entry.photoOfReturnMaterial || '',
      creditNoteCopy: entry.creditNoteCopy || '',
      creditNoteNo: entry.creditNoteNo || '',
    });
  };

  const handleSubmitStage = async () => {
    if (!actionEntry || !actionStage) return;

    let fields = {};
    if (actionStage === 1) {
      if (!stageForm.transporterName.trim()) {
        alert('Please enter Transporter Name.');
        return;
      }
      fields = {
        'Actual1': nowIST(),
        'Transporter Name': stageForm.transporterName,
        'Bilty No.': stageForm.biltyNo,
        'Vehicle No.': stageForm.vehicleNo,
        'Type Of Rate': stageForm.typeOfRate,
      };
    } else if (actionStage === 2) {
      if (!stageForm.qtyOfReturnMaterial || Number(stageForm.qtyOfReturnMaterial) <= 0) {
        alert('Please enter Qty Of Return Material.');
        return;
      }
      fields = {
        'Actual2': nowIST(),
        'Qty Of Return Material': stageForm.qtyOfReturnMaterial,
        'Condition of Material': stageForm.conditionOfMaterial,
        'Photo Of Return Material': stageForm.photoOfReturnMaterial,
      };
    } else if (actionStage === 3) {
      if (!stageForm.creditNoteNo.trim()) {
        alert('Please enter Credit Note No.');
        return;
      }
      fields = {
        'Actual3': nowIST(),
        'Credit Note Copy': stageForm.creditNoteCopy,
        'Credit Note No.': stageForm.creditNoteNo,
      };
    } else if (actionStage === 4) {
      fields = {
        'Actual4': nowIST(),
        'Status4': 'Sent',
      };
    }

    setActing(true);
    try {
      const res = await api.updateMaterialReturnFields(actionEntry.rowIndex, fields);
      if (res && res.success) {
        notifySuccess(`${actionEntry.returnNo} — ${STAGE_META[actionStage].label} recorded!`);
        setReturnEntries((prev) =>
          prev.map((e) => (e.rowIndex === actionEntry.rowIndex ? { ...e, ...toEntryShape(fields) } : e))
        );
        setActionEntry(null);
        setActionStage(0);
      } else {
        alert(res?.error || 'Failed to update Material Return sheet');
      }
    } catch (err) {
      alert(err.message || 'Error saving stage update');
    } finally {
      setActing(false);
    }
  };

  // Maps the sheet-header-keyed update payload back to the entry's camelCase shape
  const toEntryShape = (fields) => {
    const map = {
      'Actual1': 'actual1', 'Transporter Name': 'transporterName', 'Bilty No.': 'biltyNo',
      'Vehicle No.': 'vehicleNo', 'Type Of Rate': 'typeOfRate',
      'Actual2': 'actual2', 'Qty Of Return Material': 'qtyOfReturnMaterial',
      'Condition of Material': 'conditionOfMaterial', 'Photo Of Return Material': 'photoOfReturnMaterial',
      'Actual3': 'actual3', 'Credit Note Copy': 'creditNoteCopy', 'Credit Note No.': 'creditNoteNo',
      'Actual4': 'actual4', 'Status4': 'status4',
    };
    const out = {};
    Object.entries(fields).forEach(([k, v]) => {
      if (map[k]) out[map[k]] = v;
    });
    return out;
  };

  const stageBadge = (entry) => {
    const stage = getStage(entry);
    if (stage === 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="w-3 h-3" /> Completed
        </span>
      );
    }
    const labels = {
      1: 'Awaiting Logistics',
      2: 'Awaiting Receipt',
      3: 'Awaiting Issue Note',
      4: 'Awaiting Send To Party',
    };
    return <span className="text-amber-600 font-medium text-[11px]">{labels[stage]}</span>;
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 space-y-4">
      {/* ── Sticky Page Header + Alerts + Filters ── */}
      <div className="shrink-0 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-teal-600 text-white shadow-sm">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800">Material Return</h1>
              <p className="text-xs text-slate-500">
                {pendingCount} request{pendingCount === 1 ? '' : 's'} in progress
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
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
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-sm"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Request Material Return
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
              placeholder="Search return requests..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-teal-300"
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setStatusTab('Pending')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                statusTab === 'Pending'
                  ? 'bg-white text-teal-600 shadow-xs font-bold'
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
                <th className="px-3.5 py-3 whitespace-nowrap">Return No.</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Timestamp</th>
                <th className="px-3.5 py-3 whitespace-nowrap">DO-Delivery Order No.</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Party Names</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Product Name</th>
                <th className="px-3.5 py-3 whitespace-nowrap text-right">Qty</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Reason</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Stage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan="9" className="py-20 text-center text-slate-400">
                    <div className="w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-xs font-medium text-slate-500">
                      Loading material return requests from Google Sheets...
                    </p>
                  </td>
                </tr>
              ) : filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan="9" className="py-16 text-center text-slate-400">
                    <RotateCcw className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <h3 className="text-sm font-semibold text-slate-700">
                      No material return requests
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      {statusTab === 'Pending'
                        ? 'New material return requests will appear here.'
                        : 'No requests match your filter.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredEntries.map((entry) => {
                  const stage = getStage(entry);
                  const meta = STAGE_META[stage];
                  const StageIcon = meta?.icon;
                  return (
                    <tr key={entry.rowIndex} className="hover:bg-slate-50/80 transition-colors">
                      <td className="sticky left-0 bg-white z-10 px-3 py-2 text-center whitespace-nowrap border-r border-slate-200 shadow-xs">
                        {stage === 0 ? (
                          <span className="text-slate-300 text-[11px]">—</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOpenStageAction(entry)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg shadow-sm hover:shadow-md transition-all bg-teal-600 hover:bg-teal-700 text-white"
                          >
                            {StageIcon && <StageIcon className="w-3.5 h-3.5" />}
                            {meta.label}
                          </button>
                        )}
                      </td>
                      <td className="px-3.5 py-3 whitespace-nowrap font-mono font-bold text-teal-600">
                        {entry.returnNo || '—'}
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
                        {stageBadge(entry)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Request Material Return Modal ─────────────────────────────── */}
      <Modal
        isOpen={isRequestOpen}
        onClose={() => setIsRequestOpen(false)}
        title="Request Material Return"
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
              className="block w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-teal-400"
            >
              <option value="">— Choose a DO / Product —</option>
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
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Qty To Return
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={form.qty}
                onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))}
                placeholder="Enter quantity"
                className="block w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-teal-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Rate Of Material
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={form.rateOfMaterial}
                onChange={(e) => setForm((f) => ({ ...f, rateOfMaterial: e.target.value }))}
                placeholder="Rate"
                className="block w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-teal-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Bill No.
              </label>
              <input
                type="text"
                value={form.billNo}
                onChange={(e) => setForm((f) => ({ ...f, billNo: e.target.value }))}
                placeholder="Bill number"
                className="block w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-teal-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Tranport Payment
              </label>
              <select
                value={form.transportPayment}
                onChange={(e) => setForm((f) => ({ ...f, transportPayment: e.target.value }))}
                className="block w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-teal-400"
              >
                <option value="">— Select —</option>
                <option value="Paid By Party">Paid By Party</option>
                <option value="Paid By Us">Paid By Us</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FileUploader
              label="Bill Copy"
              value={form.billCopy}
              onChange={(url) => setForm((f) => ({ ...f, billCopy: url }))}
              accept="image/*,application/pdf"
            />
            <FileUploader
              label="Party Debit Note Copy"
              value={form.partyDebitNoteCopy}
              onChange={(url) => setForm((f) => ({ ...f, partyDebitNoteCopy: url }))}
              accept="image/*,application/pdf"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Reason Of Material Return
            </label>
            <textarea
              rows={3}
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder="Why is this material being returned?"
              className="block w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-teal-400 resize-none"
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
              className="px-5 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 active:bg-teal-800 rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {submitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Stage Action Modal ────────────────────────────────────────── */}
      <Modal
        isOpen={Boolean(actionEntry)}
        onClose={() => { setActionEntry(null); setActionStage(0); }}
        title={`${STAGE_META[actionStage]?.title || ''} — ${actionEntry?.returnNo || ''}`}
        maxWidth="max-w-lg"
      >
        {actionEntry && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">DO Number</p>
                <p className="font-mono font-bold text-indigo-600">{actionEntry.doNumber || '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Party Name</p>
                <p className="font-semibold text-slate-800">{actionEntry.partyNames || '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Product</p>
                <p className="text-slate-700">{actionEntry.productName || '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Qty</p>
                <p className="text-slate-700">{fmtQty(actionEntry.qty)}</p>
              </div>
            </div>

            {actionStage === 1 && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Transporter Name
                  </label>
                  <input
                    type="text"
                    value={stageForm.transporterName || ''}
                    onChange={(e) => setStageForm((f) => ({ ...f, transporterName: e.target.value }))}
                    className="block w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                      Bilty No.
                    </label>
                    <input
                      type="text"
                      value={stageForm.biltyNo || ''}
                      onChange={(e) => setStageForm((f) => ({ ...f, biltyNo: e.target.value }))}
                      className="block w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                      Vehicle No.
                    </label>
                    <input
                      type="text"
                      value={stageForm.vehicleNo || ''}
                      onChange={(e) => setStageForm((f) => ({ ...f, vehicleNo: e.target.value }))}
                      className="block w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Type Of Rate
                  </label>
                  <select
                    value={stageForm.typeOfRate || ''}
                    onChange={(e) => setStageForm((f) => ({ ...f, typeOfRate: e.target.value }))}
                    className="block w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
                  >
                    <option value="">— Select —</option>
                    <option value="Per Matric Ton">Per Matric Ton</option>
                    <option value="Fixed">Fixed</option>
                  </select>
                </div>
              </>
            )}

            {actionStage === 2 && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Qty Of Return Material
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={stageForm.qtyOfReturnMaterial || ''}
                    onChange={(e) => setStageForm((f) => ({ ...f, qtyOfReturnMaterial: e.target.value }))}
                    className="block w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-teal-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Condition of Material
                  </label>
                  <select
                    value={stageForm.conditionOfMaterial || ''}
                    onChange={(e) => setStageForm((f) => ({ ...f, conditionOfMaterial: e.target.value }))}
                    className="block w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-teal-400"
                  >
                    <option value="">— Select —</option>
                    <option value="Good">Good</option>
                    <option value="Bad">Bad</option>
                  </select>
                </div>
                <FileUploader
                  label="Photo Of Return Material"
                  value={stageForm.photoOfReturnMaterial || ''}
                  onChange={(url) => setStageForm((f) => ({ ...f, photoOfReturnMaterial: url }))}
                  accept="image/*"
                />
              </>
            )}

            {actionStage === 3 && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Credit Note No.
                  </label>
                  <input
                    type="text"
                    value={stageForm.creditNoteNo || ''}
                    onChange={(e) => setStageForm((f) => ({ ...f, creditNoteNo: e.target.value }))}
                    className="block w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
                  />
                </div>
                <FileUploader
                  label="Credit Note Copy"
                  value={stageForm.creditNoteCopy || ''}
                  onChange={(url) => setStageForm((f) => ({ ...f, creditNoteCopy: url }))}
                  accept="image/*,application/pdf"
                />
              </>
            )}

            {actionStage === 4 && (
              <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 font-medium">
                <Send className="w-4 h-4 text-emerald-600 shrink-0" />
                Confirm this material return has been sent back to the party.
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => { setActionEntry(null); setActionStage(0); }}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                Close
              </button>
              <button
                type="button"
                disabled={acting}
                onClick={handleSubmitStage}
                className="px-5 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 active:bg-teal-800 rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {acting ? 'Saving...' : `Save & Continue`}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
