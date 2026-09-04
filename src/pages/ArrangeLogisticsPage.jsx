import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import Modal from '../components/common/Modal';
import FileUploader from '../components/common/FileUploader';
import {
  Search,
  RefreshCw,
  Package,
  CheckCircle2,
  AlertCircle,
  Boxes,
  Truck,
  Check,
  Eye,
} from 'lucide-react';

const fmtQty = (n) => {
  const num = Number(n) || 0;
  return Number.isInteger(num) ? String(num) : num.toFixed(2);
};

const emptyTransporter = () => ({
  name: '',
  rateType: 'Per Matric Ton rate',
  rate: '',
  truckNo: '',
  vehiclePlateImage: '',
  driverMobileNo: '',
  biltyNo: '',
  actualTruckQty: '',
});

export default function ArrangeLogisticsPage() {
  const [orders, setOrders]                 = useState([]);
  const [loading, setLoading]               = useState(true);
  const [syncing, setSyncing]               = useState(false);
  const [error, setError]                   = useState('');
  const [successNotice, setSuccessNotice]   = useState('');
  const [searchQuery, setSearchQuery]       = useState('');
  const [statusTab, setStatusTab]           = useState('Pending'); // 'Pending' | 'History'

  // Master Data
  const [masterData, setMasterData]         = useState({});

  // Dispatch Tab Entries (each is a dispatched product/DO instance)
  const [dispatchEntries, setDispatchEntries] = useState([]);

  // Billing Tab Entries — Arrange Logistics submissions live here, linked back
  // to a Dispatch entry via its D Number ("Dispatch No." column in Billing)
  const [logisticsEntries, setLogisticsEntries] = useState([]);
  const [maxLgstSeq, setMaxLgstSeq]             = useState(0);

  // Modal State
  const [isModalOpen, setIsModalOpen]       = useState(false);
  const [activeBatch, setActiveBatch]       = useState(null);
  const [submitting, setSubmitting]         = useState(false);

  // View Modal State
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [viewBatch, setViewBatch]             = useState(null);

  // Transporter options cards (max 10)
  const [transporters, setTransporters]     = useState([emptyTransporter()]);

  // Fetch orders (FMS), dispatch instances (Dispatch), and existing arrangements (Billing)
  const fetchAllData = async (showSync = false) => {
    if (showSync) setSyncing(true);
    else setLoading(true);
    setError('');
    try {
      const [ordersRes, dispatchRes, lgstRes] = await Promise.all([
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

      if (lgstRes && lgstRes.success && Array.isArray(lgstRes.data)) {
        setLogisticsEntries(lgstRes.data);
        if (lgstRes.maxLgstSeq) {
          setMaxLgstSeq(lgstRes.maxLgstSeq);
        }
      }
    } catch (err) {
      setError(err.message || 'Error fetching data.');
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  // Fetch Master Data
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
    fetchAllData();
    fetchMaster();
  }, []);

  const notifySuccess = (msg) => {
    setSuccessNotice(msg);
    setTimeout(() => setSuccessNotice(''), 4500);
  };

  // Transporter options from Master tab
  const transporterOptions = useMemo(() => {
    const aliases = [
      'Transporter',
      'Transporter Name',
      'Transporters',
      'Transport Agency',
      'Logistics Vendor',
      'Logistics',
      'Agency',
    ];
    const defaultList = [
      'V-Trans India Ltd',
      'TCI Freight',
      'Gati-KWE Logistics',
      'Safechem Logistics',
      'Patel Roadways',
      'ARC Logistics',
      'Associated Road Carriers',
      'Local Truck Fleet',
    ];

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

  // Quick lookup: DO number (lowercased) → order record, to enrich dispatch entries
  const orderByDoNumber = useMemo(() => {
    const map = {};
    orders.forEach((o) => {
      const key = (o.doNumber || '').trim().toLowerCase();
      if (key) map[key] = o;
    });
    return map;
  }, [orders]);

  // Existing Billing/logistics rows, grouped by the Dispatch No. (D Number) they cover
  const arrangedByDNumber = useMemo(() => {
    const map = {};
    logisticsEntries.forEach((e) => {
      const key = (e.dispatchNo || '').trim().toLowerCase();
      if (!key) return;
      if (!map[key]) map[key] = [];
      map[key].push(e);
    });
    return map;
  }, [logisticsEntries]);

  // Enrich each Dispatch entry with its order's PO/rate/party details, dropping any
  // dispatch row whose DO number no longer resolves to a known order
  const enrichedDispatchEntries = useMemo(() => {
    return dispatchEntries
      .map((e) => {
        const order = orderByDoNumber[(e.doNumber || '').trim().toLowerCase()];
        if (!order) return null;
        return {
          ...e,
          partyPoNo: order.partyPoNo || '',
          partyPoDate: order.partyPoDate || '',
          partyNames: order.partyNames || e.partyName || '',
          rateOfMaterial: order.rateOfMaterial || '',
          uploadSo: order.uploadSo || '',
          typeOfMeasurement: order.typeOfMeasurement || '',
        };
      })
      .filter(Boolean);
  }, [dispatchEntries, orderByDoNumber]);

  // Group dispatch entries into shipment batches: same PO + same transport type +
  // same dispatch date = one shipment that needs one logistics arrangement.
  // Two separate "Dispatch PO" submissions (even for the same PO) produce two batches.
  const batches = useMemo(() => {
    const groups = [];
    const indexByKey = {};
    enrichedDispatchEntries.forEach((entry) => {
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
  }, [enrichedDispatchEntries]);

  const isBatchArranged = (batch) =>
    batch.entries.every((e) => (arrangedByDNumber[(e.dNumber || '').trim().toLowerCase()] || []).length > 0);

  // Tab & Search filtered batches
  const filteredBatches = useMemo(() => {
    return batches.filter((batch) => {
      const arranged = isBatchArranged(batch);
      if (statusTab === 'Pending' && arranged) return false;
      if (statusTab === 'History' && !arranged) return false;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batches, arrangedByDNumber, statusTab, searchQuery]);

  // Counts
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pendingCount = useMemo(() => batches.filter((b) => !isBatchArranged(b)).length, [batches, arrangedByDNumber]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const completedCount = useMemo(() => batches.filter((b) => isBatchArranged(b)).length, [batches, arrangedByDNumber]);

  // Open modal for a batch (one shipment — may cover several products/DOs).
  // Every not-yet-arranged product in the batch is arranged together, no picking needed.
  const handleOpenModal = (batch) => {
    setActiveBatch(batch);
    setTransporters([emptyTransporter()]);
    setIsModalOpen(true);
  };

  const handleOpenView = (batch) => {
    setViewBatch(batch);
    setIsViewModalOpen(true);
  };

  const handleTransporterChange = (index, field, value) => {
    setTransporters((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  // Submit: Inserts rows into 'Billing' tab with sequential LGST-Sr Number, one row
  // per (selected dispatch entry × transporter), linking back via Dispatch No.
  const handleSubmitForApproval = async () => {
    if (!activeBatch) return;
    setSubmitting(true);
    try {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const istTime = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

      const validTransporters = transporters.filter(
        (t) => (t.name && t.name.trim()) || (t.rate && t.rate.toString().trim())
      );

      if (validTransporters.length === 0) {
        alert('Please fill at least one transporter option with Name or Transport Rate.');
        setSubmitting(false);
        return;
      }

      // Arrange every product in this batch that isn't already arranged
      const selectedList = activeBatch.entries.filter(
        (e) => (arrangedByDNumber[(e.dNumber || '').trim().toLowerCase()] || []).length === 0
      );
      if (selectedList.length === 0) {
        alert('All products in this shipment are already arranged.');
        setSubmitting(false);
        return;
      }

      let currentSeq = maxLgstSeq;
      const newEntriesForState = [];
      const rowsToInsert = [];

      selectedList.forEach((entry) => {
        validTransporters.forEach((t) => {
          currentSeq += 1;
          const lgstNo = `LGST-${String(currentSeq).padStart(2, '0')}`;
          const rateTypeStr = t.rateType || 'Per Matric Ton rate';
          const isPerMt = rateTypeStr === 'Per Matric Ton rate';
          const isFixed = rateTypeStr === 'Fixed Amount';
          const rateVal = t.rate ? t.rate.toString().trim() : '';

          const rowObj = {
            'Timestamp': istTime,
            'Delivery Order No': entry.doNumber || '',
            'Dispatch No.': entry.dNumber || '',
            'LGST-Sr Number': lgstNo,
            'Party Name': entry.partyNames || '',
            'Product Name': entry.productName || '',
            'Type Of Transporting': entry.typeOfTransporting || 'FOR',
            'Transporter Name': t.name || '',
            'Truck No.': t.truckNo || '',
            'Vehicle No. Plate Image': t.vehiclePlateImage || '',
            'Driver Mobile No.': t.driverMobileNo || '',
            'Bilty No.': t.biltyNo || '',
            'Actual Truck Qty': t.actualTruckQty || '',
            'Type Of Rate': rateTypeStr,
            'Transport Rate @Per Matric Ton  ': isPerMt ? rateVal : '',
            'Transport Rate @Per Matric Ton': isPerMt ? rateVal : '',
            'Fixed Amount': isFixed ? rateVal : '',
          };

          newEntriesForState.push({
            ...rowObj,
            doNumber: entry.doNumber,
            dispatchNo: entry.dNumber,
            lgstNo,
            transporterName: t.name,
            typeOfRate: rateTypeStr,
          });

          rowsToInsert.push(rowObj);
        });
      });

      const res = await api.insertLogisticsRows(rowsToInsert);

      if (res && res.success) {
        const dNumbers = selectedList.map((e) => e.dNumber).join(', ');
        const assignedLgst = rowsToInsert.map((r) => r['LGST-Sr Number']).join(', ');
        notifySuccess(`Logistics arranged for ${dNumbers} (${rowsToInsert.length} record(s): ${assignedLgst})!`);

        setMaxLgstSeq(currentSeq);
        setLogisticsEntries((prev) => [...prev, ...newEntriesForState]);

        setIsModalOpen(false);
      } else {
        alert(res?.error || 'Failed to insert into Billing sheet');
      }
    } catch (err) {
      alert(err.message || 'Error saving logistics arrangement');
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
            <div className="p-2 rounded-xl bg-amber-500 text-white shadow-sm">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800">Arrange Logistics</h1>
              <p className="text-xs text-slate-500">
                {pendingCount} pending shipment{pendingCount === 1 ? '' : 's'} • One row per dispatched batch
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              fetchAllData(true);
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
              placeholder="Search pending shipments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
          </div>

          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setStatusTab('Pending')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                statusTab === 'Pending'
                  ? 'bg-white text-amber-600 shadow-xs font-bold'
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
                <th className="px-3.5 py-3 whitespace-nowrap text-right">Qty Dispatched</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Type Of Transporting</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Date Of Dispatch</th>
                <th className="px-3.5 py-3 whitespace-nowrap">LGST Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan="9" className="py-20 text-center text-slate-400">
                    <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-xs font-medium text-slate-500">
                      Loading dispatched shipments from Google Sheets...
                    </p>
                  </td>
                </tr>
              ) : filteredBatches.length === 0 ? (
                <tr>
                  <td colSpan="9" className="py-16 text-center text-slate-400">
                    <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <h3 className="text-sm font-semibold text-slate-700">
                      No shipments in this stage
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      {statusTab === 'Pending'
                        ? 'Batches dispatched from "Dispatch Planning" will appear here.'
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
                  const arranged = isBatchArranged(batch);
                  const lgstList = batch.entries.flatMap(
                    (e) => arrangedByDNumber[(e.dNumber || '').trim().toLowerCase()] || []
                  );
                  const uniqueLgst = [...new Set(lgstList.map((e) => e.lgstNo).filter(Boolean))];

                  return (
                    <tr key={batch.key} className="hover:bg-slate-50/80 transition-colors">
                      {/* Sticky Action Button */}
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
                              arranged
                                ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                : 'bg-amber-500 hover:bg-amber-600 text-white'
                            }`}
                          >
                            <Boxes className="w-3.5 h-3.5" />
                            {arranged ? 'Edit Logistics' : 'Arrange Logistics'}
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
                      <td className="px-3.5 py-3 whitespace-nowrap text-slate-700">
                        {primary.typeOfTransporting || '—'}
                      </td>
                      <td className="px-3.5 py-3 whitespace-nowrap text-slate-700">
                        {api.formatDate(primary.dateOfDispatch) || '—'}
                      </td>
                      <td className="px-3.5 py-3 whitespace-nowrap">
                        {uniqueLgst.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {uniqueLgst.map((lgstNo) => (
                              <span
                                key={lgstNo}
                                className="inline-block px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-mono font-semibold"
                              >
                                {lgstNo}
                              </span>
                            ))}
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

      {/* ── Arrange Logistics Custom Modal ─────────────────────────────── */}
      {isModalOpen && activeBatch && (() => {
        const primary = activeBatch.entries[0];
        const isMulti = activeBatch.entries.length > 1;

        return (
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                <Truck className="w-4 h-4" />
              </div>
              <span className="font-bold text-slate-800 text-base">
                Arrange Logistics{isMulti ? ` — ${activeBatch.entries.length} Products` : ''}
              </span>
            </div>
          }
          maxWidth="max-w-4xl"
        >
          <div className="space-y-5">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 font-medium">
              <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0" />
              This shipment was dispatched via <strong className="mx-1">{primary.typeOfTransporting || '—'}</strong>
              on <strong className="mx-1">{api.formatDate(primary.dateOfDispatch) || '—'}</strong> — transporter options below apply to this shipment only.
            </div>

            {/* 1. Products covered — all of them, arranged together */}
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Products In This Shipment ({activeBatch.entries.length})
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {activeBatch.entries.map((e) => {
                  const already = (arrangedByDNumber[(e.dNumber || '').trim().toLowerCase()] || []);
                  return (
                    <div
                      key={e.dNumber}
                      className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50"
                    >
                      <p className="text-xs font-semibold text-slate-800">
                        {e.productName || 'Product'}
                        <span className="ml-1.5 font-mono font-normal text-indigo-600">
                          ({e.doNumber} / {e.dNumber})
                        </span>
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {fmtQty(e.qtyToBeDispatched)} {e.typeOfMeasurement || 'MT'}
                        {already.length > 0 && (
                          <span className="ml-1.5 text-emerald-600 font-semibold">
                            — Already: {already.map((a) => a.lgstNo).join(', ')}
                          </span>
                        )}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 2. Transporter Details */}
            <div>
              <h3 className="text-xs font-bold text-slate-800 mb-3">Transporter Details</h3>

              <div className="grid grid-cols-1 gap-3.5">
                {transporters.map((t, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-3 relative"
                  >
                    {/* NAME / AGENCY */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                        NAME / AGENCY
                      </label>
                      <select
                        value={t.name}
                        onChange={(e) => handleTransporterChange(idx, 'name', e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                      >
                        <option value="">Select Transporter</option>
                        {transporterOptions.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Type Of Rate */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                          Type Of Rate
                        </label>
                        <select
                          value={t.rateType}
                          onChange={(e) => handleTransporterChange(idx, 'rateType', e.target.value)}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                        >
                          <option value="Fixed Amount">Fixed Amount</option>
                          <option value="Per Matric Ton rate">Per Matric Ton rate</option>
                          <option value="Fixed">Ex Factory</option>
                          <option value="Per Kg">For</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-rose-500 uppercase tracking-wider mb-1">
                          TRANSPORT RATE*
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={t.rate}
                          onChange={(e) => handleTransporterChange(idx, 'rate', e.target.value)}
                          placeholder="0.00"
                          className="w-full px-2.5 py-1.5 border border-rose-200 rounded-lg text-xs text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                        />
                      </div>
                    </div>

                    {/* Truck / Driver / Bilty details */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                          Truck No.
                        </label>
                        <input
                          type="text"
                          value={t.truckNo}
                          onChange={(e) => handleTransporterChange(idx, 'truckNo', e.target.value)}
                          placeholder=""
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                          Driver Mobile No.
                        </label>
                        <input
                          type="tel"
                          value={t.driverMobileNo}
                          onChange={(e) => handleTransporterChange(idx, 'driverMobileNo', e.target.value)}
                          placeholder=""
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                          Bilty No.
                        </label>
                        <input
                          type="text"
                          value={t.biltyNo}
                          onChange={(e) => handleTransporterChange(idx, 'biltyNo', e.target.value)}
                          placeholder=""
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                          Actual Truck Qty
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={t.actualTruckQty}
                          onChange={(e) => handleTransporterChange(idx, 'actualTruckQty', e.target.value)}
                          placeholder=""
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                        />
                      </div>
                    </div>

                    <FileUploader
                      label="Vehicle No. Plate Image"
                      value={t.vehiclePlateImage}
                      onChange={(url) => handleTransporterChange(idx, 'vehiclePlateImage', url)}
                      accept="image/*"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* 3. Footer Buttons */}
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
                disabled={submitting}
                onClick={handleSubmitForApproval}
                className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 rounded-xl shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <Check className="w-4 h-4 stroke-[2.5]" />
                {submitting ? 'Submitting...' : 'Submit for Approval'}
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
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Type Of Transporting</p>
                <p className="text-slate-700">{primary.typeOfTransporting || '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Date Of Dispatch</p>
                <p className="text-slate-700">{api.formatDate(primary.dateOfDispatch) || '—'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-1">
                  Product{isMulti ? `s (${viewBatch.entries.length})` : ''}
                </p>
                <div className="space-y-1">
                  {viewBatch.entries.map((e, idx) => {
                    const already = arrangedByDNumber[(e.dNumber || '').trim().toLowerCase()] || [];
                    return (
                      <p key={e.dNumber ?? idx} className="text-slate-700">
                        <span className="font-mono font-bold text-indigo-600 mr-1.5">{e.doNumber}</span>
                        {e.productName || '—'} — {fmtQty(e.qtyToBeDispatched)}
                        {' ('}{e.dNumber}{')'}
                        {already.length > 0 && (
                          <span className="ml-1.5 text-emerald-600 font-semibold">
                            {already.map((a) => a.lgstNo).join(', ')}
                          </span>
                        )}
                      </p>
                    );
                  })}
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
