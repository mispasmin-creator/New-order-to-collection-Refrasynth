import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getSidebarItems, renderNavIcon } from '../../config/navigation';
import { LogOut, Layers, Shield } from 'lucide-react';

export default function Sidebar() {
  const { user, logout, isMockMode } = useAuth();
  const sidebarItems = getSidebarItems();

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 h-screen sticky top-0">
      {/* Brand Header */}
      <div className="h-16 px-6 border-b border-slate-100 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-md shadow-indigo-200">
          <Layers className="w-5 h-5" />
        </div>
        <div className="flex flex-col">
          <span className="font-bold text-slate-800 text-base leading-tight tracking-tight">
            Refrasynth
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600">
            Order to Collection
          </span>
        </div>
      </div>

      {/* Navigation Links (Driven directly by navigation.jsx config) */}
      <div className="flex-1 py-5 px-3 overflow-y-auto space-y-1">
        <div className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
          Main Menu
        </div>
        {sidebarItems.map((item) => (
          <NavLink
            key={item.id}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className={isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-600'}>
                  {renderNavIcon(item.icon, 'w-4 h-4')}
                </span>
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge && (
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      isActive ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>

      {/* Connection Mode Indicator */}
      <div className="px-4 py-3 mx-3 mb-2 rounded-xl bg-slate-50 border border-slate-200 text-xs">
        <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 mb-1">
          <span>Backend Link</span>
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              isMockMode ? 'bg-amber-400' : 'bg-emerald-500 animate-pulse'
            }`}
          />
        </div>
        <div className="font-semibold text-slate-700 truncate">
          {isMockMode ? 'Local Demo Mode' : 'Google Sheets API'}
        </div>
      </div>

      {/* User Section & Logout Button at Bottom */}
      <div className="p-3 border-t border-slate-100 bg-slate-50/50">
        <div className="flex items-center gap-3 p-2 rounded-xl">
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
            {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-800 truncate">
              {user?.name || 'User'}
            </p>
            <p className="text-[11px] text-slate-400 truncate">
              {user?.role || user?.email || 'Logged In'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={logout}
          className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
