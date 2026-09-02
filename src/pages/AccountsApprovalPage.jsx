import React from 'react';
import WorkflowPage from './WorkflowPage';
import { BadgeCheck } from 'lucide-react';

export default function AccountsApprovalPage() {
  return (
    <WorkflowPage
      pageTitle="Accounts Approval"
      pageIcon={<BadgeCheck className="w-5 h-5" />}
      actionLabel="Accounts Approval"
      actionColor="emerald"
      modalFields={[
        { key: 'invoiceNo', label: 'Invoice No.', type: 'text', placeholder: 'e.g. INV-2026-001' },
        { key: 'accountsNote', label: 'Accounts Note', type: 'textarea', placeholder: 'Final accounts remarks...' },
      ]}
    />
  );
}