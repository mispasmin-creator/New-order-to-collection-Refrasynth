import React from 'react';
import WorkflowPage from './WorkflowPage';
import { ClipboardList } from 'lucide-react';

export default function DispatchPlanningPage() {
  return (
    <WorkflowPage
      pageTitle="Dispatch Planning"
      pageIcon={<ClipboardList className="w-5 h-5" />}
      actionLabel="Dispatch Plan"
      actionColor="indigo"
      modalFields={[
        { key: 'dispatchDate', label: 'Planned Dispatch Date', type: 'date' },
        { key: 'dispatchNote', label: 'Dispatch Note', type: 'textarea', placeholder: 'Planning remarks...' },
      ]}
    />
  );
}