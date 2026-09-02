import React from 'react';
import WorkflowPage from './WorkflowPage';
import { ShieldCheck } from 'lucide-react';

export default function LogisticsApprovalPage() {
  return (
    <WorkflowPage
      pageTitle="Logistics Approval"
      pageIcon={<ShieldCheck className="w-5 h-5" />}
      actionLabel="Logistics Approval"
      actionColor="teal"
      stageKey={5}
      filterPredicate={(o) => Boolean(o.actual3)}
      modalFields={[
        { key: 'approvedBy', label: 'Approved By', type: 'text', placeholder: 'Name of approver...' },
        { key: 'approvalNote', label: 'Approval Note', type: 'textarea', placeholder: 'Remarks...' },
      ]}
    />
  );
}