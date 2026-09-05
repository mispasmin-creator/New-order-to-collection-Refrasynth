import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { hasPagePermission } from '../../utils/permissions';

// Wraps a page's route element — renders it only if the logged-in user's
// Page Permissions (from Manage Users) include this page's label or "All".
export default function RequirePagePermission({ label, children }) {
  const { user } = useAuth();

  if (hasPagePermission(user, label)) {
    return children;
  }

  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6">
      <div className="p-3 rounded-full bg-rose-50 border border-rose-200 mb-4">
        <ShieldAlert className="w-8 h-8 text-rose-500" />
      </div>
      <h2 className="text-lg font-bold text-slate-800">Access Restricted</h2>
      <p className="text-sm text-slate-500 mt-1 max-w-sm">
        You don't have permission to view <strong>{label}</strong>. Contact an admin from Manage Users if you need access.
      </p>
    </div>
  );
}
