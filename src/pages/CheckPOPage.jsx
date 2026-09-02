import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import Modal from '../components/common/Modal';
import SearchableSelect from '../components/common/SearchableSelect';
import FileUploader from '../components/common/FileUploader';
import {
  Search,
  Filter,
  RefreshCw,
  Edit2,
  Trash2,
  Eye,
  Package,
  Calendar,
  IndianRupee,
  AlertCircle,
  CheckCircle2,
  Truck,
  Building2,
  FileText,
  BadgePercent,
  Layers,
  ExternalLink,
  ClipboardCheck,
  CheckSquare,
  FileCheck,
} from 'lucide-react';

const emptyOrderForm = {
  doNumber: '',
  partyPoNo: '',
  partyPoDate: '',
  partyNames: '',
  productName: '',
  quantity: '',
  rateOfMaterial: '',
  typeOfTransporting: '',
  uploadSo: '',
  isThroughAgent: '',
  orderReceivedFrom: '',
  typeOfMeasurement: '',
  contactPersonName: '',
  contactPersonWhatsapp: '',
  aluminaPct: '',
  ironPct: '',
  typeOfPi: '',
  leadTimeFinalPayment: '',
  typeOfApplication: '',
  customerCategory: '',
  freeReplacementFoc: '',
  gstNumber: '',
  address: '',
  firmName: '',
  totalPoBasicValue: '',
  paymentToBeTaken: '',
  advance: '',
  basic: '',
  retentionPayment: '',
  retentionPercentage: '',
  leadTimeRetention: '',
  specificConcern: '',
  referenceNo: '',
  adjustedAmount: '',
  totalPoValue: '',
  salesPersonName: '',
  tcRequired: '',
};

