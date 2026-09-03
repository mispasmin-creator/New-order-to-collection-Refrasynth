import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

// Groups entries that share the same shipment/PO into a single batch — the exact
// key used across Dispatch/Arrange Logistics/Billing-stage pages, so counts here
// line up with what each page's own "Pending" tab shows.
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

// Refetch interval — the sidebar badges only need to be roughly fresh, and this
// backend has a real rate limit, so keep this well above "poll aggressively".
const REFRESH_MS = 120000;

export default function usePendingCounts() {
  const [counts, setCounts] = useState({});
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [ordersRes, dispatchRes, billingRes] = await Promise.all([
        api.getOrders(),
        api.getDispatchEntries(),
        api.getLogisticsEntries(),
      ]);

      const orders = (ordersRes && ordersRes.success && Array.isArray(ordersRes.data)) ? ordersRes.data : [];
      const dispatchEntries = (dispatchRes && dispatchRes.success && Array.isArray(dispatchRes.data)) ? dispatchRes.data : [];
      const billingEntries = (billingRes && billingRes.success && Array.isArray(billingRes.data)) ? billingRes.data : [];

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
      const getRemainingQty = (o) => {
        const orderQty = Number(o.quantity) || 0;
        const dispatched = dispatchedByDo[(o.doNumber || '').trim().toLowerCase()] || 0;
        return Math.max(0, orderQty - dispatched);
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
        loadMaterial: groupIntoShipmentBatches(enrichBilling((e) => e.lgstNo)),
        weighmentEntry: groupIntoShipmentBatches(enrichBilling((e) => e.lgstNo && e.loadActual)),
        makeInvoice: groupIntoShipmentBatches(enrichBilling((e) => e.lgstNo && e.weighmentActual)),
        salesForm3: groupIntoShipmentBatches(enrichBilling((e) => e.lgstNo && e.invoiceActual)),
        entryInBilty: groupIntoShipmentBatches(enrichBilling((e) => e.lgstNo && e.salesFormActual)),
        sendTestCertificate: groupIntoShipmentBatches(enrichBilling((e) => e.lgstNo && e.biltyEntryActual)),
        partyGetReport: groupIntoShipmentBatches(enrichBilling((e) => e.lgstNo && e.tcActual)),
        fullKitting: groupIntoShipmentBatches(enrichBilling((e) => e.lgstNo && e.reportActual)),
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
