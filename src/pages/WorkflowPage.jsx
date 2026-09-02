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
  Calendar,
} from 'lucide-react';

const palette = {
  blue:    { btn: 'bg-blue-600 hover:bg-blue-700'   },
  violet:  { btn: 'bg-violet-600 hover:bg-violet-700' },
  amber:   { btn: 'bg-amber-500 hover:bg-amber-600'   },
  indigo:  { btn: 'bg-indigo-600 hover:bg-indigo-700' },
  teal:    { btn: 'bg-teal-600 hover:bg-teal-700'     },
  emerald: { btn: 'bg-emerald-600 hover:bg-emerald-700' },
  rose:    { btn: 'bg-rose-600 hover:bg-rose-700'     },
};

const TABLE_COLS = [
  { label: 'Timestamp',            key: 'timestamp',        mono: true,  dim: true  },
  { label: 'DO No.',               key: 'doNumber',         mono: true,  bold: true, color: 'indigo' },
  { label: 'Party PO No.',         key: 'partyPoNo',        bold: true  },
  { label: 'Party PO Date',        key: 'partyPoDate'      },
  { label: 'Party Names',          key: 'partyNames',       bold: true  },
  { label: 'Product Name',         key: 'productName'      },
  { label: 'Quantity',             key: 'quantity',         right: true, num: true   },
  { label: 'Rate',                 key: 'rateOfMaterial',   right: true, currency: true },
  { label: 'Total PO Value',       key: 'totalPoValue',     right: true, currency: true, bold: true },
  { label: 'Sales Person',         key: 'salesPersonName'  },
  { label: 'Type Of Transporting', key: 'typeOfTransporting' },
  { label: 'Payment To Be Taken',  key: 'paymentToBeTaken' },
  { label: 'TC Required',          key: 'tcRequired'       },
  { label: 'Upload SO',            key: 'uploadSo',         link: true  },
];