export default function CheckPOPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [successNotice, setSuccessNotice] = useState('');

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');

  // Modals state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isCheckModalOpen, setIsCheckModalOpen] = useState(false);

  const [formData, setFormData] = useState(emptyOrderForm);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Check PO modal state
  const [checkOrder, setCheckOrder] = useState(null);
  const [checkForm, setCheckForm] = useState({ status: '', expectedDeliveryDate: '', remark: '' });
  const [statusFilter, setStatusFilter] = useState('Pending'); // 'Pending' | 'Approved' | 'All'

  // Dynamic Master Data fetched from Google Sheets Master tab
  const [masterData, setMasterData] = useState({});

  // Fetch Master Data
  const fetchMasterSheetData = async () => {
    try {
      const res = await api.getMasterData();
      if (res && res.success && res.data) {
        setMasterData(res.data);
      }
    } catch (err) {
      console.warn('Could not load Master sheet data:', err);
    }
  };

  // Fetch Orders from Google Sheet FMS tab
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
    fetchMasterSheetData();
  }, []);

  const notifySuccess = (msg) => {
    setSuccessNotice(msg);
    setTimeout(() => setSuccessNotice(''), 4000);
  };

  // Helper to extract master dropdown options with alias matching
  const getMasterOptions = (aliasKeys = [], defaultFallback = []) => {
    if (!masterData || Object.keys(masterData).length === 0) {
      return defaultFallback;
    }
    const cleanAliases = aliasKeys.map((k) =>
      k.toLowerCase().replace(/[^a-z0-9]/g, '')
    );
    for (const key of Object.keys(masterData)) {
      if (key.startsWith('_')) continue;
      const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanAliases.includes(cleanKey)) {
        const val = masterData[key];
        if (Array.isArray(val) && val.length > 0) {
          return val;
        }
      }
    }
    return defaultFallback;
  };

  // Auto calculate basic value & total PO value
  const handleQtyRateChange = (field, value) => {
    const updated = { ...formData, [field]: value };
    const q = parseFloat(field === 'quantity' ? value : updated.quantity) || 0;
    const r = parseFloat(field === 'rateOfMaterial' ? value : updated.rateOfMaterial) || 0;
    const basicVal = Math.round(q * r);
    updated.totalPoBasicValue = basicVal || '';
    updated.basic = basicVal || '';

    const adj = parseFloat(updated.adjustedAmount) || 0;
    const totalVal = Math.round(basicVal * 1.18) + adj;
    updated.totalPoValue = basicVal > 0 ? totalVal : '';

    setFormData(updated);
  };

  // Filtered orders list
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesCategory =
        categoryFilter === 'All' ||
        (order.customerCategory && order.customerCategory === categoryFilter);

      const matchesStatus =
        statusFilter === 'All' ||
        (statusFilter === 'Pending' && (!order.status1 || order.status1 === '')) ||
        (statusFilter === 'Approved' && (order.status1 === 'Approved' || order.status1 === 'Yes')) ||
        (statusFilter === 'Rejected' && order.status1 === 'Rejected');

      const q = searchQuery.toLowerCase();
      const matchesSearch =
        (order.doNumber && order.doNumber.toLowerCase().includes(q)) ||
        (order.partyPoNo && order.partyPoNo.toLowerCase().includes(q)) ||
        (order.partyNames && order.partyNames.toLowerCase().includes(q)) ||
        (order.productName && order.productName.toLowerCase().includes(q)) ||
        (order.salesPersonName && order.salesPersonName.toLowerCase().includes(q));

      return matchesCategory && matchesStatus && matchesSearch;
    });
  }, [orders, searchQuery, categoryFilter, statusFilter]);

  // Dropdown Options strictly synchronized with Google Sheet Master tab
  const firmOptions = useMemo(() => {
    const masterFirms = getMasterOptions(['Firm Name', 'FirmName', 'Firm'], []);
    const existing = orders.map((o) => o.firmName).filter(Boolean);
    return Array.from(new Set([...masterFirms, ...existing]));
  }, [masterData, orders]);

  const transportOptions = useMemo(() => {
    const masterTransport = getMasterOptions(
      ['Type Of Transporting', 'Transporting', 'Transportation', 'Transport'],
      []
    );
    const existing = orders.map((o) => o.typeOfTransporting).filter(Boolean);
    return Array.from(new Set([...masterTransport, ...existing]));
  }, [masterData, orders]);

  const categoryOptions = useMemo(() => {
    return getMasterOptions(['Customer Category', 'Category', 'CustomerCategory'], []);
  }, [masterData]);

  const measurementOptions = useMemo(() => {
    const fromMaster = getMasterOptions(['Type Of Measurement', 'Measurement', 'Unit', 'UOM'], []);
    if (fromMaster.length > 0) return fromMaster;
    return ['MT', 'Pcs', 'Bags', 'Kgs', 'Tonnes', 'Sqm'];
  }, [masterData]);

  const piTypeOptions = useMemo(() => {
    return getMasterOptions(['Type Of PI', 'PI Type', 'PI'], []);
  }, [masterData]);

  const paymentToBeTakenOptions = useMemo(() => {
    return getMasterOptions(
      ['Payment to Be Taken', 'Payment Term', 'Payment Terms', 'Payment'],
      []
    );
  }, [masterData]);

  const orderSourceOptions = useMemo(() => {
    return getMasterOptions(['Order Received From', 'Received From', 'Order Source'], []);
  }, [masterData]);

  const salesPersonOptions = useMemo(() => {
    const fromMaster = getMasterOptions(['Marketing Sales Person', 'Sales Person Name', 'Sales Person'], []);
    const fromOrders = orders.map((o) => o.salesPersonName).filter(Boolean);
    return Array.from(new Set([...fromMaster, ...fromOrders]));
  }, [masterData, orders]);

  const productOptions = useMemo(() => {
    const fromMaster = getMasterOptions(['Product Name', 'Product', 'Products'], []);
    const fromOrders = orders.map((o) => o.productName).filter(Boolean);
    return Array.from(new Set([...fromMaster, ...fromOrders]));
  }, [masterData, orders]);

  const partyNamesOptions = useMemo(() => {
    const fromMaster = getMasterOptions(
      ['Party Names', 'Party Name', 'Customer Name', 'Party', 'Parties', 'Customer', 'Customers'],
      []
    );
    const fromDirectory = Object.values(masterData?._partyDirectory || {}).map((p) => p.partyName);
    const fromOrders = orders.map((o) => o.partyNames).filter(Boolean);
    return Array.from(new Set([...fromMaster, ...fromDirectory, ...fromOrders]));
  }, [masterData, orders]);

  // Auto-fill GST Number and Delivery Address when Party Name is selected from Master tab
  const handlePartyNameChange = (selectedParty) => {
    const updated = {
      ...formData,
      partyNames: selectedParty,
    };

    if (selectedParty) {
      const cleanKey = selectedParty.trim().toLowerCase();
      const directory = masterData?._partyDirectory || {};
      const fromMaster = directory[cleanKey];
      if (fromMaster) {
        if (fromMaster.gstNumber) updated.gstNumber = fromMaster.gstNumber;
        if (fromMaster.address) updated.address = fromMaster.address;
      } else {
        const matchedKey = Object.keys(directory).find(
          (k) => k === cleanKey || (k.length > 3 && cleanKey.includes(k)) || (cleanKey.length > 3 && k.includes(cleanKey))
        );
        if (matchedKey && directory[matchedKey]) {
          if (directory[matchedKey].gstNumber) updated.gstNumber = directory[matchedKey].gstNumber;
          if (directory[matchedKey].address) updated.address = directory[matchedKey].address;
        } else {
          const pastOrder = orders.find(
            (o) => (o.partyNames || '').trim().toLowerCase() === cleanKey && (o.gstNumber || o.address)
          );
          if (pastOrder) {
            if (pastOrder.gstNumber) updated.gstNumber = pastOrder.gstNumber;
            if (pastOrder.address) updated.address = pastOrder.address;
          }
        }
      }
    }

    setFormData(updated);
  };

  const tcRequiredOptions = useMemo(() => {
    return getMasterOptions(['TC Required', 'TC', 'Test Certificate'], ['Yes', 'No']);
  }, [masterData]);

  const freeReplacementOptions = useMemo(() => {
    return getMasterOptions(['Free Replacement (FOC)', 'Free Replacement', 'FOC'], ['No', 'Yes']);
  }, [masterData]);

  const agentOptions = useMemo(() => {
    return getMasterOptions(['Is This Order Through Some Agent', 'Through Agent', 'Agent'], ['No', 'Yes']);
  }, [masterData]);

  const retentionPaymentOptions = useMemo(() => {
    return getMasterOptions(['Retention Payment', 'Retention'], ['No', 'Yes']);
  }, [masterData]);

  // Open Edit Modal
  const handleOpenEdit = (order) => {
    setSelectedOrder(order);
    setFormData({
      ...emptyOrderForm,
      ...order,
    });
    setIsEditModalOpen(true);
  };

  // Open View Modal
  const handleOpenView = (order) => {
    setSelectedOrder(order);
    setIsViewModalOpen(true);
  };

  // Open Delete Modal
  const handleOpenDelete = (order) => {
    setSelectedOrder(order);
    setIsDeleteModalOpen(true);
  };

  // Open Check PO Modal
  const handleOpenCheck = (order) => {
    setCheckOrder(order);
    setCheckForm({
      status: order.status1 || '',
      expectedDeliveryDate: order.expectedDeliveryDate || '',
      remark: order.remark1 || '',
    });
    setIsCheckModalOpen(true);
  };

  // Confirm Check PO & Save to FMS Sheet
  const handleConfirmCheck = async () => {
    if (!checkForm.status || !checkOrder) return;
    setSubmitting(true);
    try {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const istTime = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

      const updatePayload = {
        'Actual 1': istTime,
        'Expected Delivery Date': checkForm.expectedDeliveryDate || '',
        'Status 1': checkForm.status,
        'Remark 1': checkForm.remark || '',
      };

      const res = await api.updateOrderFields(checkOrder.rowIndex, updatePayload, checkOrder.doNumber);
      if (res && res.success) {
        notifySuccess(`Order ${checkOrder.doNumber} marked ${checkForm.status} and moved to Received Accounts!`);
        setOrders((prev) =>
          prev.map((o) =>
            o.doNumber === checkOrder.doNumber
              ? {
                  ...o,
                  actual1: istTime,
                  expectedDeliveryDate: checkForm.expectedDeliveryDate || '',
                  status1: checkForm.status,
                  remark1: checkForm.remark || '',
                }
              : o
          )
        );
        setIsCheckModalOpen(false);
      } else {
        alert(res?.error || 'Failed to update Google Sheets');
      }
    } catch (err) {
      alert(err.message || 'Error updating order');
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Edit Order
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const res = await api.updateOrder(selectedOrder.rowIndex, formData);
      if (res && res.success) {
        setOrders((prev) =>
          prev.map((o) =>
            o.rowIndex === selectedOrder.rowIndex || o.doNumber === selectedOrder.doNumber
              ? { ...o, ...formData }
              : o
          )
        );
        setIsEditModalOpen(false);
        notifySuccess(`Order ${formData.doNumber} updated successfully in Google Sheet!`);
        fetchOrders(true);
      } else {
        setError(res?.error || 'Failed to update order in Google Sheets.');
      }
    } catch (err) {
      setError(err.message || 'Error updating order.');
    } finally {
      setSubmitting(false);
    }
  };

  // Confirm Delete Order
  const handleConfirmDelete = async () => {
    if (!selectedOrder) return;
    setSubmitting(true);
    setError('');

    try {
      const res = await api.deleteOrder(selectedOrder.rowIndex);
      if (res && res.success) {
        setOrders((prev) =>
          prev.filter((o) => o.rowIndex !== selectedOrder.rowIndex && o.doNumber !== selectedOrder.doNumber)
        );
        setIsDeleteModalOpen(false);
        notifySuccess(`Order ${selectedOrder.doNumber} deleted from Google Sheet!`);
        fetchOrders(true);
      } else {
        setError(res?.error || 'Failed to delete order from Google Sheet.');
      }
    } catch (err) {
      setError(err.message || 'Error deleting order.');
    } finally {
      setSubmitting(false);
    }
  };

  // Metrics calculation
  const totalPoCount = orders.length;
  const totalPoGross = orders.reduce((sum, o) => sum + (Number(o.totalPoValue) || 0), 0);
  const totalBasicVal = orders.reduce((sum, o) => sum + (Number(o.totalPoBasicValue) || 0), 0);
  const totalAdvance = orders.reduce((sum, o) => sum + (Number(o.advance) || 0), 0);

  return (
    <div className="space-y-6">
      {/* Sticky Page Header + KPI + Alerts + Filters (stays fixed while table scrolls) */}
      <div className="sticky top-0 z-30 bg-slate-50 -mt-6 pt-6 pb-1 space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <ClipboardCheck className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-800 tracking-tight">Check PO</h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Audit, inspect, verify, and manage Purchase Orders and Delivery Orders
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                fetchOrders(true);
                fetchMasterSheetData();
              }}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-2xs transition-all disabled:opacity-50"
              title="Sync with Google Sheets FMS Tab"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin text-indigo-600' : ''}`} />
              <span>{syncing ? 'Syncing...' : 'Sync Sheet'}</span>
            </button>
          </div>
        </div>

        {/* KPI Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Total POs</span>
              <Package className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="text-xl font-bold text-slate-800">{totalPoCount}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Orders in FMS Sheet</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Total Basic</span>
              <IndianRupee className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-xl font-bold text-slate-800">
              ₹{totalBasicVal.toLocaleString('en-IN')}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Base Material Value</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Total PO Value</span>
              <IndianRupee className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-xl font-bold text-slate-800">
              ₹{totalPoGross.toLocaleString('en-IN')}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Total Gross Invoice Value</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Total Advance</span>
              <IndianRupee className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-xl font-bold text-slate-800">
              ₹{totalAdvance.toLocaleString('en-IN')}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Advance Received</div>
          </div>
        </div>

        {/* Success Notification */}
        {successNotice && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3.5 text-sm text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successNotice}</span>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 p-3.5 text-sm text-rose-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Search & Filter Bar */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by DO No., Party PO No., Customer, Product, or Sales Person..."
              className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
            />
          </div>

          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Filter className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-semibold uppercase text-slate-400">Category:</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="All">All Categories</option>
              <option value="Steel Plant">Steel Plant</option>
              <option value="Cement">Cement</option>
              <option value="Foundry">Foundry</option>
              <option value="Power">Power</option>
              <option value="Aluminium">Aluminium</option>
              <option value="Glass">Glass</option>
            </select>
          </div>

          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setStatusFilter('Pending')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                statusFilter === 'Pending'
                  ? 'bg-white text-indigo-600 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pending Check ({orders.filter((o) => !o.status1 || o.status1 === '').length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('Approved')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                statusFilter === 'Approved'
                  ? 'bg-white text-emerald-600 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Approved ({orders.filter((o) => o.status1 === 'Approved' || o.status1 === 'Yes').length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('All')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                statusFilter === 'All'
                  ? 'bg-white text-slate-800 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Orders ({orders.length})
            </button>
          </div>
        </div>
      </div>

      {/* Check PO Table with Sticky Actions and 37 Sticky Columns */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-270px)] border-t border-slate-200">
          <table className="w-full text-left text-xs text-slate-600 border-collapse">
            <thead className="sticky top-0 bg-slate-100 z-20 shadow-xs border-b border-slate-300 font-semibold text-slate-700 uppercase tracking-wider text-[11px]">
              <tr>
                {/* Sticky Actions column present in Check PO page */}
                <th className="sticky left-0 bg-slate-100 z-30 px-3.5 py-3 text-center whitespace-nowrap border-r border-slate-200 shadow-xs">
                  Actions
                </th>
                <th className="px-3.5 py-3 whitespace-nowrap">Timestamp</th>
                <th className="px-3.5 py-3 whitespace-nowrap">DO-Delivery Order No.</th>
                <th className="px-3.5 py-3 whitespace-nowrap">PARTY PO NO (As Per Po Exact)</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Party PO Date</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Party Names</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Product Name</th>
                <th className="px-3.5 py-3 whitespace-nowrap text-right">Quantity</th>
                <th className="px-3.5 py-3 whitespace-nowrap text-right">Rate Of Material</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Type Of Transporting</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Upload SO</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Is This Order Through Some Agent</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Order Received From</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Type Of Measurement</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Contact Person Name</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Contact Person WhatsApp No.</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Alumina%</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Iron%</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Type Of PI</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Lead Time For Collection Of Final Payment</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Type Of Application</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Customer Category</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Free Replacement (FOC)</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Gst Number</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Address</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Firm Name</th>
                <th className="px-3.5 py-3 whitespace-nowrap text-right">Total PO Basic Value</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Payment to Be Taken</th>
                <th className="px-3.5 py-3 whitespace-nowrap text-right">Advance</th>
                <th className="px-3.5 py-3 whitespace-nowrap text-right">Basic</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Retention Payment</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Retention Percentage</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Lead Time for Retention</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Specific Concern</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Reference No.</th>
                <th className="px-3.5 py-3 whitespace-nowrap text-right">Adjusted Amount</th>
                <th className="px-3.5 py-3 whitespace-nowrap text-right">Total PO Value</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Marketing Sales Person</th>
                <th className="px-3.5 py-3 whitespace-nowrap">TC Required</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan="39" className="py-20 text-center text-slate-400">
                    <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                    <p className="text-xs font-medium text-slate-500">Loading orders from Google Sheets...</p>
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan="39" className="py-16 text-center text-slate-400">
                    <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <h3 className="text-sm font-semibold text-slate-700">No orders recorded in Google Sheets yet</h3>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                      {searchQuery || categoryFilter !== 'All'
                        ? 'Try adjusting your search query or filters.'
                        : 'Orders created in the Orders page will automatically appear here.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order, idx) => (
                  <tr key={order.doNumber || idx} className="hover:bg-slate-50/80 transition-colors">
                    {/* Sticky Actions */}
                    <td className="sticky left-0 bg-white z-10 px-3 py-2 text-center whitespace-nowrap border-r border-slate-200 shadow-xs">
                      <div className="flex items-center justify-center">
                        <button
                          type="button"
                          onClick={() => handleOpenCheck(order)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-[11px] font-semibold rounded-lg shadow-sm hover:shadow-md transition-all duration-150"
                          title="Check PO — Approve / Reject"
                        >
                          <ClipboardCheck className="w-3.5 h-3.5" />
                          Check PO
                        </button>
                      </div>
                    </td>

                    {/* 0b. Timestamp */}
                    <td className="px-3.5 py-3 whitespace-nowrap text-slate-500 text-[11px] font-mono">
                      {api.formatDate(order.timestamp) || '—'}
                    </td>

                    {/* 1. DO-Delivery Order No. */}
                    <td className="px-3.5 py-3 font-mono font-bold text-indigo-600 whitespace-nowrap">
                      {order.doNumber || '—'}
                    </td>

                    {/* 2. PARTY PO NO (As Per Po Exact) */}
                    <td className="px-3.5 py-3 font-semibold text-slate-800 whitespace-nowrap">
                      {order.partyPoNo || '—'}
                    </td>

                    {/* 3. Party PO Date */}
                    <td className="px-3.5 py-3 whitespace-nowrap text-slate-600">
                      {api.formatDate(order.partyPoDate) || '—'}
                    </td>

                    {/* 4. Party Names */}
                    <td className="px-3.5 py-3 font-semibold text-slate-800 whitespace-nowrap">
                      {order.partyNames || '—'}
                    </td>

                    {/* 5. Product Name */}
                    <td className="px-3.5 py-3 text-slate-800 whitespace-nowrap">
                      {order.productName || '—'}
                    </td>

                    {/* 6. Quantity */}
                    <td className="px-3.5 py-3 text-right font-medium text-slate-800 whitespace-nowrap">
                      {order.quantity ? Number(order.quantity).toLocaleString('en-IN') : '—'}
                    </td>

                    {/* 7. Rate Of Material */}
                    <td className="px-3.5 py-3 text-right font-medium text-slate-800 whitespace-nowrap">
                      {order.rateOfMaterial ? `₹${Number(order.rateOfMaterial).toLocaleString('en-IN')}` : '—'}
                    </td>

                    {/* 8. Type Of Transporting */}
                    <td className="px-3.5 py-3 whitespace-nowrap text-slate-700">
                      {order.typeOfTransporting || '—'}
                    </td>

                    {/* 9. Upload SO */}
                    <td className="px-3.5 py-3 whitespace-nowrap text-slate-700">
                      {order.uploadSo ? (
                        order.uploadSo.startsWith('http') ? (
                          <a
                            href={order.uploadSo}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-600 hover:text-indigo-800 underline inline-flex items-center gap-1"
                          >
                            <span>Open SO</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span>{order.uploadSo}</span>
                        )
                      ) : (
                        '—'
                      )}
                    </td>

                    {/* 10. Is This Order Through Some Agent */}
                    <td className="px-3.5 py-3 whitespace-nowrap text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${
                          order.isThroughAgent === 'Yes'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-slate-50 text-slate-600'
                        }`}
                      >
                        {order.isThroughAgent || 'No'}
                      </span>
                    </td>

                    {/* 11. Order Received From */}
                    <td className="px-3.5 py-3 whitespace-nowrap text-slate-700">
                      {order.orderReceivedFrom || '—'}
                    </td>

                    {/* 12. Type Of Measurement */}
                    <td className="px-3.5 py-3 whitespace-nowrap font-medium text-slate-700">
                      {order.typeOfMeasurement || '—'}
                    </td>

                    {/* 13. Contact Person Name */}
                    <td className="px-3.5 py-3 whitespace-nowrap text-slate-700">
                      {order.contactPersonName || '—'}
                    </td>

                    {/* 14. Contact Person WhatsApp No. */}
                    <td className="px-3.5 py-3 whitespace-nowrap text-slate-700 font-mono">
                      {order.contactPersonWhatsapp || '—'}
                    </td>

                    {/* 15. Alumina% */}
                    <td className="px-3.5 py-3 whitespace-nowrap text-slate-700">
                      {order.aluminaPct || '—'}
                    </td>

                    {/* 16. Iron% */}
                    <td className="px-3.5 py-3 whitespace-nowrap text-slate-700">
                      {order.ironPct || '—'}
                    </td>

                    {/* 17. Type Of PI */}
                    <td className="px-3.5 py-3 whitespace-nowrap text-slate-700">
                      {order.typeOfPi || '—'}
                    </td>

                    {/* 18. Lead Time For Collection Of Final Payment */}
                    <td className="px-3.5 py-3 whitespace-nowrap text-slate-700">
                      {order.leadTimeFinalPayment || '—'}
                    </td>

                    {/* 19. Type Of Application */}
                    <td className="px-3.5 py-3 whitespace-nowrap text-slate-700">
                      {order.typeOfApplication || '—'}
                    </td>

                    {/* 20. Customer Category */}
                    <td className="px-3.5 py-3 whitespace-nowrap">
                      {order.customerCategory ? (
                        <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                          {order.customerCategory}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>

                    {/* 21. Free Replacement (FOC) */}
                    <td className="px-3.5 py-3 whitespace-nowrap text-center text-slate-700">
                      {order.freeReplacementFoc || 'No'}
                    </td>

                    {/* 22. Gst Number */}
                    <td className="px-3.5 py-3 whitespace-nowrap font-mono text-slate-700">
                      {order.gstNumber || '—'}
                    </td>

                    {/* 23. Address */}
                    <td
                      className="px-3.5 py-3 whitespace-nowrap max-w-xs truncate text-slate-700"
                      title={order.address}
                    >
                      {order.address || '—'}
                    </td>

                    {/* 24. Firm Name */}
                    <td className="px-3.5 py-3 whitespace-nowrap text-slate-700">
                      {order.firmName || '—'}
                    </td>

                    {/* 25. Total PO Basic Value */}
                    <td className="px-3.5 py-3 text-right font-medium text-slate-800 whitespace-nowrap">
                      {order.totalPoBasicValue
                        ? `₹${Number(order.totalPoBasicValue).toLocaleString('en-IN')}`
                        : '—'}
                    </td>

                    {/* 26. Payment to Be Taken */}
                    <td className="px-3.5 py-3 whitespace-nowrap text-slate-700">
                      {order.paymentToBeTaken || '—'}
                    </td>

                    {/* 27. Advance */}
                    <td className="px-3.5 py-3 text-right font-medium text-slate-800 whitespace-nowrap">
                      {order.advance ? `₹${Number(order.advance).toLocaleString('en-IN')}` : '—'}
                    </td>

                    {/* 28. Basic */}
                    <td className="px-3.5 py-3 text-right font-medium text-slate-800 whitespace-nowrap">
                      {order.basic ? `₹${Number(order.basic).toLocaleString('en-IN')}` : '—'}
                    </td>

                    {/* 29. Retention Payment */}
                    <td className="px-3.5 py-3 whitespace-nowrap text-center text-slate-700">
                      {order.retentionPayment || 'No'}
                    </td>

                    {/* 30. Retention Percentage */}
                    <td className="px-3.5 py-3 whitespace-nowrap text-slate-700">
                      {order.retentionPercentage || '—'}
                    </td>

                    {/* 31. Lead Time for Retention */}
                    <td className="px-3.5 py-3 whitespace-nowrap text-slate-700">
                      {order.leadTimeRetention || '—'}
                    </td>

                    {/* 32. Specific Concern */}
                    <td
                      className="px-3.5 py-3 whitespace-nowrap max-w-xs truncate text-slate-700"
                      title={order.specificConcern}
                    >
                      {order.specificConcern || '—'}
                    </td>

                    {/* 33. Reference No. */}
                    <td className="px-3.5 py-3 whitespace-nowrap text-slate-700">
                      {order.referenceNo || '—'}
                    </td>

                    {/* 34. Adjusted Amount */}
                    <td className="px-3.5 py-3 text-right font-medium text-slate-800 whitespace-nowrap">
                      {order.adjustedAmount
                        ? `₹${Number(order.adjustedAmount).toLocaleString('en-IN')}`
                        : '—'}
                    </td>

                    {/* 35. Total PO Value */}
                    <td className="px-3.5 py-3 text-right font-bold text-slate-900 whitespace-nowrap">
                      {order.totalPoValue
                        ? `₹${Number(order.totalPoValue).toLocaleString('en-IN')}`
                        : '—'}
                    </td>

                    {/* 36. Marketing Sales Person */}
                    <td className="px-3.5 py-3 whitespace-nowrap text-slate-800 font-medium">
                      {order.salesPersonName || '—'}
                    </td>

                    {/* 37. TC Required */}
                    <td className="px-3.5 py-3 whitespace-nowrap text-center text-slate-700">
                      {order.tcRequired || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-slate-50/80 px-5 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>Showing {filteredOrders.length} of {orders.length} orders</span>
          <span>Google Sheet: <strong>FMS</strong> Tab (37 Columns starting from Row 7)</span>
        </div>
      </div>

      {/* =========================================================================
          VIEW ORDER MODAL (All 37 Fields Displayed)
      ========================================================================= */}
      {isViewModalOpen && selectedOrder && (
        <Modal
          isOpen={isViewModalOpen}
          onClose={() => setIsViewModalOpen(false)}
          title={`Purchase Order Details: ${selectedOrder.doNumber}`}
          maxWidth="max-w-4xl"
        >
          <div className="space-y-6 text-sm">
            {/* Header info badge */}
            <div className="bg-gradient-to-r from-indigo-50 to-blue-50 p-4 rounded-xl border border-indigo-100 flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-500">
                  Delivery Order
                </span>
                <h3 className="text-xl font-extrabold text-indigo-900 font-mono">
                  {selectedOrder.doNumber}
                </h3>
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Party PO No & Date
                </span>
                <div className="font-semibold text-slate-800">
                  {selectedOrder.partyPoNo} ({selectedOrder.partyPoDate || 'N/A'})
                </div>
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Total PO Value
                </span>
                <div className="text-lg font-black text-slate-900">
                  ₹{Number(selectedOrder.totalPoValue || selectedOrder.totalPoBasicValue || 0).toLocaleString('en-IN')}
                </div>
              </div>
            </div>

            {/* Grid of details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Box 1: Customer & Logistics */}
              <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-700 pb-1 border-b border-slate-200 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Customer & Logistics</span>
                </h4>
                <div className="space-y-1.5 text-xs">
                  <div><strong className="text-slate-500">Party Name:</strong> <span className="font-semibold text-slate-800">{selectedOrder.partyNames}</span></div>
                  <div><strong className="text-slate-500">Customer Category:</strong> {selectedOrder.customerCategory || '—'}</div>
                  <div><strong className="text-slate-500">GST Number:</strong> <span className="font-mono">{selectedOrder.gstNumber || '—'}</span></div>
                  <div><strong className="text-slate-500">Contact Person:</strong> {selectedOrder.contactPersonName || '—'} ({selectedOrder.contactPersonWhatsapp || '—'})</div>
                  <div><strong className="text-slate-500">Delivery Address:</strong> {selectedOrder.address || '—'}</div>
                  <div><strong className="text-slate-500">Transporting Mode:</strong> {selectedOrder.typeOfTransporting || '—'}</div>
                  <div><strong className="text-slate-500">Firm Name:</strong> {selectedOrder.firmName || '—'}</div>
                  <div><strong className="text-slate-500">Marketing Sales Person:</strong> {selectedOrder.salesPersonName || '—'}</div>
                </div>
              </div>

              {/* Box 2: Product & Technical */}
              <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-700 pb-1 border-b border-slate-200 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" />
                  <span>Product & Specifications</span>
                </h4>
                <div className="space-y-1.5 text-xs">
                  <div><strong className="text-slate-500">Product Name:</strong> <span className="font-semibold text-slate-800">{selectedOrder.productName}</span></div>
                  <div><strong className="text-slate-500">Quantity:</strong> {selectedOrder.quantity} {selectedOrder.typeOfMeasurement}</div>
                  <div><strong className="text-slate-500">Rate of Material:</strong> ₹{selectedOrder.rateOfMaterial} per {selectedOrder.typeOfMeasurement}</div>
                  <div><strong className="text-slate-500">Total PO Basic:</strong> ₹{Number(selectedOrder.totalPoBasicValue).toLocaleString('en-IN')}</div>
                  <div><strong className="text-slate-500">Alumina%:</strong> {selectedOrder.aluminaPct || '—'} | <strong className="text-slate-500">Iron%:</strong> {selectedOrder.ironPct || '—'}</div>
                  <div><strong className="text-slate-500">Application:</strong> {selectedOrder.typeOfApplication || '—'}</div>
                  <div><strong className="text-slate-500">TC Required:</strong> {selectedOrder.tcRequired || '—'}</div>
                  <div><strong className="text-slate-500">Free Replacement (FOC):</strong> {selectedOrder.freeReplacementFoc || '—'}</div>
                </div>
              </div>

              {/* Box 3: Commercial & Payment Terms */}
              <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-700 pb-1 border-b border-slate-200 flex items-center gap-1.5">
                  <IndianRupee className="w-3.5 h-3.5" />
                  <span>Commercial & Payment</span>
                </h4>
                <div className="space-y-1.5 text-xs">
                  <div><strong className="text-slate-500">Type of PI:</strong> {selectedOrder.typeOfPi || '—'}</div>
                  <div><strong className="text-slate-500">Payment to be Taken:</strong> {selectedOrder.paymentToBeTaken || '—'}</div>
                  <div><strong className="text-slate-500">Advance Amount:</strong> ₹{Number(selectedOrder.advance || 0).toLocaleString('en-IN')}</div>
                  <div><strong className="text-slate-500">Basic Value:</strong> ₹{Number(selectedOrder.basic || 0).toLocaleString('en-IN')}</div>
                  <div><strong className="text-slate-500">Adjusted Amount:</strong> ₹{Number(selectedOrder.adjustedAmount || 0).toLocaleString('en-IN')}</div>
                  <div><strong className="text-slate-500">Lead Time Final Payment:</strong> {selectedOrder.leadTimeFinalPayment || '—'}</div>
                  <div><strong className="text-slate-500">Retention Payment:</strong> {selectedOrder.retentionPayment || 'No'} ({selectedOrder.retentionPercentage || '0%'} - {selectedOrder.leadTimeRetention || 'N/A'})</div>
                </div>
              </div>

              {/* Box 4: Reference & Extra */}
              <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-700 pb-1 border-b border-slate-200 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  <span>Order Origin & Notes</span>
                </h4>
                <div className="space-y-1.5 text-xs">
                  <div><strong className="text-slate-500">Order Received From:</strong> {selectedOrder.orderReceivedFrom || '—'}</div>
                  <div><strong className="text-slate-500">Through Agent:</strong> {selectedOrder.isThroughAgent || 'No'}</div>
                  <div><strong className="text-slate-500">Reference No.:</strong> {selectedOrder.referenceNo || '—'}</div>
                  <div>
                    <strong className="text-slate-500">Sales Order Document (SO):</strong>{' '}
                    {selectedOrder.uploadSo ? (
                      selectedOrder.uploadSo.startsWith('http') ? (
                        <a
                          href={selectedOrder.uploadSo}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:underline inline-flex items-center gap-1"
                        >
                          <span>Open Document</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span>{selectedOrder.uploadSo}</span>
                      )
                    ) : (
                      '—'
                    )}
                  </div>
                  <div><strong className="text-slate-500">Specific Concern:</strong> {selectedOrder.specificConcern || '—'}</div>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-200 gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsViewModalOpen(false);
                  handleOpenEdit(selectedOrder);
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs flex items-center gap-1.5"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Edit Order</span>
              </button>
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
      )}

      {/* =========================================================================
          EDIT ORDER MODAL
      ========================================================================= */}
      {isEditModalOpen && (
        <Modal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          title={`Edit Purchase Order: ${formData.doNumber}`}
          maxWidth="max-w-4xl"
        >
          <form onSubmit={handleEditSubmit} className="space-y-6">
            {/* SECTION 1: PO & GENERAL INFO */}
            <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200 space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-700 pb-2 border-b border-slate-200 flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-600" />
                <span>1. PO & General Information</span>
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    DO-Delivery Order No. (Auto Generated) *
                  </label>
                  <input
                    type="text"
                    required
                    readOnly
                    value={formData.doNumber}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-100 border border-slate-300 rounded-lg font-mono font-bold text-indigo-700 cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    PARTY PO NO (As Per Po Exact) *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.partyPoNo}
                    onChange={(e) => setFormData({ ...formData, partyPoNo: e.target.value })}
                    placeholder="e.g. PO/TSL/2026/8941"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Party PO Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.partyPoDate}
                    onChange={(e) => setFormData({ ...formData, partyPoDate: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Reference No.
                  </label>
                  <input
                    type="text"
                    value={formData.referenceNo}
                    onChange={(e) => setFormData({ ...formData, referenceNo: e.target.value })}
                    placeholder="e.g. REF-2026-09"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                  />
                </div>

                <div>
                  <SearchableSelect
                    label="Marketing Sales Person"
                    required
                    options={salesPersonOptions}
                    value={formData.salesPersonName}
                    onChange={(val) => setFormData({ ...formData, salesPersonName: val })}
                    placeholder="Select or search Sales Person..."
                    searchPlaceholder="Type to search sales person..."
                    allowCustom={true}
                  />
                </div>

                <div>
                  <SearchableSelect
                    label="Firm Name"
                    required
                    options={firmOptions}
                    value={formData.firmName}
                    onChange={(val) => setFormData({ ...formData, firmName: val })}
                    placeholder="Select or search Firm Name..."
                    searchPlaceholder="Type to search firm name..."
                    allowCustom={true}
                  />
                </div>
              </div>
            </div>

            {/* SECTION 2: CUSTOMER / PARTY DETAILS */}
            <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200 space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-700 pb-2 border-b border-slate-200 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-indigo-600" />
                <span>2. Customer / Party Details</span>
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <SearchableSelect
                    label="Party Names"
                    required
                    options={partyNamesOptions}
                    value={formData.partyNames}
                    onChange={handlePartyNameChange}
                    placeholder="Select or search Party Name..."
                    searchPlaceholder="Type to search party / customer name..."
                    allowCustom={true}
                  />
                </div>

                <div>
                  <SearchableSelect
                    label="Customer Category"
                    options={categoryOptions}
                    value={formData.customerCategory}
                    onChange={(val) => setFormData({ ...formData, customerCategory: val })}
                    placeholder="Select Customer Category..."
                    searchPlaceholder="Type to search category..."
                    allowCustom={true}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    GST Number
                  </label>
                  <input
                    type="text"
                    value={formData.gstNumber}
                    onChange={(e) => setFormData({ ...formData, gstNumber: e.target.value })}
                    placeholder="20AAACT2727Q1ZM"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Contact Person Name
                  </label>
                  <input
                    type="text"
                    value={formData.contactPersonName}
                    onChange={(e) => setFormData({ ...formData, contactPersonName: e.target.value })}
                    placeholder="e.g. Sanjay Sengupta"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Contact Person WhatsApp No.
                  </label>
                  <input
                    type="text"
                    value={formData.contactPersonWhatsapp}
                    onChange={(e) => setFormData({ ...formData, contactPersonWhatsapp: e.target.value })}
                    placeholder="e.g. 9830123456"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                  />
                </div>

                <div>
                  <SearchableSelect
                    label="Order Received From"
                    options={orderSourceOptions}
                    value={formData.orderReceivedFrom}
                    onChange={(val) => setFormData({ ...formData, orderReceivedFrom: val })}
                    placeholder="Select or search source..."
                    searchPlaceholder="Type to search source..."
                    allowCustom={true}
                  />
                </div>

                <div>
                  <SearchableSelect
                    label="Is This Order Through Some Agent"
                    options={agentOptions}
                    value={formData.isThroughAgent}
                    onChange={(val) => setFormData({ ...formData, isThroughAgent: val })}
                    placeholder="Select Yes/No..."
                    searchPlaceholder="Search..."
                    allowCustom={false}
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Delivery Address
                  </label>
                  <textarea
                    rows="2"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="Full plant/site address..."
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                  />
                </div>
              </div>
            </div>

            {/* SECTION 3: PRODUCT & TECHNICAL SPECS */}
            <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200 space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-700 pb-2 border-b border-slate-200 flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600" />
                <span>3. Product & Technical Specifications</span>
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <SearchableSelect
                    label="Product Name"
                    required
                    options={productOptions}
                    value={formData.productName}
                    onChange={(val) => setFormData({ ...formData, productName: val })}
                    placeholder="Select or search Product Name..."
                    searchPlaceholder="Type to search product..."
                    allowCustom={true}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Quantity *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formData.quantity}
                    onChange={(e) => handleQtyRateChange('quantity', e.target.value)}
                    placeholder="1200"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                  />
                </div>

                <div>
                  <SearchableSelect
                    label="Type Of Measurement"
                    required
                    options={measurementOptions}
                    value={formData.typeOfMeasurement}
                    onChange={(val) => setFormData({ ...formData, typeOfMeasurement: val })}
                    placeholder="Select measurement unit..."
                    searchPlaceholder="Type to search unit..."
                    allowCustom={true}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Rate Of Material (₹) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={formData.rateOfMaterial}
                    onChange={(e) => handleQtyRateChange('rateOfMaterial', e.target.value)}
                    placeholder="300"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Total PO Basic Value (Auto: Qty × Rate)
                  </label>
                  <input
                    type="number"
                    readOnly
                    value={formData.totalPoBasicValue}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-100 border border-slate-300 rounded-lg font-bold text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Alumina%
                  </label>
                  <input
                    type="text"
                    value={formData.aluminaPct}
                    onChange={(e) => setFormData({ ...formData, aluminaPct: e.target.value })}
                    placeholder="e.g. 70%, 80%"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Iron%
                  </label>
                  <input
                    type="text"
                    value={formData.ironPct}
                    onChange={(e) => setFormData({ ...formData, ironPct: e.target.value })}
                    placeholder="e.g. < 1.5%"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Type Of Application
                  </label>
                  <input
                    type="text"
                    value={formData.typeOfApplication}
                    onChange={(e) => setFormData({ ...formData, typeOfApplication: e.target.value })}
                    placeholder="e.g. Ladle, Tundish, Rotary Kiln, Boiler"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <SearchableSelect
                      label="TC Required"
                      options={tcRequiredOptions}
                      value={formData.tcRequired}
                      onChange={(val) => setFormData({ ...formData, tcRequired: val })}
                      placeholder="Select..."
                      searchPlaceholder="Search..."
                      allowCustom={false}
                    />
                  </div>
                  <div>
                    <SearchableSelect
                      label="Free Replacement (FOC)"
                      options={freeReplacementOptions}
                      value={formData.freeReplacementFoc}
                      onChange={(val) => setFormData({ ...formData, freeReplacementFoc: val })}
                      placeholder="Select..."
                      searchPlaceholder="Search..."
                      allowCustom={false}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* SECTION 4: COMMERCIAL & PAYMENT TERMS */}
            <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200 space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-700 pb-2 border-b border-slate-200 flex items-center gap-2">
                <IndianRupee className="w-4 h-4 text-indigo-600" />
                <span>4. Commercial & Payment Terms</span>
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <SearchableSelect
                    label="Type Of PI"
                    required
                    options={piTypeOptions}
                    value={formData.typeOfPi}
                    onChange={(val) => setFormData({ ...formData, typeOfPi: val })}
                    placeholder="Select or search PI Type..."
                    searchPlaceholder="Type to search PI type..."
                    allowCustom={true}
                  />
                </div>

                <div>
                  <SearchableSelect
                    label="Payment to Be Taken"
                    required
                    options={paymentToBeTakenOptions}
                    value={formData.paymentToBeTaken}
                    onChange={(val) => setFormData({ ...formData, paymentToBeTaken: val })}
                    placeholder="Select or search payment term..."
                    searchPlaceholder="Type to search term..."
                    allowCustom={true}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Advance Amount (₹)
                  </label>
                  <input
                    type="number"
                    value={formData.advance}
                    onChange={(e) => setFormData({ ...formData, advance: e.target.value })}
                    placeholder="0"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Basic Amount (₹)
                  </label>
                  <input
                    type="number"
                    value={formData.basic}
                    onChange={(e) => setFormData({ ...formData, basic: e.target.value })}
                    placeholder="0"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Adjusted Amount (₹)
                  </label>
                  <input
                    type="number"
                    value={formData.adjustedAmount}
                    onChange={(e) => setFormData({ ...formData, adjustedAmount: e.target.value })}
                    placeholder="0"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Total PO Value (₹) *
                  </label>
                  <input
                    type="number"
                    required
                    value={formData.totalPoValue}
                    onChange={(e) => setFormData({ ...formData, totalPoValue: e.target.value })}
                    placeholder="Total invoice amount"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-indigo-300 rounded-lg font-bold text-indigo-900 focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Lead Time For Collection Of Final Payment
                  </label>
                  <input
                    type="text"
                    value={formData.leadTimeFinalPayment}
                    onChange={(e) => setFormData({ ...formData, leadTimeFinalPayment: e.target.value })}
                    placeholder="e.g. 30 Days / 45 Days"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                  />
                </div>

                <div>
                  <SearchableSelect
                    label="Retention Payment (Yes / No)"
                    options={retentionPaymentOptions}
                    value={formData.retentionPayment}
                    onChange={(val) => setFormData({ ...formData, retentionPayment: val })}
                    placeholder="Select..."
                    searchPlaceholder="Search..."
                    allowCustom={false}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Retention Percentage (%)
                  </label>
                  <input
                    type="text"
                    value={formData.retentionPercentage}
                    onChange={(e) => setFormData({ ...formData, retentionPercentage: e.target.value })}
                    placeholder="e.g. 10%"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Lead Time for Retention
                  </label>
                  <input
                    type="text"
                    value={formData.leadTimeRetention}
                    onChange={(e) => setFormData({ ...formData, leadTimeRetention: e.target.value })}
                    placeholder="e.g. 6 Months / After Performance"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                  />
                </div>
              </div>
            </div>

            {/* SECTION 5: LOGISTICS & SPECIAL NOTES */}
            <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200 space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-700 pb-2 border-b border-slate-200 flex items-center gap-2">
                <Truck className="w-4 h-4 text-indigo-600" />
                <span>5. Logistics & Special Notes</span>
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <SearchableSelect
                    label="Type Of Transporting"
                    options={transportOptions}
                    value={formData.typeOfTransporting}
                    onChange={(val) => setFormData({ ...formData, typeOfTransporting: val })}
                    placeholder="Select or search transport mode..."
                    searchPlaceholder="Type to search transporting..."
                    allowCustom={true}
                  />
                </div>

                <div>
                  <FileUploader
                    label="Upload SO (Sales Order Document)"
                    value={formData.uploadSo}
                    onChange={(url) => setFormData({ ...formData, uploadSo: url })}
                    accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Specific Concern / Special Instructions
                  </label>
                  <textarea
                    rows="3"
                    value={formData.specificConcern}
                    onChange={(e) => setFormData({ ...formData, specificConcern: e.target.value })}
                    placeholder="Special packing instructions, moisture protection, delivery time window, etc."
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                  />
                </div>
              </div>
            </div>

            {/* Bottom Sticky Action Bar */}
            <div className="sticky bottom-0 bg-white/95 backdrop-blur-xs pt-4 pb-1 border-t border-slate-200 flex items-center justify-end gap-3 z-10">
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="px-5 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm shadow-indigo-200 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Updating Sheet...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Update Order in Sheet</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* =========================================================================
          DELETE ORDER CONFIRMATION MODAL
      ========================================================================= */}
      {isDeleteModalOpen && selectedOrder && (
        <Modal
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          title="Confirm Delete Delivery Order"
          maxWidth="max-w-md"
        >
          <div className="space-y-4">
            <div className="p-4 bg-rose-50 rounded-xl border border-rose-100 text-rose-800 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold">Delete Order {selectedOrder.doNumber}?</h4>
                <p className="text-xs mt-1 text-rose-700">
                  Are you sure you want to delete PO <strong>{selectedOrder.partyPoNo}</strong> for{' '}
                  <strong>{selectedOrder.partyNames}</strong>? This will remove the row from Google Sheets.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm flex items-center gap-1.5 disabled:opacity-50"
              >
                {submitting ? 'Deleting...' : 'Delete Order'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* =========================================================================
          CHECK PO MODAL — Approve / Reject + Expected Delivery Date
      ========================================================================= */}
      {isCheckModalOpen && checkOrder && (
        <Modal
          isOpen={isCheckModalOpen}
          onClose={() => setIsCheckModalOpen(false)}
          title={`Check PO — ${checkOrder.doNumber || 'Order Details'}`}
          maxWidth="max-w-3xl"
        >
          <div className="space-y-5">

            {/* ── Order Summary ───────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 bg-slate-50 rounded-xl p-4 border border-slate-200 text-xs">
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">DO Number</p>
                <p className="font-bold text-indigo-600 font-mono text-sm">{checkOrder.doNumber || '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Party PO No.</p>
                <p className="font-semibold text-slate-800">{checkOrder.partyPoNo || '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Party PO Date</p>
                <p className="text-slate-700">{api.formatDate(checkOrder.partyPoDate) || '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Party Name</p>
                <p className="font-semibold text-slate-800">{checkOrder.partyNames || '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Product Name</p>
                <p className="text-slate-700">{checkOrder.productName || '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Quantity</p>
                <p className="text-slate-700">{checkOrder.quantity ? Number(checkOrder.quantity).toLocaleString('en-IN') : '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Rate Of Material</p>
                <p className="text-slate-700">{checkOrder.rateOfMaterial ? `₹${Number(checkOrder.rateOfMaterial).toLocaleString('en-IN')}` : '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Total PO Basic Value</p>
                <p className="font-semibold text-slate-800">{checkOrder.totalPoBasicValue ? `₹${Number(checkOrder.totalPoBasicValue).toLocaleString('en-IN')}` : '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Total PO Value</p>
                <p className="font-bold text-emerald-700">{checkOrder.totalPoValue ? `₹${Number(checkOrder.totalPoValue).toLocaleString('en-IN')}` : '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Sales Person</p>
                <p className="text-slate-700">{checkOrder.salesPersonName || '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Type Of Transporting</p>
                <p className="text-slate-700">{checkOrder.typeOfTransporting || '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Payment To Be Taken</p>
                <p className="text-slate-700">{checkOrder.paymentToBeTaken || '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Advance</p>
                <p className="text-slate-700">{checkOrder.advance ? `₹${Number(checkOrder.advance).toLocaleString('en-IN')}` : '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">TC Required</p>
                <p className="text-slate-700">{checkOrder.tcRequired || '—'}</p>
              </div>
              {checkOrder.specificConcern && (
                <div className="col-span-2">
                  <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Specific Concern</p>
                  <p className="text-slate-700">{checkOrder.specificConcern}</p>
                </div>
              )}
              <div className="col-span-2">
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Timestamp</p>
                <p className="text-slate-500 font-mono text-[11px]">{api.formatDate(checkOrder.timestamp) || '—'}</p>
              </div>
            </div>

            {/* ── Expected Delivery Date ──────────────────────────── */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Expected Delivery Date
              </label>
              <input
                type="date"
                value={checkForm.expectedDeliveryDate}
                onChange={(e) => setCheckForm((prev) => ({ ...prev, expectedDeliveryDate: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
              />
            </div>

            {/* ── Approve / Reject ────────────────────────────────── */}
            <div>
              <p className="text-xs font-semibold text-slate-700 mb-2">Decision</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setCheckForm((prev) => ({ ...prev, status: 'Approved' }))}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                    checkForm.status === 'Approved'
                      ? 'bg-emerald-600 border-emerald-600 text-white shadow-md'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-emerald-400 hover:text-emerald-600'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => setCheckForm((prev) => ({ ...prev, status: 'Rejected' }))}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                    checkForm.status === 'Rejected'
                      ? 'bg-rose-600 border-rose-600 text-white shadow-md'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-rose-400 hover:text-rose-600'
                  }`}
                >
                  <AlertCircle className="w-4 h-4" />
                  Reject
                </button>
              </div>
              {checkForm.status && (
                <p className={`mt-2 text-xs font-medium text-center ${checkForm.status === 'Approved' ? 'text-emerald-600' : 'text-rose-600'}`}>
                  Selected: <strong>{checkForm.status}</strong>
                  {checkForm.expectedDeliveryDate && ` | Expected Delivery: ${checkForm.expectedDeliveryDate}`}
                </p>
              )}
            </div>

            {/* ── Remark ─────────────────────────────────────────── */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Remark
              </label>
              <textarea
                rows={2}
                value={checkForm.remark}
                onChange={(e) => setCheckForm((prev) => ({ ...prev, remark: e.target.value }))}
                placeholder="Enter remarks for Check PO..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent resize-none"
              />
            </div>

            {/* ── Footer Buttons ──────────────────────────────────── */}
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsCheckModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                Close
              </button>
              <button
                type="button"
                disabled={!checkForm.status || submitting}
                onClick={handleConfirmCheck}
                className={`px-5 py-2 text-xs font-semibold text-white rounded-lg shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${
                  checkForm.status === 'Rejected'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {submitting ? 'Saving to Sheet...' : `Confirm ${checkForm.status || 'Decision'}`}
              </button>
            </div>
          </div>
        </Modal>
      )}

    </div>
  );
}
