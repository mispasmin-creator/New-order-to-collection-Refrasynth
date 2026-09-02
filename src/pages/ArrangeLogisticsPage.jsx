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
  Boxes,
  Truck,
  Plus,
  Trash2,
  Check,
} from 'lucide-react';

export default function ArrangeLogisticsPage() {
  const [orders, setOrders]                 = useState([]);
  const [loading, setLoading]               = useState(true);
  const [syncing, setSyncing]               = useState(false);
  const [error, setError]                   = useState('');
  const [successNotice, setSuccessNotice]   = useState('');
  const [searchQuery, setSearchQuery]       = useState('');
  const [statusTab, setStatusTab]           = useState('Pending'); // 'Pending' | 'Completed' | 'All'

  // Master Data
  const [masterData, setMasterData]         = useState({});

  // Arrange Logistics Tab Entries from Google Sheets
  const [logisticsEntries, setLogisticsEntries] = useState([]);
  const [maxLgstSeq, setMaxLgstSeq]             = useState(0);

  // Modal State
  const [isModalOpen, setIsModalOpen]       = useState(false);
  const [activeOrder, setActiveOrder]       = useState(null);
  const [submitting, setSubmitting]         = useState(false);

  // Products selection in modal
  const [selectedProducts, setSelectedProducts] = useState({});

  // Transporter options cards (max 10)
  const [transporters, setTransporters]     = useState([
    { name: '', rateType: 'Per MT', rate: '' },
    { name: '', rateType: 'Per MT', rate: '' },
    { name: '', rateType: 'Per MT', rate: '' },
  ]);

  // Fetch orders from Google Sheet FMS tab and entries from Arrange Logistics tab
  const fetchAllData = async (showSync = false) => {
    if (showSync) setSyncing(true);
    else setLoading(true);
    setError('');
    try {
      const [ordersRes, lgstRes] = await Promise.all([
        api.getOrders(),
        api.getLogisticsEntries(),
      ]);

      if (ordersRes && ordersRes.success && Array.isArray(ordersRes.data)) {
        setOrders(ordersRes.data);
      } else {
        setError(ordersRes?.error || 'Could not fetch orders from Google Sheets.');
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

  // Group existing Arrange Logistics entries by DO Number (case-insensitive)
  const arrangedLogisticsMap = useMemo(() => {
    const map = {};
    logisticsEntries.forEach((entry) => {
      const doKey = (entry.doNumber || '').trim().toLowerCase();
      if (doKey) {
        if (!map[doKey]) map[doKey] = [];
        map[doKey].push(entry);
      }
    });
    return map;
  }, [logisticsEntries]);

  // Base list: ONLY orders passed Stage 3 (Check for Delivery: actual3 exists)
  const eligibleOrders = useMemo(() => {
    return orders.filter((o) => Boolean(o.actual3));
  }, [orders]);

  // Tab & Search filtered orders
  const filteredOrders = useMemo(() => {
    return eligibleOrders.filter((order) => {
      const doKey = (order.doNumber || '').trim().toLowerCase();
      const isArranged = Boolean(arrangedLogisticsMap[doKey] && arrangedLogisticsMap[doKey].length > 0);

      if (statusTab === 'Pending' && isArranged) return false;
      if (statusTab === 'Completed' && !isArranged) return false;

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
  }, [eligibleOrders, arrangedLogisticsMap, statusTab, searchQuery]);

  // Counts
  const pendingCount = useMemo(() => {
    return eligibleOrders.filter((o) => {
      const doKey = (o.doNumber || '').trim().toLowerCase();
      return !arrangedLogisticsMap[doKey] || arrangedLogisticsMap[doKey].length === 0;
    }).length;
  }, [eligibleOrders, arrangedLogisticsMap]);

  const completedCount = useMemo(() => {
    return eligibleOrders.filter((o) => {
      const doKey = (o.doNumber || '').trim().toLowerCase();
      return Boolean(arrangedLogisticsMap[doKey] && arrangedLogisticsMap[doKey].length > 0);
    }).length;
  }, [eligibleOrders, arrangedLogisticsMap]);

  // Open modal
  const handleOpenModal = (order) => {
    setActiveOrder(order);
    setSelectedProducts({ [order.productName || 'Product 1']: true });

    const doKey = (order.doNumber || '').trim().toLowerCase();
    const existing = arrangedLogisticsMap[doKey];

    if (existing && existing.length > 0) {
      setTransporters(
        existing.map((e) => ({
          name: e.transporterName || '',
          rateType: e.typeOfRate || 'Per MT',
          rate: e.transportRate || e.transportRatePerMt || e.fixedAmount || '',
        }))
      );
    } else {
      setTransporters([
        { name: '', rateType: 'Per MT', rate: '' },
        { name: '', rateType: 'Per MT', rate: '' },
        { name: '', rateType: 'Per MT', rate: '' },
      ]);
    }
    setIsModalOpen(true);
  };

  // Add transporter card (max 10)
  const handleAddTransporter = () => {
    if (transporters.length >= 10) return;
    setTransporters((prev) => [...prev, { name: '', rateType: 'Per MT', rate: '' }]);
  };

  // Remove transporter card
  const handleRemoveTransporter = (index) => {
    if (transporters.length <= 1) return;
    setTransporters((prev) => prev.filter((_, i) => i !== index));
  };

  // Update specific transporter field
  const handleTransporterChange = (index, field, value) => {
    setTransporters((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  // Select all products toggle
  const handleSelectAllProducts = () => {
    if (!activeOrder) return;
    setSelectedProducts({ [activeOrder.productName || 'Product']: true });
  };

  // Submit for Approval: Inserts multiple rows into 'Arrange Logistics' tab with sequential LGST NO
  const handleSubmitForApproval = async () => {
    if (!activeOrder) return;
    setSubmitting(true);
    try {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const istTime = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

      // Filter non-empty transporters
      const validTransporters = transporters.filter(
        (t) => (t.name && t.name.trim()) || (t.rate && t.rate.toString().trim())
      );

      if (validTransporters.length === 0) {
        alert('Please fill at least one transporter option with Name or Transport Rate.');
        setSubmitting(false);
        return;
      }

      let currentSeq = maxLgstSeq;
      const newEntriesForState = [];

      const rowsToInsert = validTransporters.map((t) => {
        currentSeq += 1;
        const lgstNo = `LGST-${String(currentSeq).padStart(3, '0')}`;
        const rateTypeStr = t.rateType || 'Per MT';
        const isPerMt = rateTypeStr === 'Per MT';
        const isFixed = rateTypeStr === 'Fixed';
        const rateVal = t.rate ? t.rate.toString().trim() : '';

        const rowObj = {
          'Timestamp': istTime,
          'Delivery Order No.': activeOrder.doNumber || '',
          'Party Name': activeOrder.partyNames || '',
          'Product Name': activeOrder.productName || '',
          'Type Of Transporting': activeOrder.typeOfTransporting || 'FOR',
          'Transporter Name': t.name || '',
          'Type Of Rate': rateTypeStr,
          'Transport Rate @Per Matric Ton  ': isPerMt ? rateVal : '',
          'Transport Rate @Per Matric Ton': isPerMt ? rateVal : '',
          'Fixed Amount': isFixed ? rateVal : '',
          'Party PO Number': activeOrder.partyPoNo || '',
          'Party PO Date': api.formatDate(activeOrder.partyPoDate) || '',
          'Party PO Copy': activeOrder.uploadSo || '',
          'Rate Of Material': activeOrder.rateOfMaterial || '',
          'TRANSPORT RATE': rateVal,
          'LGST NO': lgstNo,
        };

        newEntriesForState.push({
          ...rowObj,
          doNumber: activeOrder.doNumber,
          lgstNo: lgstNo,
          transporterName: t.name,
          transportRate: rateVal,
          typeOfRate: rateTypeStr,
        });

        return rowObj;
      });

      // Insert multiple rows into Google Sheet 'Arrange Logistics' tab
      const res = await api.insertLogisticsRows(rowsToInsert);

      if (res && res.success) {
        const assignedLgst = rowsToInsert.map((r) => r['LGST NO']).join(', ');
        notifySuccess(
          `Logistics plan for Order ${activeOrder.doNumber} saved (${rowsToInsert.length} rows inserted into Arrange Logistics: ${assignedLgst}) and moved to Completed!`
        );

        // Update local sequence counter and entries map
        setMaxLgstSeq(currentSeq);
        setLogisticsEntries((prev) => [...prev, ...newEntriesForState]);

        setIsModalOpen(false);
      } else {
        alert(res?.error || 'Failed to insert into Arrange Logistics sheet');
      }
    } catch (err) {
      alert(err.message || 'Error updating order');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 space-y-4">
      {/* ── Sticky Page Header + Alerts + Filters (stays fixed like Navbar) ── */}
      <div className="sticky top-0 z-30 bg-slate-50 -mx-4 -mt-4 px-4 pt-4 pb-4 space-y-4">
        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500 text-white shadow-sm">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800">Arrange Logistics</h1>
              <p className="text-xs text-slate-500">
                {pendingCount} pending logistics arrangement • Orders passed Delivery Check
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
              Pending Logistics ({pendingCount})
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
              All ({eligibleOrders.length})
            </button>
          </div>
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
                <th className="px-3.5 py-3 whitespace-nowrap">Transporting Type</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Expected Delivery Date</th>
                <th className="px-3.5 py-3 whitespace-nowrap">In Stock Or Not</th>
                <th className="px-3.5 py-3 whitespace-nowrap">LGST Status</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Upload SO</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan="14" className="py-20 text-center text-slate-400">
                    <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-xs font-medium text-slate-500">
                      Loading orders from Google Sheets...
                    </p>
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan="14" className="py-16 text-center text-slate-400">
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
                filteredOrders.map((order, idx) => {
                  const doKey = (order.doNumber || '').trim().toLowerCase();
                  const isArranged = Boolean(arrangedLogisticsMap[doKey] && arrangedLogisticsMap[doKey].length > 0);
                  const arrangedList = arrangedLogisticsMap[doKey] || [];

                  return (
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
                            isArranged
                              ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                              : 'bg-amber-500 hover:bg-amber-600 text-white'
                          }`}
                        >
                          <Boxes className="w-3.5 h-3.5" />
                          {isArranged ? 'Edit Logistics' : 'Arrange Logistics'}
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
                      <td className="px-3.5 py-3 whitespace-nowrap font-semibold text-slate-800 uppercase">
                        {order.typeOfTransporting || 'FOR'}
                      </td>
                      <td className="px-3.5 py-3 whitespace-nowrap text-indigo-600 font-medium">
                        {api.formatDate(order.expectedDeliveryDate) || '—'}
                      </td>
                      <td className="px-3.5 py-3 whitespace-nowrap">
                        {order.inStockOrNot ? (
                          <span className="inline-block px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[11px]">
                            {order.inStockOrNot}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3.5 py-3 whitespace-nowrap">
                        {isArranged ? (
                          <div className="flex flex-wrap gap-1">
                            {arrangedList.map((e) => (
                              <span
                                key={e.lgstNo}
                                className="inline-block px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-mono font-semibold"
                                title={`${e.transporterName || 'Transporter'}: ₹${e.transportRate || ''}`}
                              >
                                {e.lgstNo}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-amber-600 font-medium text-[11px]">Pending</span>
                        )}
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
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Arrange Logistics Custom Modal ─────────────────────────────── */}
      {isModalOpen && activeOrder && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                <Truck className="w-4 h-4" />
              </div>
              <span className="font-bold text-slate-800 text-base">Arrange Logistics</span>
            </div>
          }
          maxWidth="max-w-4xl"
        >
          <div className="space-y-5">
            {/* 1. SELECT PRODUCTS FOR THIS PLAN */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  SELECT PRODUCTS FOR THIS PLAN
                </p>
                <button
                  type="button"
                  onClick={handleSelectAllProducts}
                  className="text-xs font-bold text-blue-600 hover:text-blue-800 uppercase tracking-wider"
                >
                  SELECT ALL
                </button>
              </div>

              {/* Product Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div
                  onClick={() =>
                    setSelectedProducts((prev) => ({
                      ...prev,
                      [activeOrder.productName || 'Product']:
                        !prev[activeOrder.productName || 'Product'],
                    }))
                  }
                  className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 flex items-center gap-3.5 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(
                      selectedProducts[activeOrder.productName || 'Product'] !== false
                    )}
                    onChange={() => {}}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <div>
                    <p className="text-xs font-semibold text-slate-800">
                      {activeOrder.productName || 'Pasheat-K Special'}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {activeOrder.quantity ? `${Number(activeOrder.quantity).toLocaleString('en-IN')} ${activeOrder.typeOfMeasurement || 'MT'}` : '30 MT'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Transporter Type Bar */}
            <div className="py-2.5 px-3 border-y border-slate-200 flex items-center justify-between bg-slate-50/30">
              <span className="text-xs font-bold text-slate-600">Type Of Transporting</span>
              <span className="text-xs font-bold text-slate-800 tracking-wider">
                {(activeOrder.typeOfTransporting || 'FOR').toUpperCase()}
              </span>
            </div>

            {/* 3. Transporter Options Header & Add Button */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-xs font-bold text-slate-800">Transporter Options</h3>
                  <p className="text-[11px] text-slate-400">
                    Provide options for the entire PO (max 10).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddTransporter}
                  disabled={transporters.length >= 10}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Transporter
                </button>
              </div>

              {/* Transporter Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                {transporters.map((t, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-3 relative"
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                        TRANSPORTER {idx + 1}
                      </span>
                      {transporters.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveTransporter(idx)}
                          className="text-rose-400 hover:text-rose-600 transition-colors p-0.5 rounded"
                          title="Remove Transporter"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

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
                          <option value="Per MT">Per MT</option>
                          <option value="Per Trip">Per Trip</option>
                          <option value="Fixed">Fixed</option>
                          <option value="Per Kg">Per Kg</option>
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
                  </div>
                ))}
              </div>
            </div>

            {/* 4. Footer Buttons */}
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
      )}
    </div>
  );
}