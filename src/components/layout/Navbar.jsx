import React from 'react';
import { useLocation } from 'react-router-dom';
import { navConfig } from '../../config/navigation';

export default function Navbar() {
  const location = useLocation();

  // Find active navigation item title
  const currentItem = navConfig.find((item) => item.path === location.pathname) || {
    label: 'Overview',
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-20">
      {/* Current Page Breadcrumb / Title */}
      <div className="flex items-center gap-3">
        <h2 className="text-base font-bold text-slate-800 m-0">{currentItem.label}</h2>
        <span className="text-xs text-slate-400"></span>
        <span className="text-xs text-slate-500 font-medium"></span>
      </div>

    </header>
  );
}
