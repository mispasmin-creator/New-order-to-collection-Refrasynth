import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import Modal from '../components/common/Modal';
import ExportButton from '../components/common/ExportButton';
import { getSidebarPages } from '../config/navPages';
import {
  Users,
  UserPlus,
  Search,
  RefreshCw,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  Shield,
  Building2,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Lock,
} from 'lucide-react';

// Pulled directly from the sidebar/route config so this list always matches
// every real step of the O2C workflow — new pages need no edit here.
const AVAILABLE_PAGES = getSidebarPages().map((item) => ({ id: item.label, label: item.label }));

const emptyUserForm = {
  username: '',
  password: '',
  role: 'Staff',
  firmAccess: 'All',
  pagePermissions: 'All',
};

export default function ManageUsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [successNotice, setSuccessNotice] = useState('');

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');

  // Password visibility map { [rowIndex]: boolean }
  const [showPasswords, setShowPasswords] = useState({});

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const [formData, setFormData] = useState(emptyUserForm);
  const [selectedUser, setSelectedUser] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Selected permissions array for modal
  const [selectedPermissions, setSelectedPermissions] = useState(['All']);

  // Fetch users from Google Sheet
  const fetchUsers = async (showSync = false) => {
    if (showSync) setSyncing(true);
    else setLoading(true);
    setError('');

    try {
      const res = await api.getUsers();
      if (res && res.success && Array.isArray(res.data)) {
        setUsers(res.data);
      } else {
        setError(res?.error || 'Could not fetch users from Google Sheets.');
      }
    } catch (err) {
      setError(err.message || 'Error fetching users.');
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const notifySuccess = (msg) => {
    setSuccessNotice(msg);
    setTimeout(() => setSuccessNotice(''), 4000);
  };

  // Toggle password visibility for specific user row
  const togglePasswordVisibility = (index) => {
    setShowPasswords((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  // Filtered users list
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesRole = roleFilter === 'All' || u.role === roleFilter;
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        (u.username && u.username.toLowerCase().includes(q)) ||
        (u.role && u.role.toLowerCase().includes(q)) ||
        (u.firmAccess && u.firmAccess.toLowerCase().includes(q)) ||
        (u.pagePermissions && u.pagePermissions.toLowerCase().includes(q));
      return matchesRole && matchesSearch;
    });
  }, [users, searchQuery, roleFilter]);

  const buildExportRows = () => filteredUsers.map((u) => ({
    'User Name': u.username,
    'Role': u.role,
    'Firm Access': u.firmAccess,
    'Page Permissions': u.pagePermissions,
  }));

  // Handle opening Add Modal
  const handleOpenAdd = () => {
    setFormData(emptyUserForm);
    setSelectedPermissions(['All']);
    setIsAddModalOpen(true);
  };

  // Handle Add Submit
  const handleAddSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    const perms = selectedPermissions.includes('All')
      ? 'All'
      : selectedPermissions.join(', ');

    const payload = {
      ...formData,
      pagePermissions: perms || 'Dashboard',
    };

    try {
      const res = await api.addUser(payload);
      if (res && res.success) {
        // Optimistically add to UI immediately so user sees it right away
        const newUserOptimistic = {
          rowIndex: users.length + 2,
          username: payload.username,
          password: payload.password,
          role: payload.role || 'Staff',
          firmAccess: payload.firmAccess || 'All',
          pagePermissions: payload.pagePermissions || 'All',
        };
        setUsers((prev) => [...prev, newUserOptimistic]);

        setIsAddModalOpen(false);
        notifySuccess(res.message || 'User added successfully!');
        
        // Re-fetch from Google Sheet after 1.5s to sync
        setTimeout(() => {
          fetchUsers(false);
        }, 1500);
      } else {
        setError(res?.error || 'Failed to add user to Google Sheet.');
      }
    } catch (err) {
      setError(err.message || 'Error submitting user.');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle opening Edit Modal
  const handleOpenEdit = (user) => {
    setSelectedUser(user);
    setFormData({
      username: user.username,
      password: user.password,
      role: user.role,
      firmAccess: user.firmAccess,
      pagePermissions: user.pagePermissions,
    });

    const rawPerms = (user.pagePermissions || '').split(',').map((p) => p.trim());
    setSelectedPermissions(rawPerms.length > 0 ? rawPerms : ['All']);
    setIsEditModalOpen(true);
  };

  // Handle Edit Submit
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!selectedUser) return;
    setSubmitting(true);
    setError('');

    const perms = selectedPermissions.includes('All')
      ? 'All'
      : selectedPermissions.join(', ');

    const payload = {
      ...formData,
      pagePermissions: perms || 'Dashboard',
    };

    try {
      const res = await api.updateUser(selectedUser.rowIndex, payload);
      if (res && res.success) {
        // Optimistically update local users state
        setUsers((prev) =>
          prev.map((u) =>
            u.rowIndex === selectedUser.rowIndex
              ? { ...u, ...payload }
              : u
          )
        );

        setIsEditModalOpen(false);
        notifySuccess(res.message || `User ${formData.username} updated!`);
        setTimeout(() => {
          fetchUsers(false);
        }, 1500);
      } else {
        setError(res?.error || 'Failed to update user.');
      }
    } catch (err) {
      setError(err.message || 'Error updating user.');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Delete Confirmation
  const handleOpenDelete = (user) => {
    setSelectedUser(user);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedUser) return;
    setSubmitting(true);
    setError('');

    try {
      const res = await api.deleteUser(selectedUser.rowIndex);
      if (res && res.success) {
        // Optimistically remove from state
        setUsers((prev) => prev.filter((u) => u.rowIndex !== selectedUser.rowIndex));

        setIsDeleteModalOpen(false);
        notifySuccess(res.message || 'User deleted successfully!');
        setTimeout(() => {
          fetchUsers(false);
        }, 1500);
      } else {
        setError(res?.error || 'Failed to delete user.');
      }
    } catch (err) {
      setError(err.message || 'Error deleting user.');
    } finally {
      setSubmitting(false);
    }
  };

  // Checkbox toggle for permissions
  const handlePermissionToggle = (perm) => {
    if (perm === 'All') {
      setSelectedPermissions(['All']);
      return;
    }

    let updated = selectedPermissions.filter((p) => p !== 'All');
    if (updated.includes(perm)) {
      updated = updated.filter((p) => p !== perm);
    } else {
      updated.push(perm);
    }

    if (updated.length === 0) {
      updated = ['All'];
    }
    setSelectedPermissions(updated);
  };

  return (
    <div className="h-full flex flex-col space-y-6">
      {/* Sticky Page Header + Alerts + Filters (stays fixed while table scrolls) */}
      <div className="shrink-0 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 m-0 flex items-center gap-2.5">
              <Users className="w-7 h-7 text-indigo-600" />
              <span>Manage Users</span>
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Real-time credentials, roles, firm access, and page permissions from Google Sheets (<strong>Users</strong> tab)
            </p>
          </div>

          <div className="flex items-center gap-3">
            <ExportButton getRows={buildExportRows} filename="Users" />
            <button
              type="button"
              onClick={() => fetchUsers(true)}
              disabled={syncing || loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-2xs transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin text-indigo-600' : 'text-slate-500'}`} />
              <span>{syncing ? 'Syncing...' : 'Sync Sheet'}</span>
            </button>

            <button
              type="button"
              onClick={handleOpenAdd}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-sm shadow-indigo-200 transition-all"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add New User</span>
            </button>
          </div>
        </div>

        {/* Success Notification */}
        {successNotice && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3.5 text-sm text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successNotice}</span>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 p-3.5 text-sm text-rose-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Search & Filter Card */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Search */}
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by User Name, Role, Firm Access, or Permission..."
              className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
            />
          </div>

          {/* Role Filter */}
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Shield className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-semibold uppercase text-slate-400">Role:</span>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="All">All Roles</option>
              <option value="Admin">Admin</option>
              <option value="Manager">Manager</option>
              <option value="Operations Head">Operations Head</option>
              <option value="Staff">Staff</option>
            </select>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="flex-1 min-h-0 bg-white rounded-xl border border-slate-200 shadow-2xs overflow-y-auto">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400">
            <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="mt-3 text-sm font-medium">Fetching users from Google Sheets Users tab...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-16 text-center">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-700">No users found</h3>
            <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">
              {searchQuery || roleFilter !== 'All'
                ? 'Try adjusting your search criteria.'
                : 'No users in the Google Sheet. Click "Add New User" to insert one.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3.5">User Name</th>
                  <th className="px-5 py-3.5">Password</th>
                  <th className="px-5 py-3.5">Role</th>
                  <th className="px-5 py-3.5">Firm Access</th>
                  <th className="px-5 py-3.5">Page Permissions</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((user, idx) => {
                  const isVisible = showPasswords[user.rowIndex ?? idx];
                  const permsArray = (user.pagePermissions || 'All')
                    .split(',')
                    .map((p) => p.trim())
                    .filter(Boolean);

                  return (
                    <tr key={user.rowIndex ?? idx} className="hover:bg-slate-50/80 transition-colors">
                      {/* User Name */}
                      <td className="px-5 py-4 font-semibold text-slate-800">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">
                            {user.username ? user.username.charAt(0).toUpperCase() : 'U'}
                          </div>
                          <span>{user.username}</span>
                        </div>
                      </td>

                      {/* Password */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2 font-mono text-xs">
                          <span className={isVisible ? 'text-slate-800 font-medium' : 'text-slate-400 tracking-widest'}>
                            {isVisible ? user.password : '••••••••'}
                          </span>
                          <button
                            type="button"
                            onClick={() => togglePasswordVisibility(user.rowIndex ?? idx)}
                            className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
                            title={isVisible ? 'Hide password' : 'Show password'}
                          >
                            {isVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          <Shield className="w-3 h-3" />
                          {user.role}
                        </span>
                      </td>

                      {/* Firm Access */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5 text-xs text-slate-700 font-medium">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          <span>{user.firmAccess}</span>
                        </div>
                      </td>

                      {/* Page Permissions */}
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-1.5">
                          {permsArray.map((perm, i) => (
                            <span
                              key={i}
                              className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${
                                perm === 'All'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-slate-100 text-slate-700 border border-slate-200'
                              }`}
                            >
                              {perm}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(user)}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                            title="Edit User"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenDelete(user)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                            title="Delete User"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer info */}
        <div className="bg-slate-50/80 px-5 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>Total: <strong>{filteredUsers.length}</strong> active user accounts</span>
          <span>Google Sheet: <strong>Users</strong> Tab</span>
        </div>
      </div>

      {/* ADD USER MODAL */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add New User to Google Sheet"
      >
        <form onSubmit={handleAddSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              User Name *
            </label>
            <input
              type="text"
              required
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              placeholder="e.g. Ramesh"
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Password *
            </label>
            <input
              type="text"
              required
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder="Enter user password"
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Role *
              </label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
              >
                <option value="Admin">Admin</option>
                <option value="Manager">Manager</option>
                <option value="Operations Head">Operations Head</option>
                <option value="Sales Executive">Sales Executive</option>
                <option value="Accounts">Accounts</option>
                <option value="Staff">Staff</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Firm Access *
              </label>
              <input
                type="text"
                required
                value={formData.firmAccess}
                onChange={(e) => setFormData({ ...formData, firmAccess: e.target.value })}
                placeholder="e.g. All, Plant 1, Plant 2"
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Page Permissions
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handlePermissionToggle('All')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  selectedPermissions.includes('All')
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-slate-50 text-slate-600 border-slate-300'
                }`}
              >
                All Permissions
              </button>
              {AVAILABLE_PAGES.map((page) => {
                const isSelected = selectedPermissions.includes(page.id);
                return (
                  <button
                    key={page.id}
                    type="button"
                    onClick={() => handlePermissionToggle(page.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-slate-50 text-slate-600 border-slate-300'
                    }`}
                  >
                    {page.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Saving...' : 'Add User to Sheet'}
            </button>
          </div>
        </form>
      </Modal>

      {/* EDIT USER MODAL */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={`Edit User: ${formData.username}`}
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              User Name *
            </label>
            <input
              type="text"
              required
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              New Password
            </label>
            <input
              type="text"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder="Leave blank to keep the current password"
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Role *
              </label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="Admin">Admin</option>
                <option value="Manager">Manager</option>
                <option value="Operations Head">Operations Head</option>
                <option value="Sales Executive">Sales Executive</option>
                <option value="Accounts">Accounts</option>
                <option value="Staff">Staff</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Firm Access *
              </label>
              <input
                type="text"
                required
                value={formData.firmAccess}
                onChange={(e) => setFormData({ ...formData, firmAccess: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Page Permissions
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handlePermissionToggle('All')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  selectedPermissions.includes('All')
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-slate-50 text-slate-600 border-slate-300'
                }`}
              >
                All Permissions
              </button>
              {AVAILABLE_PAGES.map((page) => {
                const isSelected = selectedPermissions.includes(page.id);
                return (
                  <button
                    key={page.id}
                    type="button"
                    onClick={() => handlePermissionToggle(page.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-slate-50 text-slate-600 border-slate-300'
                    }`}
                  >
                    {page.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsEditModalOpen(false)}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Updating...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* DELETE CONFIRMATION MODAL */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Delete User Confirmation"
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 text-rose-600">
            <div className="p-2.5 rounded-full bg-rose-50">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-semibold text-slate-800">Delete User Account?</h4>
              <p className="text-xs text-slate-500">
                Are you sure you want to remove <strong className="text-slate-800">{selectedUser?.username}</strong> from Google Sheets?
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsDeleteModalOpen(false)}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={handleDeleteConfirm}
              className="px-4 py-2 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Deleting...' : 'Yes, Delete'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
