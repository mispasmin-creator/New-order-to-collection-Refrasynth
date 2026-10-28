import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import StageDateCell from '../components/common/StageDateCell';
import Modal from '../components/common/Modal';
import ExportButton from '../components/common/ExportButton';
import {
  Search,
  Filter,
  RefreshCw,
  Eye,
  Package,
  IndianRupee,
  AlertCircle,
  CheckCircle2,
  Building2,
  FileText,
  Layers,
  ExternalLink,
  ClipboardCheck,
} from 'lucide-react';
import usePagination from '../hooks/usePagination';
import Pagination from '../components/common/Pagination';

export default function CheckPOPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [successNotice, setSuccessNotice] = useState('');

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');

  // Modals state — View only; raw record edits happen directly in the Google Sheet.
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isCheckModalOpen, setIsCheckModalOpen] = useState(false);

  const [viewGroup, setViewGroup] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // Check PO modal state — checkGroup holds every DO the "Check PO" decision applies to
  // (more than one when several products were submitted under the same PO)
  const [checkGroup, setCheckGroup] = useState([]);
  const [checkForm, setCheckForm] = useState({ status: '', expectedDeliveryDate: '', remark: '' });
  const [statusFilter, setStatusFilter] = useState('Pending'); // 'Pending' | 'History'

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
  }, []);

  const notifySuccess = (msg) => {
    setSuccessNotice(msg);
    setTimeout(() => setSuccessNotice(''), 4000);
  };

  // Filtered orders list
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesCategory =
        categoryFilter === 'All' ||
        (order.customerCategory && order.customerCategory === categoryFilter);

      const matchesStatus =
        statusFilter === 'History'
          ? Boolean(order.status1)
          : !order.status1;

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

  // Group multi-product submissions (same Party PO No + Date + Party Name) into a
  // single row so one PO with several products reads — and gets checked — as one order
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

  const pg = usePagination(groupedOrders, `${statusFilter}|${searchQuery}|${categoryFilter}`);

  const buildExportRows = () => filteredOrders.map((o) => ({
    'Timestamp': api.formatDate(o.timestamp),
    'DO-Delivery Order No.': o.doNumber,
    'Party PO No': o.partyPoNo,
    'Party PO Date': api.formatDate(o.partyPoDate),
    'Party Names': o.partyNames,
    'Product Name': o.productName,
    'Quantity': o.quantity,
    'Total PO Value': o.totalPoValue,
    'Status': o.status1 || 'Pending',
    'Remark': o.remark1,
  }));

  // Open View Modal — accepts a single order or a group of orders sharing one PO
  const handleOpenView = (orderOrGroup) => {
    setViewGroup(Array.isArray(orderOrGroup) ? orderOrGroup : [orderOrGroup]);
    setIsViewModalOpen(true);
  };

  // Open Check PO Modal — accepts a single order or a group; the decision applies to every DO in it
  const handleOpenCheck = (orderOrGroup) => {
    const rows = Array.isArray(orderOrGroup) ? orderOrGroup : [orderOrGroup];
    setCheckGroup(rows);
    const primary = rows[0];
    setCheckForm({
      status: primary.status1 || '',
      expectedDeliveryDate: primary.expectedDeliveryDate || '',
      remark: primary.remark1 || '',
    });
    setIsCheckModalOpen(true);
  };

  // Confirm Check PO & Save to FMS Sheet — applies to every DO in checkGroup at once
  const handleConfirmCheck = async () => {
    if (!checkForm.status || checkGroup.length === 0) return;
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

      const results = await Promise.all(
        checkGroup.map((o) => api.updateOrderFields(o.rowIndex, updatePayload, o.doNumber))
      );
      const failed = results.find((r) => !r || !r.success);

      if (!failed) {
        const doNumbers = checkGroup.map((o) => o.doNumber);
        notifySuccess(
          doNumbers.length > 1
            ? `${doNumbers.length} orders (${doNumbers.join(', ')}) marked ${checkForm.status} and moved to Received Accounts!`
            : `Order ${doNumbers[0]} marked ${checkForm.status} and moved to Received Accounts!`
        );
        setOrders((prev) =>
          prev.map((o) =>
            doNumbers.includes(o.doNumber)
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
        alert(failed.error || 'Failed to update Google Sheets');
      }
    } catch (err) {
      alert(err.message || 'Error updating order');
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
    <div className="h-full flex flex-col space-y-6">
      {/* Sticky Page Header + KPI + Alerts + Filters (stays fixed while table scrolls) */}
      <div className="shrink-0 space-y-6">
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
            <ExportButton getRows={buildExportRows} filename="Check PO" />
            <button
              type="button"
              onClick={() => fetchOrders(true)}
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
              Pending ({orders.filter((o) => !o.status1).length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('History')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                statusFilter === 'History'
                  ? 'bg-white text-slate-800 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              History ({orders.filter((o) => Boolean(o.status1)).length})
            </button>
          </div>
        </div>
      </div>

      {/* Check PO Table with Sticky Actions and 37 Sticky Columns */}
      <div className="flex-1 min-h-0 bg-white rounded-xl border border-slate-200 shadow-2xs flex flex-col">
        <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto border-t border-slate-200">
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
                <th className="px-3.5 py-3 whitespace-nowrap text-right">Total PO Value</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Status</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Planned Date</th>
                {statusFilter === 'History' && <th className="px-3.5 py-3 whitespace-nowrap">Actual Date</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={10 + (statusFilter === 'History' ? 1 : 0)} className="py-20 text-center text-slate-400">
                    <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                    <p className="text-xs font-medium text-slate-500">Loading orders from Google Sheets...</p>
                  </td>
                </tr>
              ) : groupedOrders.length === 0 ? (
                <tr>
                  <td colSpan={10 + (statusFilter === 'History' ? 1 : 0)} className="py-16 text-center text-slate-400">
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
                pg.pageItems.map((group) => {
                  const orderRows = group.orders;
                  const order = orderRows[0];
                  const isGroup = orderRows.length > 1;
                  const doNumbers = orderRows.map((o) => o.doNumber).filter(Boolean).join(', ');
                  const productNames = orderRows.map((o) => o.productName).filter(Boolean);
                  const sameMeasurement = orderRows.every((o) => o.typeOfMeasurement === order.typeOfMeasurement);
                  const totalQuantity = orderRows.reduce((sum, o) => sum + (Number(o.quantity) || 0), 0);
                  const totalPoValueSum = orderRows.reduce((sum, o) => sum + (Number(o.totalPoValue) || 0), 0);

                  return (
                    <tr key={group.key} className="hover:bg-slate-50/80 transition-colors">
                      {/* Sticky Actions */}
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
                            onClick={() => handleOpenCheck(orderRows)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-[11px] font-semibold rounded-lg shadow-sm hover:shadow-md transition-all duration-150"
                            title={isGroup ? `Check PO — Approve / Reject all ${orderRows.length} products` : 'Check PO — Approve / Reject'}
                          >
                            <ClipboardCheck className="w-3.5 h-3.5" />
                            Check PO
                          </button>
                        </div>
                      </td>

                      {/* Timestamp */}
                      <td className="px-3.5 py-3 whitespace-nowrap text-slate-500 text-[11px] font-mono">
                        {api.formatDate(order.timestamp) || '—'}
                      </td>

                      {/* DO-Delivery Order No. */}
                      <td className="px-3.5 py-3 font-mono font-bold text-indigo-600 whitespace-nowrap" title={isGroup ? doNumbers : undefined}>
                        {isGroup ? `${order.doNumber} +${orderRows.length - 1}` : (order.doNumber || '—')}
                      </td>

                      {/* PARTY PO NO */}
                      <td className="px-3.5 py-3 font-semibold text-slate-800 whitespace-nowrap">
                        {order.partyPoNo || '—'}
                      </td>

                      {/* Party PO Date */}
                      <td className="px-3.5 py-3 whitespace-nowrap text-slate-600">
                        {api.formatDate(order.partyPoDate) || '—'}
                      </td>

                      {/* Party Names */}
                      <td className="px-3.5 py-3 font-semibold text-slate-800 whitespace-nowrap">
                        {order.partyNames || '—'}
                      </td>

                      {/* Product Name */}
                      <td className="px-3.5 py-3 text-slate-800 whitespace-nowrap" title={isGroup ? productNames.join(', ') : undefined}>
                        {isGroup ? `${orderRows.length} products` : (order.productName || '—')}
                      </td>

                      {/* Quantity */}
                      <td className="px-3.5 py-3 text-right font-medium text-slate-800 whitespace-nowrap">
                        {totalQuantity ? `${totalQuantity.toLocaleString('en-IN')}${isGroup && sameMeasurement && order.typeOfMeasurement ? ` ${order.typeOfMeasurement}` : ''}` : '—'}
                      </td>

                      {/* Total PO Value */}
                      <td className="px-3.5 py-3 text-right font-bold text-slate-900 whitespace-nowrap">
                        {totalPoValueSum ? `₹${totalPoValueSum.toLocaleString('en-IN')}` : '—'}
                      </td>

                      {/* Status */}
                      <td className="px-3.5 py-3 whitespace-nowrap text-center">
                        {order.status1 ? (
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                              order.status1 === 'Approved' || order.status1 === 'Yes'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : order.status1 === 'Rejected'
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : 'bg-slate-50 text-slate-600 border border-slate-200'
                            }`}
                          >
                            {order.status1}
                          </span>
                        ) : (
                          <span className="text-amber-600 font-medium text-[11px]">Pending</span>
                        )}
                      </td>
                      <StageDateCell tab={statusFilter} planned={orderRows.map((o) => o.planned1)} actual={orderRows.map((o) => o.actual1)} />
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination {...pg} />

        <div className="bg-slate-50/80 px-5 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>
            Showing {groupedOrders.length} order{groupedOrders.length === 1 ? '' : 's'}
            {filteredOrders.length !== groupedOrders.length ? ` (${filteredOrders.length} product line items)` : ''}
          </span>
          <span>Google Sheet: <strong>FMS</strong> Tab (37 Columns starting from Row 7)</span>
        </div>
      </div>

      {/* =========================================================================
          VIEW ORDER MODAL (All 37 Fields Displayed)
      ========================================================================= */}
      {isViewModalOpen && viewGroup.length > 0 && (() => {
        const primary = viewGroup[0];
        const isGroup = viewGroup.length > 1;
        const totalPoValueSum = viewGroup.reduce((sum, o) => sum + (Number(o.totalPoValue) || 0), 0);
        const totalPoBasicSum = viewGroup.reduce((sum, o) => sum + (Number(o.totalPoBasicValue) || 0), 0);

        return (
        <Modal
          isOpen={isViewModalOpen}
          onClose={() => setIsViewModalOpen(false)}
          title={`Purchase Order Details: ${primary.doNumber}${isGroup ? ` + ${viewGroup.length - 1} more` : ''}`}
          maxWidth="max-w-4xl"
        >
          <div className="space-y-6 text-sm">
            {/* Header info badge */}
            <div className="bg-gradient-to-r from-indigo-50 to-blue-50 p-4 rounded-xl border border-indigo-100 flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-500">
                  DO Number{isGroup ? 's' : ''}
                </span>
                <h3 className="text-xl font-extrabold text-indigo-900 font-mono">
                  {viewGroup.map((o) => o.doNumber).join(', ')}
                </h3>
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Party PO No & Date
                </span>
                <div className="font-semibold text-slate-800">
                  {primary.partyPoNo} ({primary.partyPoDate || 'N/A'})
                </div>
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Total PO Value{isGroup ? ' (All Products)' : ''}
                </span>
                <div className="text-lg font-black text-slate-900">
                  ₹{(totalPoValueSum || totalPoBasicSum).toLocaleString('en-IN')}
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
                  <div><strong className="text-slate-500">Party Name:</strong> <span className="font-semibold text-slate-800">{primary.partyNames}</span></div>
                  <div><strong className="text-slate-500">Customer Category:</strong> {primary.customerCategory || '—'}</div>
                  <div><strong className="text-slate-500">GST Number:</strong> <span className="font-mono">{primary.gstNumber || '—'}</span></div>
                  <div><strong className="text-slate-500">Contact Person:</strong> {primary.contactPersonName || '—'} ({primary.contactPersonWhatsapp || '—'})</div>
                  <div><strong className="text-slate-500">Delivery Address:</strong> {primary.address || '—'}</div>
                  <div><strong className="text-slate-500">Transporting Mode:</strong> {primary.typeOfTransporting || '—'}</div>
                  <div><strong className="text-slate-500">Firm Name:</strong> {primary.firmName || '—'}</div>
                  <div><strong className="text-slate-500">Marketing Sales Person:</strong> {primary.salesPersonName || '—'}</div>
                </div>
              </div>

              {/* Box 2: Product & Technical — one card per product when grouped */}
              <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-700 pb-1 border-b border-slate-200 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" />
                  <span>Product{isGroup ? `s (${viewGroup.length})` : ''} & Specifications</span>
                </h4>
                <div className="space-y-3">
                  {viewGroup.map((p, idx) => (
                    <div key={p.rowIndex ?? idx} className={isGroup ? 'pb-2 border-b border-slate-200 last:border-b-0 last:pb-0' : ''}>
                      {isGroup && (
                        <div className="font-mono font-bold text-indigo-600 text-[11px] mb-1">{p.doNumber}</div>
                      )}
                      <div className="space-y-1.5 text-xs">
                        <div><strong className="text-slate-500">Product Name:</strong> <span className="font-semibold text-slate-800">{p.productName}</span></div>
                        <div><strong className="text-slate-500">Quantity:</strong> {p.quantity} {p.typeOfMeasurement}</div>
                        <div><strong className="text-slate-500">Rate of Material:</strong> ₹{p.rateOfMaterial} per {p.typeOfMeasurement}</div>
                        <div><strong className="text-slate-500">Total PO Basic:</strong> ₹{Number(p.totalPoBasicValue || 0).toLocaleString('en-IN')}</div>
                        <div><strong className="text-slate-500">Alumina%:</strong> {p.aluminaPct || '—'} | <strong className="text-slate-500">Iron%:</strong> {p.ironPct || '—'}</div>
                        <div><strong className="text-slate-500">Application:</strong> {p.typeOfApplication || '—'}</div>
                      </div>
                    </div>
                  ))}
                  <div className="space-y-1.5 text-xs pt-1">
                    <div><strong className="text-slate-500">TC Required:</strong> {primary.tcRequired || '—'}</div>
                    <div><strong className="text-slate-500">Free Replacement (FOC):</strong> {primary.freeReplacementFoc || '—'}</div>
                  </div>
                </div>
              </div>

              {/* Box 3: Commercial & Payment Terms */}
              <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-700 pb-1 border-b border-slate-200 flex items-center gap-1.5">
                  <IndianRupee className="w-3.5 h-3.5" />
                  <span>Commercial & Payment</span>
                </h4>
                <div className="space-y-1.5 text-xs">
                  <div><strong className="text-slate-500">Type of PI:</strong> {primary.typeOfPi || '—'}</div>
                  <div><strong className="text-slate-500">Payment to be Taken:</strong> {primary.paymentToBeTaken || '—'}</div>
                  <div><strong className="text-slate-500">Advance Amount:</strong> ₹{Number(primary.advance || 0).toLocaleString('en-IN')}</div>
                  <div><strong className="text-slate-500">Basic Value{isGroup ? ' (Sum)' : ''}:</strong> ₹{totalPoBasicSum.toLocaleString('en-IN')}</div>
                  <div><strong className="text-slate-500">Adjusted Amount:</strong> ₹{Number(primary.adjustedAmount || 0).toLocaleString('en-IN')}</div>
                  <div><strong className="text-slate-500">Lead Time Final Payment:</strong> {primary.leadTimeFinalPayment || '—'}</div>
                  <div><strong className="text-slate-500">Retention Payment:</strong> {primary.retentionPayment || 'No'} ({primary.retentionPercentage || '0%'} - {primary.leadTimeRetention || 'N/A'})</div>
                </div>
              </div>

              {/* Box 4: Reference & Extra */}
              <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-700 pb-1 border-b border-slate-200 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  <span>Order Origin & Notes</span>
                </h4>
                <div className="space-y-1.5 text-xs">
                  <div><strong className="text-slate-500">Order Received From:</strong> {primary.orderReceivedFrom || '—'}</div>
                  <div><strong className="text-slate-500">Through Agent:</strong> {primary.isThroughAgent || 'No'}</div>
                  <div><strong className="text-slate-500">Reference No.:</strong> {primary.referenceNo || '—'}</div>
                  <div>
                    <strong className="text-slate-500">Sales Order Document (SO):</strong>{' '}
                    {primary.uploadSo ? (
                      primary.uploadSo.startsWith('http') ? (
                        <a
                          href={primary.uploadSo}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:underline inline-flex items-center gap-1"
                        >
                          <span>Open Document</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span>{primary.uploadSo}</span>
                      )
                    ) : (
                      '—'
                    )}
                  </div>
                  <div><strong className="text-slate-500">Specific Concern:</strong> {primary.specificConcern || '—'}</div>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-200 gap-2">
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

      {/* =========================================================================
          CHECK PO MODAL — Approve / Reject + Expected Delivery Date
      ========================================================================= */}
      {isCheckModalOpen && checkGroup.length > 0 && (() => {
        const checkPrimary = checkGroup[0];
        const checkIsGroup = checkGroup.length > 1;
        const checkTotalPoValueSum = checkGroup.reduce((sum, o) => sum + (Number(o.totalPoValue) || 0), 0);

        return (
        <Modal
          isOpen={isCheckModalOpen}
          onClose={() => setIsCheckModalOpen(false)}
          title={`Check PO — ${checkPrimary.doNumber || 'Order Details'}${checkIsGroup ? ` + ${checkGroup.length - 1} more` : ''}`}
          maxWidth="max-w-3xl"
        >
          <div className="space-y-5">

            {checkIsGroup && (
              <div className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-700 font-medium">
                <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
                This decision will apply to all {checkGroup.length} products from this PO: {checkGroup.map((o) => o.doNumber).join(', ')}
              </div>
            )}

            {/* ── Order Summary ───────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 bg-slate-50 rounded-xl p-4 border border-slate-200 text-xs">
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">DO Number{checkIsGroup ? 's' : ''}</p>
                <p className="font-bold text-indigo-600 font-mono text-sm">{checkGroup.map((o) => o.doNumber).join(', ') || '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Party PO No.</p>
                <p className="font-semibold text-slate-800">{checkPrimary.partyPoNo || '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Party PO Date</p>
                <p className="text-slate-700">{api.formatDate(checkPrimary.partyPoDate) || '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Party Name</p>
                <p className="font-semibold text-slate-800">{checkPrimary.partyNames || '—'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-1">
                  Product{checkIsGroup ? `s (${checkGroup.length})` : ''}
                </p>
                <div className="space-y-1.5">
                  {checkGroup.map((o, idx) => (
                    <p key={o.rowIndex ?? idx} className="text-slate-700">
                      {checkIsGroup && <span className="font-mono font-bold text-indigo-600 mr-1.5">{o.doNumber}</span>}
                      {o.productName || '—'} — {o.quantity ? Number(o.quantity).toLocaleString('en-IN') : '—'} {o.typeOfMeasurement}
                      {' @ '}{o.rateOfMaterial ? `₹${Number(o.rateOfMaterial).toLocaleString('en-IN')}` : '—'}
                      {' = '}
                      <strong>{o.totalPoBasicValue ? `₹${Number(o.totalPoBasicValue).toLocaleString('en-IN')}` : '—'}</strong>
                    </p>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Total PO Value{checkIsGroup ? ' (All Products)' : ''}</p>
                <p className="font-bold text-emerald-700">{checkTotalPoValueSum ? `₹${checkTotalPoValueSum.toLocaleString('en-IN')}` : '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Sales Person</p>
                <p className="text-slate-700">{checkPrimary.salesPersonName || '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Type Of Transporting</p>
                <p className="text-slate-700">{checkPrimary.typeOfTransporting || '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Payment To Be Taken</p>
                <p className="text-slate-700">{checkPrimary.paymentToBeTaken || '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Advance</p>
                <p className="text-slate-700">{checkPrimary.advance ? `₹${Number(checkPrimary.advance).toLocaleString('en-IN')}` : '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">TC Required</p>
                <p className="text-slate-700">{checkPrimary.tcRequired || '—'}</p>
              </div>
              {checkPrimary.specificConcern && (
                <div className="col-span-2">
                  <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Specific Concern</p>
                  <p className="text-slate-700">{checkPrimary.specificConcern}</p>
                </div>
              )}
              <div className="col-span-2">
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Timestamp</p>
                <p className="text-slate-500 font-mono text-[11px]">{api.formatDate(checkPrimary.timestamp) || '—'}</p>
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
        );
      })()}

    </div>
  );
}