export default function WorkflowPage({
  pageTitle,
  pageIcon,
  actionLabel,
  actionColor = 'indigo',
  modalFields = [],
  filterPredicate,
  stageKey,
}) {
  const [orders, setOrders]             = useState([]);
  const [loading, setLoading]           = useState(true);
  const [syncing, setSyncing]           = useState(false);
  const [error, setError]               = useState('');
  const [successNotice, setSuccessNotice] = useState('');
  const [searchQuery, setSearchQuery]   = useState('');
  const [isModalOpen, setIsModalOpen]   = useState(false);
  const [activeOrder, setActiveOrder]   = useState(null);
  const [modalForm, setModalForm]       = useState({});
  const [decision, setDecision]         = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [saving, setSaving]             = useState(false);
  const [masterData, setMasterData]     = useState({});

  const clr = palette[actionColor] || palette.indigo;

  const fetchOrders = async (showSync = false) => {
    if (showSync) setSyncing(true); else setLoading(true);
    setError('');
    try {
      const res = await api.getOrders();
      if (res && res.success && Array.isArray(res.data)) setOrders(res.data);
      else setError(res?.error || 'Could not fetch orders.');
    } catch (err) { setError(err.message || 'Error fetching orders.'); }
    finally { setLoading(false); setSyncing(false); }
  };

  useEffect(() => {
    fetchOrders();
    api.getMasterData().then((res) => {
      if (res && res.success && res.data) {
        setMasterData(res.data);
      }
    }).catch((err) => console.warn('Could not load Master data:', err));
  }, []);

  const notifySuccess = (msg) => { setSuccessNotice(msg); setTimeout(() => setSuccessNotice(''), 4500); };

  const getMasterOptions = (aliases = [], defaultFallback = []) => {
    if (!masterData || typeof masterData !== 'object') return defaultFallback;
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
    return defaultFallback;
  };

  const filteredOrders = useMemo(() => {
    let list = orders;
    if (filterPredicate) {
      list = list.filter(filterPredicate);
    }
    const q = searchQuery.toLowerCase();
    if (!q) return list;
    return list.filter((o) =>
      [o.doNumber, o.partyPoNo, o.partyNames, o.productName, o.salesPersonName]
        .some((v) => v && v.toLowerCase().includes(q))
    );
  }, [orders, searchQuery, filterPredicate]);

  const handleOpenModal = (order) => {
    setActiveOrder(order); setDecision(''); setExpectedDate('');
    const init = {}; modalFields.forEach((f) => { init[f.key] = ''; }); setModalForm(init);
    setIsModalOpen(true);
  };

  const handleConfirm = async () => {
    const parts = [`Order ${activeOrder.doNumber} - ${actionLabel}`, decision];
    if (expectedDate) parts.push(`Expected: ${expectedDate}`);
    modalFields.forEach((f) => { if (modalForm[f.key]) parts.push(`${f.label}: ${modalForm[f.key]}`); });

    if (stageKey) {
      setSaving(true);
      try {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const istTime = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
        const payload = {
          [`Actual ${stageKey}`]: istTime,
          [`Status ${stageKey}`]: decision,
        };
        const remarkVal = modalForm.accountNote || modalForm.deliveryRemark || modalForm.logisticsNote || modalForm.approvalNote || modalForm.dispatchNote || modalForm.accountsNote || modalForm.remark || '';
        if (remarkVal) {
          payload[`Remark ${stageKey}`] = remarkVal;
        }
        await api.updateOrderFields(activeOrder.rowIndex, payload, activeOrder.doNumber);
      } catch (e) {
        console.warn('Could not update stage in sheet:', e);
      } finally {
        setSaving(false);
      }
    }

    notifySuccess(parts.join(' | '));
    setIsModalOpen(false);
  };

  const cellClass = (col) => {
    let c = 'px-3.5 py-3 whitespace-nowrap ';
    if (col.right) c += 'text-right ';
    if (col.bold)  c += 'font-semibold ';
    if (col.mono)  c += 'font-mono ';
    if (col.dim)   c += 'text-slate-400 text-[11px] ';
    if (col.color === 'indigo') c += 'text-indigo-600 '; else c += 'text-slate-700 ';
    return c;
  };

  const cellValue = (order, col) => {
    const v = order[col.key];
    if (!v && v !== 0) return '—';
    if (col.date || col.key === 'timestamp' || col.key === 'partyPoDate') return api.formatDate(v);
    if (col.link && typeof v === 'string' && v.startsWith('http'))
      return (<a href={v} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-800 underline inline-flex items-center gap-1">Open SO <ExternalLink className="w-3 h-3" /></a>);
    if (col.currency) return `₹${Number(v).toLocaleString('en-IN')}`;
    if (col.num)      return Number(v).toLocaleString('en-IN');
    return v;
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${clr.btn} text-white shadow-sm`}>{pageIcon}</div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">{pageTitle}</h1>
            <p className="text-xs text-slate-500">{filteredOrders.length} orders - synced from Google Sheets</p>
          </div>
        </div>
        <button onClick={() => fetchOrders(true)} disabled={syncing}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-xs disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing...' : 'Refresh'}
        </button>
      </div>

      {successNotice && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> {successNotice}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
        <input type="text" placeholder="Search orders..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-270px)] border-t border-slate-200">
          <table className="w-full text-left text-xs text-slate-600 border-collapse">
            <thead className="sticky top-0 bg-slate-100 z-20 shadow-xs border-b border-slate-300 font-semibold text-slate-700 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="sticky left-0 bg-slate-100 z-30 px-3.5 py-3 text-center whitespace-nowrap border-r border-slate-200 shadow-xs">Action</th>
                {TABLE_COLS.map((col) => (
                  <th key={col.key} className={`px-3.5 py-3 whitespace-nowrap${col.right ? ' text-right' : ''}`}>{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading ? (
                <tr><td colSpan={TABLE_COLS.length + 1} className="py-20 text-center text-slate-400">
                  <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-xs font-medium text-slate-500">Loading orders from Google Sheets...</p>
                </td></tr>
              ) : filteredOrders.length === 0 ? (
                <tr><td colSpan={TABLE_COLS.length + 1} className="py-16 text-center text-slate-400">
                  <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <h3 className="text-sm font-semibold text-slate-700">No orders found</h3>
                  <p className="text-xs text-slate-400 mt-1">{searchQuery ? 'Try adjusting your search.' : 'Orders created in the Orders page will appear here.'}</p>
                </td></tr>
              ) : filteredOrders.map((order, idx) => (
                <tr key={order.doNumber || idx} className="hover:bg-slate-50/80 transition-colors">
                  <td className="sticky left-0 bg-white z-10 px-3 py-2 text-center whitespace-nowrap border-r border-slate-200 shadow-xs">
                    <button type="button" onClick={() => handleOpenModal(order)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-white text-[11px] font-semibold rounded-lg shadow-sm hover:shadow-md transition-all ${clr.btn}`}>
                      {pageIcon && React.cloneElement(pageIcon, { className: 'w-3.5 h-3.5' })}
                      {actionLabel}
                    </button>
                  </td>
                  {TABLE_COLS.map((col) => (
                    <td key={col.key} className={cellClass(col)}>{cellValue(order, col)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && activeOrder && (
        <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}
          title={`${actionLabel} - ${activeOrder.doNumber || 'Order'}`} maxWidth="max-w-2xl">
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 bg-slate-50 rounded-xl p-4 border border-slate-200 text-xs">
              {[
                { label: 'DO Number',         value: activeOrder.doNumber,          extraCls: 'font-bold text-indigo-600 font-mono text-sm' },
                { label: 'Party PO No.',      value: activeOrder.partyPoNo,         extraCls: 'font-semibold' },
                { label: 'Party PO Date',     value: api.formatDate(activeOrder.partyPoDate) },
                { label: 'Party Name',        value: activeOrder.partyNames,        extraCls: 'font-semibold' },
                { label: 'Product Name',      value: activeOrder.productName        },
                { label: 'Quantity',          value: activeOrder.quantity ? Number(activeOrder.quantity).toLocaleString('en-IN') : null },
                { label: 'Rate Of Material',  value: activeOrder.rateOfMaterial ? `₹${Number(activeOrder.rateOfMaterial).toLocaleString('en-IN')}` : null },
                { label: 'Total PO Basic',    value: activeOrder.totalPoBasicValue ? `₹${Number(activeOrder.totalPoBasicValue).toLocaleString('en-IN')}` : null },
                { label: 'Total PO Value',    value: activeOrder.totalPoValue ? `₹${Number(activeOrder.totalPoValue).toLocaleString('en-IN')}` : null, extraCls: 'font-bold text-emerald-700' },
                { label: 'Sales Person',      value: activeOrder.salesPersonName    },
                { label: 'Transporting',      value: activeOrder.typeOfTransporting  },
                { label: 'Payment To Taken',  value: activeOrder.paymentToBeTaken   },
                { label: 'TC Required',       value: activeOrder.tcRequired         },
                { label: 'Timestamp',         value: api.formatDate(activeOrder.timestamp), extraCls: 'font-mono text-[11px] text-slate-400' },
              ].map(({ label, value, extraCls }) => (
                <div key={label}>
                  <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">{label}</p>
                  <p className={`text-slate-700 ${extraCls || ''}`}>{value || '-'}</p>
                </div>
              ))}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Expected Date</label>
              <input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>

            {modalFields.map((field) => (
              <div key={field.key}>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">{field.label}</label>
                {field.type === 'textarea' ? (
                  <textarea rows={3} value={modalForm[field.key] || ''} onChange={(e) => setModalForm((p) => ({ ...p, [field.key]: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                    placeholder={field.placeholder || ''} />
                ) : field.type === 'select' ? (
                  (() => {
                    const opts = field.masterAliases
                      ? getMasterOptions(field.masterAliases, field.options || [])
                      : (field.options || []);
                    return (
                      <select
                        value={modalForm[field.key] || ''}
                        onChange={(e) => setModalForm((p) => ({ ...p, [field.key]: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                      >
                        <option value="">Select...</option>
                        {opts.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    );
                  })()
                ) : (
                  <input type={field.type || 'text'} value={modalForm[field.key] || ''} onChange={(e) => setModalForm((p) => ({ ...p, [field.key]: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    placeholder={field.placeholder || ''} />
                )}
              </div>
            ))}

            <div>
              <p className="text-xs font-semibold text-slate-700 mb-2">Decision</p>
              <div className="flex gap-3">
                {['Approved','Rejected'].map((d) => (
                  <button key={d} type="button" onClick={() => setDecision(d)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                      decision === d
                        ? d === 'Approved' ? 'bg-emerald-600 border-emerald-600 text-white shadow-md' : 'bg-rose-600 border-rose-600 text-white shadow-md'
                        : d === 'Approved' ? 'bg-white border-slate-200 text-slate-600 hover:border-emerald-400 hover:text-emerald-600' : 'bg-white border-slate-200 text-slate-600 hover:border-rose-400 hover:text-rose-600'
                    }`}>
                    {d === 'Approved' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    {d}
                  </button>
                ))}
              </div>
              {decision && (
                <p className={`mt-2 text-xs font-medium text-center ${decision === 'Approved' ? 'text-emerald-600' : 'text-rose-600'}`}>
                  Selected: <strong>{decision}</strong>{expectedDate && ` | Expected: ${expectedDate}`}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button type="button" onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg">Close</button>
              <button type="button" disabled={!decision} onClick={handleConfirm}
                className={`px-5 py-2 text-xs font-semibold text-white rounded-lg shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${
                  decision === 'Rejected' ? 'bg-rose-600 hover:bg-rose-700' : clr.btn
                }`}>
                Confirm {decision || 'Decision'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
