import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart3, Timer } from 'lucide-react';
import MisPage from './MisPage';
import TatManagementPage from './TatManagementPage';

const TABS = [
  { key: 'mis', label: 'MIS', icon: BarChart3, Component: MisPage },
  { key: 'tat', label: 'TAT Management', icon: Timer, Component: TatManagementPage },
];

// One page, two tabs. The active tab is kept in the URL (?tab=tat) so a refresh or a shared link
// opens the same tab.
export default function MisReportingPage() {
  const [params, setParams] = useSearchParams();
  const active = TABS.find((t) => t.key === params.get('tab')) || TABS[0];
  const Active = active.Component;

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="shrink-0 flex items-center gap-1 border-b border-slate-200">
        {TABS.map((t) => {
          const Icon = t.icon;
          const on = t.key === active.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setParams({ tab: t.key }, { replace: true })}
              className={`-mb-px inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                on ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>
      <div className="flex-1 min-h-0">
        <Active />
      </div>
    </div>
  );
}
