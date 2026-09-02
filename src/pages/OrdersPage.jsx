import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import Modal from '../components/common/Modal';
import SearchableSelect from '../components/common/SearchableSelect';
import FileUploader from '../components/common/FileUploader';
import {
  Search,
  Plus,
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
  User,
  Phone,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';

const DEFAULT_FIRM_OPTIONS = [
  'Refrasynth Corporate',
  'Refrasynth Manufacturing Unit 1',
  'Refrasynth Plant 2',
  'Refrasynth Refractories Ltd',
  'Refrasynth Trading Division',
];

const DEFAULT_TRANSPORT_OPTIONS = [
  'By Road',
  'Dedicated Truck',
  'Part Load / Consignment',
  'FOR Destination',
  'Ex-Works (Customer Scope)',
  'Freight to Pay',
  'Rake / Train Loading',
  'Courier / Express Cargo',
];

const CATEGORY_OPTIONS = [
  'Steel Plant',
  'Cement',
  'Foundry',
  'Power',
  'Aluminium',
  'Glass',
  'Chemical / Fertilizer',
  'Other',
];

const MEASUREMENT_OPTIONS = [
  { value: 'MT', label: 'MT (Metric Ton)' },
  { value: 'Pcs', label: 'Pcs (Pieces)' },
  { value: 'Bags', label: 'Bags (25kg/50kg)' },
  { value: 'Kgs', label: 'Kgs (Kilograms)' },
  { value: 'Tonnes', label: 'Tonnes' },
  { value: 'Sqm', label: 'Sqm (Square Meter)' },
];

const PI_TYPE_OPTIONS = [
  '100% Advance',
  'Against Dispatch',
  'Against Delivery',
  '30 Days Credit',
  '45 Days Credit',
  '60 Days LC',
  '90 Days LC',
  'LC at Sight',
  'PDC (Post Dated Cheque)',
];

const PAYMENT_TO_BE_TAKEN_OPTIONS = [
  'Advance + Against Dispatch',
  '100% Advance',
  'Against Dispatch',
  'Against Delivery',
  '30 Days LC / Credit',
  '60 Days LC',
  '90 Days LC',
];

const ORDER_SOURCE_OPTIONS = [
  'Email',
  'WhatsApp',
  'Direct PO Copy',
  'Agent / Broker',
  'Phone Call',
  'Tender / GeM Portal',
];

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

const emptyProductRow = {
  productName: '',
  quantity: '',
  typeOfMeasurement: '',
  rateOfMaterial: '',
  totalPoBasicValue: '',
  aluminaPct: '',
  ironPct: '',
  typeOfApplication: '',
};

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [successNotice, setSuccessNotice] = useState('');

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);

  const [formData, setFormData] = useState(emptyOrderForm);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Multiple product line items for the "Add New Order" flow (each becomes its own
  // Delivery Order row in the sheet, sharing the rest of the PO/party/commercial data)
  const [products, setProducts] = useState([{ ...emptyProductRow }]);

  // Dynamic Master Tab Data from Google Sheets
  const [masterData, setMasterData] = useState({});

  const fetchMasterData = async () => {
    try {
      const res = await api.getMasterData();
      if (res && res.success && res.data) {
        setMasterData(res.data);
      }
    } catch (err) {
      console.warn('Failed to load Master tab data:', err);
    }
  };

  // Fetch orders from Google Sheet (Orders tab)
  const fetchOrders = async (showSync = false) => {
    if (showSync) setSyncing(true);
    else setLoading(true);
    setError('');

    try {
      const res = await api.getOrders();
      if (res && res.success && Array.isArray(res.data)) {
        setOrders(res.data);
      } else {
        setError(res?.error || 'Failed to fetch orders from Google Sheets.');
      }
      if (showSync) {
        await fetchMasterData();
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
    fetchMasterData();
  }, []);

  const notifySuccess = (msg) => {
    setSuccessNotice(msg);
    setTimeout(() => setSuccessNotice(''), 4500);
  };

  // Helper to extract options from Google Sheet Master tab by alias
  const getMasterOptions = (aliases, defaultList = []) => {
    if (!masterData || typeof masterData !== 'object') return defaultList;
    for (const alias of aliases) {
      const direct = masterData[alias];
      if (Array.isArray(direct) && direct.length > 0) return direct;

      // Case-insensitive & symbol-insensitive matching
      const cleanAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
      const foundKey = Object.keys(masterData).find(
        (k) => k.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanAlias
      );
      if (foundKey && Array.isArray(masterData[foundKey]) && masterData[foundKey].length > 0) {
        return masterData[foundKey];
      }
    }
    return defaultList;
  };

  // Auto calculate basic value & total value when qty or rate changes
  const handleQtyRateChange = (field, value) => {
    const updated = { ...formData, [field]: value };
    const q = parseFloat(field === 'quantity' ? value : updated.quantity) || 0;
    const r = parseFloat(field === 'rateOfMaterial' ? value : updated.rateOfMaterial) || 0;
    const basicVal = Math.round(q * r);
    updated.totalPoBasicValue = basicVal || '';
    updated.basic = basicVal || '';

    // Calculate Total PO value including 18% GST estimate if not adjusted
    const adj = parseFloat(updated.adjustedAmount) || 0;
    const totalVal = Math.round(basicVal * 1.18) + adj;
    updated.totalPoValue = basicVal > 0 ? totalVal : '';

    setFormData(updated);
  };

  // Add a new blank product line (max 20 products per PO submission)
  const handleAddProductRow = () => {
    if (products.length >= 20) return;
    setProducts((prev) => [...prev, { ...emptyProductRow }]);
  };

  // Remove a product line
  const handleRemoveProductRow = (idx) => {
    if (products.length <= 1) return;
    setProducts((prev) => prev.filter((_, i) => i !== idx));
  };

  // Update a field on a specific product line, auto-computing its Basic Value (Qty × Rate)
  const handleProductFieldChange = (idx, field, value) => {
    setProducts((prev) => {
      const updated = [...prev];
      const row = { ...updated[idx], [field]: value };
      if (field === 'quantity' || field === 'rateOfMaterial') {
        const q = parseFloat(field === 'quantity' ? value : row.quantity) || 0;
        const r = parseFloat(field === 'rateOfMaterial' ? value : row.rateOfMaterial) || 0;
        row.totalPoBasicValue = q * r ? Math.round(q * r) : '';
      }
      updated[idx] = row;
      return updated;
    });
  };

  // Filtered orders list
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesCategory =
        categoryFilter === 'All' ||
        (order.customerCategory && order.customerCategory === categoryFilter);

      const q = searchQuery.toLowerCase();
      const matchesSearch =
        (order.doNumber && order.doNumber.toLowerCase().includes(q)) ||
        (order.partyPoNo && order.partyPoNo.toLowerCase().includes(q)) ||
        (order.partyNames && order.partyNames.toLowerCase().includes(q)) ||
        (order.productName && order.productName.toLowerCase().includes(q)) ||
        (order.salesPersonName && order.salesPersonName.toLowerCase().includes(q));

      return matchesCategory && matchesSearch;
    });
  }, [orders, searchQuery, categoryFilter]);

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
    const fromMaster = getMasterOptions(['Marketing Sales Person', 'Marketing Sales Person', 'Marketing Salesperson'], []);
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
      // 1. Check Master sheet directory (Party Name -> GST Number, Delivery Address)
      const directory = masterData?._partyDirectory || {};
      const fromMaster = directory[cleanKey];
      if (fromMaster) {
        if (fromMaster.gstNumber) updated.gstNumber = fromMaster.gstNumber;
        if (fromMaster.address) updated.address = fromMaster.address;
      } else {
        // Check partial match in case of minor casing/spacing differences
        const matchedKey = Object.keys(directory).find(
          (k) => k === cleanKey || (k.length > 3 && cleanKey.includes(k)) || (cleanKey.length > 3 && k.includes(cleanKey))
        );
        if (matchedKey && directory[matchedKey]) {
          if (directory[matchedKey].gstNumber) updated.gstNumber = directory[matchedKey].gstNumber;
          if (directory[matchedKey].address) updated.address = directory[matchedKey].address;
        } else {
          // 2. Fallback to existing orders in case entered previously
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

  // Generate next sequential DO Number starting from DO-001
  const generateNextDoNumber = (existingOrders = []) => {
    if (!Array.isArray(existingOrders) || existingOrders.length === 0) {
      return 'DO-001';
    }

    let maxNum = 0;
    existingOrders.forEach((o) => {
      const doStr = (o.doNumber || '').toString().trim();
      // Matches DO-001, DO-002, etc.
      const match = doStr.match(/DO-(?:[0-9]+-)?([0-9]+)/i) || doStr.match(/([0-9]+)$/);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    });

    const nextNum = maxNum > 0 ? maxNum + 1 : existingOrders.length + 1;
    return `DO-${String(nextNum).padStart(3, '0')}`;
  };

  // Open Add Modal with Auto-generated DO Number (Series: DO-001, DO-002...)
  const handleOpenAdd = () => {
    const autoDo = generateNextDoNumber(orders);

    setFormData({
      ...emptyOrderForm,
      doNumber: autoDo,
    });
    setProducts([{ ...emptyProductRow }]);
    setIsAddModalOpen(true);
  };

  // Submit Add Order — inserts ONE Delivery Order row per product line, all sharing
  // the same party/commercial/logistics data, with sequential auto-generated DO numbers
  const handleAddSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const validProducts = products.filter(
        (p) => p.productName && p.quantity && p.rateOfMaterial
      );

      if (validProducts.length === 0) {
        setError('Please add at least one product with Product Name, Quantity, and Rate Of Material.');
        setSubmitting(false);
        return;
      }

      const adj = parseFloat(formData.adjustedAmount) || 0;
      let workingOrders = [...orders];
      const optimisticOrders = [];
      const assignedDoNumbers = [];

      for (const p of validProducts) {
        const nextDo = generateNextDoNumber(workingOrders);
        const q = parseFloat(p.quantity) || 0;
        const r = parseFloat(p.rateOfMaterial) || 0;
        const basicVal = Math.round(q * r);
        const totalVal = basicVal > 0 ? Math.round(basicVal * 1.18) + adj : Number(formData.totalPoValue) || 0;

        const orderData = {
          ...formData,
          doNumber: nextDo,
          productName: p.productName,
          quantity: p.quantity,
          typeOfMeasurement: p.typeOfMeasurement,
          rateOfMaterial: p.rateOfMaterial,
          totalPoBasicValue: basicVal || p.totalPoBasicValue,
          basic: basicVal || p.totalPoBasicValue,
          aluminaPct: p.aluminaPct,
          ironPct: p.ironPct,
          typeOfApplication: p.typeOfApplication,
          totalPoValue: totalVal,
        };

        const res = await api.addOrder(orderData);
        if (!res || !res.success) {
          setError(res?.error || `Failed to add order ${nextDo} to Google Sheet.`);
          setSubmitting(false);
          return;
        }

        assignedDoNumbers.push(nextDo);
        workingOrders = [...workingOrders, { doNumber: nextDo }];
        optimisticOrders.push({
          ...orderData,
          orderId: nextDo,
          customerName: orderData.partyNames,
          product: orderData.productName,
          amount: Number(orderData.totalPoValue) || Number(orderData.totalPoBasicValue) || 0,
          orderDate: orderData.partyPoDate,
          rowIndex: orders.length + optimisticOrders.length + 2,
        });
      }

      // Optimistically add all new rows to UI
      setOrders((prev) => [...optimisticOrders, ...prev]);

      setIsAddModalOpen(false);
      notifySuccess(
        assignedDoNumbers.length > 1
          ? `${assignedDoNumbers.length} Delivery Orders added successfully: ${assignedDoNumbers.join(', ')}!`
          : `Delivery Order ${assignedDoNumbers[0]} added successfully!`
      );

      setTimeout(() => {
        fetchOrders(false);
      }, 1500);
    } catch (err) {
      setError(err.message || 'Error adding order.');
    } finally {
      setSubmitting(false);
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (order) => {
    setSelectedOrder(order);
    setFormData({ ...order });
    setIsEditModalOpen(true);
  };

  // Submit Edit Order
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!selectedOrder) return;
    setSubmitting(true);
    setError('');

    try {
      const res = await api.updateOrder(selectedOrder.rowIndex, formData);
      if (res && res.success) {
        // Optimistically update
        setOrders((prev) =>
          prev.map((o) => (o.rowIndex === selectedOrder.rowIndex ? { ...formData } : o))
        );

        setIsEditModalOpen(false);
        notifySuccess(res.message || `Order ${formData.doNumber} updated successfully!`);

        setTimeout(() => {
          fetchOrders(false);
        }, 1500);
      } else {
        setError(res?.error || 'Failed to update order in Google Sheet.');
      }
    } catch (err) {
      setError(err.message || 'Error updating order.');
    } finally {
      setSubmitting(false);
    }
  };

  // Open Delete Modal
  const handleOpenDelete = (order) => {
    setSelectedOrder(order);
    setIsDeleteModalOpen(true);
  };

  // Confirm Delete Order
  const handleDeleteConfirm = async () => {
    if (!selectedOrder) return;
    setSubmitting(true);
    setError('');

    try {
      const res = await api.deleteOrder(selectedOrder.rowIndex);
      if (res && res.success) {
        setOrders((prev) => prev.filter((o) => o.rowIndex !== selectedOrder.rowIndex));
        setIsDeleteModalOpen(false);
        notifySuccess(res.message || `Order ${selectedOrder.doNumber} deleted successfully!`);

        setTimeout(() => {
          fetchOrders(false);
        }, 1500);
      } else {
        setError(res?.error || 'Failed to delete order from Google Sheet.');
      }
    } catch (err) {
      setError(err.message || 'Error deleting order.');
    } finally {
      setSubmitting(false);
    }
  };

  // Open View Details Modal
  const handleOpenView = (order) => {
    setSelectedOrder(order);
    setIsViewModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Sticky Page Header + Alerts + Filters (stays fixed while table scrolls) */}
      <div className="sticky top-0 z-30 bg-slate-50 pb-2 -mt-6 pt-6 space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 m-0 flex items-center gap-2.5">
              <Package className="w-7 h-7 text-indigo-600" />
              <span>Orders Management</span>
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Order to Collection (O2C) records synchronized with Google Sheets (<strong>Orders</strong> tab)
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => fetchOrders(true)}
              disabled={syncing || loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-2xs transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin text-indigo-600' : 'text-slate-500'}`} />
              <span>{syncing ? 'Syncing...' : 'Sync Sheet'}</span>
            </button>

            <button
              type="button"
              onClick={handleOpenAdd}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-sm shadow-indigo-200 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Add New Order</span>
            </button>
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
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-270px)] border-t border-slate-200">
          <table className="w-full text-left text-xs text-slate-600 border-collapse">
            <thead className="sticky top-0 bg-slate-100 z-20 shadow-xs border-b border-slate-300 font-semibold text-slate-700 uppercase tracking-wider text-[11px]">
              <tr>
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
                  <td colSpan="37" className="py-20 text-center text-slate-400">
                    <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                    <p className="text-xs font-medium text-slate-500">Loading orders from Google Sheets...</p>
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan="37" className="py-16 text-center text-slate-400">
                    <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <h3 className="text-sm font-semibold text-slate-700">No orders recorded in Google Sheets yet</h3>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                      {searchQuery || categoryFilter !== 'All'
                        ? 'Try adjusting your search query or filters.'
                        : 'Click "+ Add New Order" above to create your first delivery order.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order, idx) => (
                  <tr key={order.doNumber || idx} className="hover:bg-slate-50/80 transition-colors">
                    {/* 0. Timestamp */}
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
                      <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${order.isThroughAgent === 'Yes' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-slate-50 text-slate-600'}`}>
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
                    <td className="px-3.5 py-3 whitespace-nowrap max-w-xs truncate text-slate-700" title={order.address}>
                      {order.address || '—'}
                    </td>

                    {/* 24. Firm Name */}
                    <td className="px-3.5 py-3 whitespace-nowrap text-slate-700">
                      {order.firmName || '—'}
                    </td>

                    {/* 25. Total PO Basic Value */}
                    <td className="px-3.5 py-3 text-right font-medium text-slate-800 whitespace-nowrap">
                      {order.totalPoBasicValue ? `₹${Number(order.totalPoBasicValue).toLocaleString('en-IN')}` : '—'}
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
                    <td className="px-3.5 py-3 whitespace-nowrap max-w-xs truncate text-slate-700" title={order.specificConcern}>
                      {order.specificConcern || '—'}
                    </td>

                    {/* 33. Reference No. */}
                    <td className="px-3.5 py-3 whitespace-nowrap text-slate-700">
                      {order.referenceNo || '—'}
                    </td>

                    {/* 34. Adjusted Amount */}
                    <td className="px-3.5 py-3 text-right font-medium text-slate-800 whitespace-nowrap">
                      {order.adjustedAmount ? `₹${Number(order.adjustedAmount).toLocaleString('en-IN')}` : '—'}
                    </td>

                    {/* 35. Total PO Value */}
                    <td className="px-3.5 py-3 text-right font-bold text-slate-900 whitespace-nowrap">
                      {order.totalPoValue ? `₹${Number(order.totalPoValue).toLocaleString('en-IN')}` : '—'}
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
          ADD / EDIT ORDER MODAL (37 Fields organized in 5 logical tabs)
      ========================================================================= */}
      {(isAddModalOpen || isEditModalOpen) && (
        <Modal
          isOpen={isAddModalOpen || isEditModalOpen}
          onClose={() => {
            setIsAddModalOpen(false);
            setIsEditModalOpen(false);
          }}
          title={isAddModalOpen ? 'Add New Order to Sheet' : `Edit Delivery Order: ${formData.doNumber}`}
          maxWidth="max-w-4xl"
        >
          <form onSubmit={isAddModalOpen ? handleAddSubmit : handleEditSubmit} className="space-y-6">
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
                  {isAddModalOpen && products.length > 1 && (
                    <p className="text-[11px] text-slate-400 mt-1">
                      Starting DO number — each product below gets its own sequential DO number.
                    </p>
                  )}
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
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-700 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-600" />
                  <span>3. Product & Technical Specifications</span>
                </h4>
                {isAddModalOpen && (
                  <button
                    type="button"
                    onClick={handleAddProductRow}
                    disabled={products.length >= 20}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-indigo-700 hover:bg-indigo-50 shadow-2xs disabled:opacity-50"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Product
                  </button>
                )}
              </div>

              {isAddModalOpen ? (
                <div className="space-y-4">
                  {products.map((p, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-3 relative"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                          Product {idx + 1}
                        </span>
                        {products.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveProductRow(idx)}
                            className="text-rose-400 hover:text-rose-600 transition-colors p-0.5 rounded"
                            title="Remove Product"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                          <SearchableSelect
                            label="Product Name"
                            required
                            options={productOptions}
                            value={p.productName}
                            onChange={(val) => handleProductFieldChange(idx, 'productName', val)}
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
                            value={p.quantity}
                            onChange={(e) => handleProductFieldChange(idx, 'quantity', e.target.value)}
                            placeholder="1200"
                            className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                          />
                        </div>

                        <div>
                          <SearchableSelect
                            label="Type Of Measurement"
                            required
                            options={measurementOptions}
                            value={p.typeOfMeasurement}
                            onChange={(val) => handleProductFieldChange(idx, 'typeOfMeasurement', val)}
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
                            value={p.rateOfMaterial}
                            onChange={(e) => handleProductFieldChange(idx, 'rateOfMaterial', e.target.value)}
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
                            value={p.totalPoBasicValue}
                            className="w-full px-3.5 py-2.5 text-sm bg-slate-100 border border-slate-300 rounded-lg font-bold text-slate-800"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            Alumina%
                          </label>
                          <input
                            type="text"
                            value={p.aluminaPct}
                            onChange={(e) => handleProductFieldChange(idx, 'aluminaPct', e.target.value)}
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
                            value={p.ironPct}
                            onChange={(e) => handleProductFieldChange(idx, 'ironPct', e.target.value)}
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
                            value={p.typeOfApplication}
                            onChange={(e) => handleProductFieldChange(idx, 'typeOfApplication', e.target.value)}
                            placeholder="e.g. Ladle, Tundish, Rotary Kiln, Boiler"
                            className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                          />
                        </div>
                      </div>
                    </div>
                  ))}

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
              ) : (
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
              )}
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
                onClick={() => {
                  setIsAddModalOpen(false);
                  setIsEditModalOpen(false);
                }}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm shadow-indigo-200 disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Saving...' : isAddModalOpen ? 'Save Order to Sheet' : 'Update Order in Sheet'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* =========================================================================
          VIEW FULL DETAILS MODAL (Read-Only Summary of all 37 Fields)
      ========================================================================= */}
      <Modal
        isOpen={isViewModalOpen}
        onClose={() => setIsViewModalOpen(false)}
        title={`Delivery Order Details: ${selectedOrder?.doNumber}`}
        maxWidth="max-w-4xl"
      >
        {selectedOrder && (
          <div className="space-y-6 text-sm text-slate-700">
            {/* Section 1 */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg mb-3">
                1. Order & PO Identification
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div><span className="text-slate-400">DO Number:</span> <strong className="font-mono text-indigo-600 block text-sm">{selectedOrder.doNumber}</strong></div>
                <div><span className="text-slate-400">Party PO No:</span> <strong className="text-slate-800 block text-sm">{selectedOrder.partyPoNo || '—'}</strong></div>
                <div><span className="text-slate-400">Party PO Date:</span> <strong className="text-slate-800 block">{api.formatDate(selectedOrder.partyPoDate) || '—'}</strong></div>
                <div><span className="text-slate-400">Reference No:</span> <strong className="text-slate-800 block">{selectedOrder.referenceNo || '—'}</strong></div>
                <div><span className="text-slate-400">Firm Name:</span> <strong className="text-slate-800 block">{selectedOrder.firmName || '—'}</strong></div>
                <div><span className="text-slate-400">Sales Person:</span> <strong className="text-slate-800 block">{selectedOrder.salesPersonName || '—'}</strong></div>
              </div>
            </div>

            {/* Section 2 */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg mb-3">
                2. Customer / Party Information
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div className="sm:col-span-2"><span className="text-slate-400">Party Name:</span> <strong className="text-slate-800 block text-sm">{selectedOrder.partyNames}</strong></div>
                <div><span className="text-slate-400">Category:</span> <strong className="text-slate-800 block">{selectedOrder.customerCategory || '—'}</strong></div>
                <div><span className="text-slate-400">Contact Person:</span> <strong className="text-slate-800 block">{selectedOrder.contactPersonName || '—'}</strong></div>
                <div><span className="text-slate-400">WhatsApp No:</span> <strong className="text-slate-800 block">{selectedOrder.contactPersonWhatsapp || '—'}</strong></div>
                <div><span className="text-slate-400">GST Number:</span> <strong className="text-slate-800 font-mono block">{selectedOrder.gstNumber || '—'}</strong></div>
                <div><span className="text-slate-400">Order Received From:</span> <strong className="text-slate-800 block">{selectedOrder.orderReceivedFrom || '—'}</strong></div>
                <div><span className="text-slate-400">Through Agent:</span> <strong className="text-slate-800 block">{selectedOrder.isThroughAgent || 'No'}</strong></div>
                <div className="sm:col-span-3"><span className="text-slate-400">Delivery Address:</span> <span className="text-slate-800 block">{selectedOrder.address || '—'}</span></div>
              </div>
            </div>

            {/* Section 3 */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg mb-3">
                3. Product & Specifications
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="sm:col-span-2"><span className="text-slate-400">Product:</span> <strong className="text-slate-800 block text-sm">{selectedOrder.productName}</strong></div>
                <div><span className="text-slate-400">Quantity:</span> <strong className="text-slate-800 block">{selectedOrder.quantity} {selectedOrder.typeOfMeasurement || 'MT'}</strong></div>
                <div><span className="text-slate-400">Rate of Material:</span> <strong className="text-slate-800 block">₹{selectedOrder.rateOfMaterial}</strong></div>
                <div><span className="text-slate-400">Alumina%:</span> <strong className="text-slate-800 block">{selectedOrder.aluminaPct || '—'}</strong></div>
                <div><span className="text-slate-400">Iron%:</span> <strong className="text-slate-800 block">{selectedOrder.ironPct || '—'}</strong></div>
                <div><span className="text-slate-400">Application:</span> <strong className="text-slate-800 block">{selectedOrder.typeOfApplication || '—'}</strong></div>
                <div><span className="text-slate-400">TC Required:</span> <strong className="text-slate-800 block">{selectedOrder.tcRequired || 'No'}</strong></div>
                <div><span className="text-slate-400">Free Replacement (FOC):</span> <strong className="text-slate-800 block">{selectedOrder.freeReplacementFoc || 'No'}</strong></div>
                <div><span className="text-slate-400">Total PO Basic Value:</span> <strong className="text-slate-800 block">₹{Number(selectedOrder.totalPoBasicValue || 0).toLocaleString('en-IN')}</strong></div>
              </div>
            </div>

            {/* Section 4 */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg mb-3">
                4. Commercial & Payment Terms
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div><span className="text-slate-400">Total PO Value:</span> <strong className="text-indigo-900 block text-base font-bold">₹{Number(selectedOrder.totalPoValue || 0).toLocaleString('en-IN')}</strong></div>
                <div><span className="text-slate-400">Type Of PI:</span> <strong className="text-slate-800 block">{selectedOrder.typeOfPi || '—'}</strong></div>
                <div><span className="text-slate-400">Payment to Be Taken:</span> <strong className="text-slate-800 block">{selectedOrder.paymentToBeTaken || '—'}</strong></div>
                <div><span className="text-slate-400">Advance:</span> <strong className="text-emerald-700 block">₹{Number(selectedOrder.advance || 0).toLocaleString('en-IN')}</strong></div>
                <div><span className="text-slate-400">Basic:</span> <strong className="text-slate-800 block">₹{Number(selectedOrder.basic || 0).toLocaleString('en-IN')}</strong></div>
                <div><span className="text-slate-400">Adjusted Amount:</span> <strong className="text-slate-800 block">₹{Number(selectedOrder.adjustedAmount || 0).toLocaleString('en-IN')}</strong></div>
                <div><span className="text-slate-400">Lead Time for Final Payment:</span> <strong className="text-slate-800 block">{selectedOrder.leadTimeFinalPayment || '—'}</strong></div>
                <div><span className="text-slate-400">Retention:</span> <strong className="text-slate-800 block">{selectedOrder.retentionPayment || 'No'} ({selectedOrder.retentionPercentage || '0%'})</strong></div>
                <div><span className="text-slate-400">Lead Time for Retention:</span> <strong className="text-slate-800 block">{selectedOrder.leadTimeRetention || '—'}</strong></div>
              </div>
            </div>

            {/* Section 5 */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg mb-3">
                5. Logistics & Special Notes
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div><span className="text-slate-400">Transporting:</span> <strong className="text-slate-800 block">{selectedOrder.typeOfTransporting || '—'}</strong></div>
                <div>
                  <span className="text-slate-400">SO Document:</span> 
                  {selectedOrder.uploadSo ? (
                    <a href={selectedOrder.uploadSo} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline flex items-center gap-1 mt-0.5">
                      <span>View Attached SO</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <span className="text-slate-400 block">No SO uploaded</span>
                  )}
                </div>
                <div className="sm:col-span-2"><span className="text-slate-400">Specific Concern:</span> <p className="text-slate-700 bg-slate-50 p-2 rounded mt-0.5">{selectedOrder.specificConcern || 'None'}</p></div>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsViewModalOpen(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* =========================================================================
          DELETE CONFIRMATION MODAL
      ========================================================================= */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Delete Delivery Order"
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 text-rose-600">
            <div className="p-2.5 rounded-full bg-rose-50">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-semibold text-slate-800">Are you sure?</h4>
              <p className="text-xs text-slate-500">
                This action will delete delivery order <strong className="font-mono text-rose-600">{selectedOrder?.doNumber}</strong> from Google Sheets.
              </p>
            </div>
          </div>

          <div className="bg-slate-50 p-3 rounded-lg text-xs space-y-1 text-slate-600">
            <p><strong>Party:</strong> {selectedOrder?.partyNames}</p>
            <p><strong>Product:</strong> {selectedOrder?.productName}</p>
            <p><strong>Total Value:</strong> ₹{Number(selectedOrder?.totalPoValue || 0).toLocaleString('en-IN')}</p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsDeleteModalOpen(false)}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={handleDeleteConfirm}
              className="px-4 py-2 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Deleting...' : 'Yes, Delete Order'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
