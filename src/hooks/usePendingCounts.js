import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

// Groups Dispatch entries that share the same shipment/PO into a single batch —
// used only pre-Arrange-Logistics, where entries have no LGST number yet. This
// mirrors ArrangeLogisticsPage's own grouping of Dispatch entries.
function groupIntoShipmentBatches(entries) {
  const groups = [];
  const indexByKey = {};
  entries.forEach((entry) => {
    const key = [
      String(entry.partyPoNo ?? '').trim().toLowerCase(),
      String(entry.partyPoDate ?? '').trim(),
      String(entry.partyNames ?? '').trim().toLowerCase(),
      String(entry.typeOfTransporting ?? '').trim().toLowerCase(),
      String(entry.dateOfDispatch ?? '').trim(),
    ].join('|');
    if (indexByKey[key] === undefined) {
      indexByKey[key] = groups.length;
      groups.push([entry]);
    } else {
      groups[indexByKey[key]].push(entry);
    }
  });
  return groups;
}

// Groups Billing entries (post-Arrange-Logistics) strictly by LGST batch number —
// the real shipment boundary once one's been assigned, matching every downstream
// stage page. Two separate Arrange Logistics submissions must never re-merge here
// just because they happen to share the same PO/party/transport/date.
function groupByLgstNo(entries) {
  const groups = [];
  const indexByKey = {};
  entries.forEach((entry) => {
    const key = String(entry.lgstNo ?? '').trim().toLowerCase();
    if (indexByKey[key] === undefined) {
      indexByKey[key] = groups.length;
      groups.push([entry]);
    } else {
      groups[indexByKey[key]].push(entry);
    }
  });
  return groups;
}

// Groups Billing entries by Bill No. once one's been assigned (falling back to
// LGST No. otherwise) — the real shipment boundary from Make Invoice onward,
// since several LGST batches invoiced together under one bill travel on one
// bilty and are actioned together on every page from Sales Form 3 onward.
function groupByBillOrLgst(entries) {
  const groups = [];
  const indexByKey = {};
  entries.forEach((entry) => {
    const key = entry.billNo
      ? `bill:${String(entry.billNo).trim().toLowerCase()}`
      : `lgst:${String(entry.lgstNo ?? '').trim().toLowerCase()}`;
    if (indexByKey[key] === undefined) {
      indexByKey[key] = groups.length;
      groups.push([entry]);
    } else {
      groups[indexByKey[key]].push(entry);
    }
  });
  return groups;
}

// Refetch interval — the sidebar badges only need to be roughly fresh, and this
// backend has a real rate limit, so keep this well above "poll aggressively".
const REFRESH_MS = 120000;

