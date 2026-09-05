import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getSidebarItems, renderNavIcon } from '../../config/navigation';
import usePendingCounts from '../../hooks/usePendingCounts';
import { hasPagePermission } from '../../utils/permissions';
import { LogOut, ChevronLeft, ChevronRight } from 'lucide-react';

const STORAGE_KEY = 'sidebarCollapsed';

export default function Sidebar() {
  const { user, logout } = useAuth();
  const sidebarItems = getSidebarItems().filter((item) => hasPagePermission(user, item.label));
  const { counts: pendingCounts } = usePendingCounts();

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  return (
    <aside
      className={`relative bg-white border-r border-slate-200 flex flex-col shrink-0 h-screen sticky top-0 transition-all duration-200 ${
        collapsed ? 'w-[72px]' : 'w-64'
      }`}
    >
      {/* Collapse/Expand Toggle */}
      <button
        type="button"
        onClick={toggleCollapsed}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="absolute -right-3 top-16 z-10 w-6 h-6 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:border-indigo-300 transition-colors"
      >
        {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
      </button>

      {/* Brand Header */}
      <div className={`h-16 border-b border-slate-100 flex items-center gap-3 ${collapsed ? 'px-0 justify-center' : 'px-6'}`}>
        <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-sm p-1 shrink-0">
          <img src="/icons.png" alt="Refrasynth" className="w-full h-full object-contain" />
        </div>
        {!collapsed && (
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-slate-800 text-base leading-tight tracking-tight truncate">
              Order To Collection
            </span>
          </div>
        )}
      </div>

      {/* Navigation Links */}
      <div className={`flex-1 py-5 overflow-y-auto space-y-1 ${collapsed ? 'px-2' : 'px-3'}`}>
        {sidebarItems.map((item) => {
          const count = pendingCounts[item.id] ?? item.badge;
          const hasCount = typeof count === 'number' && count > 0;

          return (
            <NavLink
              key={item.id}
              to={item.path}
              title={collapsed ? `${item.label}${hasCount ? ` (${count} pending)` : ''}` : undefined}
              className={({ isActive }) =>
                `relative flex items-center gap-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  collapsed ? 'px-0 justify-center' : 'px-3.5'
                } ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`shrink-0 relative ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-600'}`}>
                    {renderNavIcon(item.icon, 'w-4 h-4')}
                    {collapsed && hasCount && (
                      <span
                        className={`absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full text-[9px] font-bold ${
                          isActive ? 'bg-white text-indigo-600' : 'bg-amber-500 text-white'
                        }`}
                      >
                        {count > 99 ? '99+' : count}
                      </span>
                    )}
                  </span>
                  {!collapsed && (
                    <>
                      <span className="flex-1 truncate">{item.label}</span>
                      {hasCount && (
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                            isActive ? 'bg-white text-indigo-600' : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {count > 99 ? '99+' : count}
                        </span>
                      )}
                    </>
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </div>

      {/* User Section & Logout Button at Bottom */}
      <div className="p-3 border-t border-slate-100 bg-slate-50/50">
        <div className={`flex items-center gap-3 p-2 rounded-xl ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
            {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-800 truncate">
                {user?.name || 'User'}
              </p>
              <p className="text-[11px] text-slate-400 truncate">
                {user?.role || user?.email || 'Logged In'}
              </p>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={logout}
          title={collapsed ? 'Sign Out' : undefined}
          className={`mt-2 w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors ${
            collapsed ? 'px-0' : 'px-3'
          }`}
        >
          <LogOut className="w-3.5 h-3.5" />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );
}
