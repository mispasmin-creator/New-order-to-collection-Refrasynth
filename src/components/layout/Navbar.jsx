import React from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { navConfig } from '../../config/navigation';
import { LogOut, User, Bell, Database } from 'lucide-react';

export default function Navbar() {
  const { user, logout, isMockMode } = useAuth();
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
        <span className="text-xs text-slate-400">/</span>
        <span className="text-xs text-slate-500 font-medium">Refrasynth Portal</span>
      </div>

      {/* Right Controls: Backend Status & User Profile */}
      <div className="flex items-center gap-4">
        {/* Backend Connectivity Pill */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-xs font-medium text-slate-600">
          <Database className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[11px]">
            {isMockMode ? 'Demo Mode' : 'Connected to Sheet'}
          </span>
          <span
            className={`w-2 h-2 rounded-full ${
              isMockMode ? 'bg-amber-400' : 'bg-emerald-500'
            }`}
          />
        </div>

        {/* User Info */}
        <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
          <div className="w-8 h-8 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center font-semibold text-xs">
            {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
          </div>
          <div className="hidden md:block text-left">
            <div className="text-xs font-bold text-slate-800 leading-tight">
              {user?.name || 'User'}
            </div>
            <div className="text-[10px] text-slate-400 leading-tight">
              {user?.email || 'admin'}
            </div>
          </div>
        </div>

        {/* Logout Quick Action */}
        <button
          type="button"
          onClick={logout}
          title="Sign Out"
          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