export default function usePendingCounts() {
  const [counts, setCounts] = useState({});
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [ordersRes, dispatchRes, billingRes, orderCancelRes, materialReturnRes] = await Promise.all([
        api.getOrders(),
        api.getDispatchEntries(),
        api.getLogisticsEntries(),
        api.getOrderCancelEntries(),
        api.getMaterialReturnEntries(),
      ]);

      const orders = (ordersRes && ordersRes.success && Array.isArray(ordersRes.data)) ? ordersRes.data : [];
      const dispatchEntries = (dispatchRes && dispatchRes.success && Array.isArray(dispatchRes.data)) ? dispatchRes.data : [];
      const billingEntries = (billingRes && billingRes.success && Array.isArray(billingRes.data)) ? billingRes.data : [];
      const orderCancelEntries = (orderCancelRes && orderCancelRes.success && Array.isArray(orderCancelRes.data)) ? orderCancelRes.data : [];
      const materialReturnEntries = (materialReturnRes && materialReturnRes.success && Array.isArray(materialReturnRes.data)) ? materialReturnRes.data : [];

      const orderByDoNumber = {};
      orders.forEach((o) => {
        const key = (o.doNumber || '').trim().toLowerCase();
        if (key) orderByDoNumber[key] = o;
      });

      const dispatchByDNumber = {};
      dispatchEntries.forEach((e) => {
        const key = (e.dNumber || '').trim().toLowerCase();
        if (key) dispatchByDNumber[key] = e;
      });

      const dispatchedByDo = {};
      dispatchEntries.forEach((e) => {
        const key = (e.doNumber || '').trim().toLowerCase();
        if (!key) return;
        dispatchedByDo[key] = (dispatchedByDo[key] || 0) + (parseFloat(e.qtyToBeDispatched) || 0);
      });
      const cancelledByDo = {};
      orderCancelEntries.forEach((e) => {
        if (e.status !== 'Approved') return;
        const key = (e.doNumber || '').trim().toLowerCase();
        if (!key) return;
        cancelledByDo[key] = (cancelledByDo[key] || 0) + (parseFloat(e.qty) || 0);
      });
      const getRemainingQty = (o) => {
        const orderQty = Number(o.quantity) || 0;
        const dispatched = dispatchedByDo[(o.doNumber || '').trim().toLowerCase()] || 0;
        const cancelled = cancelledByDo[(o.doNumber || '').trim().toLowerCase()] || 0;
        return Math.max(0, orderQty - dispatched - cancelled);
      };

      // Enrich each dispatch entry with the order's PO/party details, matching
      // ArrangeLogisticsPage's enrichment — used for the shipment-batch grouping.
      const enrichedDispatchEntries = dispatchEntries
        .map((e) => {
          const order = orderByDoNumber[(e.doNumber || '').trim().toLowerCase()];
          if (!order) return null;
          return { ...e, partyPoNo: order.partyPoNo || '', partyPoDate: order.partyPoDate || '', partyNames: order.partyNames || e.partyName || '' };
        })
        .filter(Boolean);

      const dispatchBatches = groupIntoShipmentBatches(enrichedDispatchEntries);
      const arrangedByDNumber = {};
      billingEntries.forEach((e) => {
        const key = (e.dispatchNo || '').trim().toLowerCase();
        if (!key) return;
        if (!arrangedByDNumber[key]) arrangedByDNumber[key] = [];
        arrangedByDNumber[key].push(e);
      });
      const isBatchArranged = (batch) =>
        batch.every((e) => (arrangedByDNumber[(e.dNumber || '').trim().toLowerCase()] || []).length > 0);

      // Enrich billing rows the same way each downstream stage page does, then
      // group into shipment batches for the stage-specific pending counts.
      const enrichBilling = (filterFn) =>
        billingEntries
          .filter(filterFn)
          .map((e) => {
            const dispatch = dispatchByDNumber[(e.dispatchNo || '').trim().toLowerCase()];
            const order = orderByDoNumber[(e.doNumber || '').trim().toLowerCase()];
            return {
              ...e,
              dateOfDispatch: dispatch?.dateOfDispatch || '',
              partyPoNo: order?.partyPoNo || '',
              partyPoDate: order?.partyPoDate || '',
              partyNames: order?.partyNames || e.partyName || '',
            };
          });

      const stageBatches = {
        loadMaterial: groupByLgstNo(enrichBilling((e) => e.lgstNo)),
        weighmentEntry: groupByLgstNo(enrichBilling((e) => e.lgstNo && e.loadActual)),
        makeInvoice: groupByLgstNo(enrichBilling((e) => e.lgstNo && e.weighmentActual)),
        salesForm3: groupByBillOrLgst(enrichBilling((e) => e.lgstNo && e.invoiceActual)),
        entryInBilty: groupByBillOrLgst(enrichBilling((e) => e.lgstNo && e.salesFormActual)),
        sendTestCertificate: groupByBillOrLgst(enrichBilling((e) => e.lgstNo && e.biltyEntryActual)),
        partyGetReport: groupByBillOrLgst(enrichBilling((e) => e.lgstNo && e.tcActual)),
        fullKitting: groupByBillOrLgst(enrichBilling((e) => e.lgstNo && e.reportActual)),
      };
      const countPending = (batches, doneField) =>
        batches.filter((batch) => !batch.every((e) => Boolean(e[doneField]))).length;

      const eligibleForAccounts = orders.filter((o) => o.status1 === 'Approved');
      const eligibleForDelivery = orders.filter((o) => Boolean(o.actual2));
      const eligibleForDispatch = orders.filter((o) => Boolean(o.actual3));

      setCounts({
        'check-po': orders.filter((o) => !o.status1).length,
        'received-accounts': eligibleForAccounts.filter((o) => !o.actual2).length,
        'check-for-delivery': eligibleForDelivery.filter((o) => !o.actual3).length,
        'dispatch-planning': eligibleForDispatch.filter((o) => getRemainingQty(o) > 0.0001).length,
        'arrange-logistics': dispatchBatches.filter((batch) => !isBatchArranged(batch)).length,
        'load-material': countPending(stageBatches.loadMaterial, 'loadActual'),
        'weighment-entry': countPending(stageBatches.weighmentEntry, 'weighmentActual'),
        'make-invoice': countPending(stageBatches.makeInvoice, 'invoiceActual'),
        'sales-form-3': countPending(stageBatches.salesForm3, 'salesFormActual'),
        'entry-in-bilty': countPending(stageBatches.entryInBilty, 'biltyEntryActual'),
        'make-send-test-certificate': countPending(stageBatches.sendTestCertificate, 'tcActual'),
        'party-get-report': countPending(stageBatches.partyGetReport, 'reportActual'),
        'full-kitting': countPending(stageBatches.fullKitting, 'kittingActual'),
        'order-cancel': orderCancelEntries.filter((e) => !e.actual && !e.status).length,
        'material-return': materialReturnEntries.filter((e) => !e.actual4).length,
      });
      setLoaded(true);
    } catch (err) {
      console.warn('Could not load sidebar pending counts:', err);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  return { counts, loaded, refresh };
}
