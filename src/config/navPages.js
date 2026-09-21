/**
 * PURE PAGE LIST — id/label/path/icon only, no component imports.
 * This is the single source of truth for "every step of the workflow" and is
 * safe to import from ANY page (including Manage Users) without risking a
 * circular import, since it never imports a page component itself.
 *
 * navigation.jsx attaches the actual `component` reference to each entry to
 * build the real router/sidebar config — edit the list itself only here.
 */
export const navPages = [
  { id: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: 'LayoutDashboard', inSidebar: true },
  { id: 'orders', label: 'Orders', path: '/orders', icon: 'ShoppingCart', inSidebar: true },
  { id: 'check-po', label: 'Check PO', path: '/check-po', icon: 'ClipboardCheck', inSidebar: true },
  { id: 'received-accounts', label: 'Received Accounts', path: '/received-accounts', icon: 'IndianRupee', inSidebar: true },
  { id: 'check-for-delivery', label: 'Check for Delivery', path: '/check-for-delivery', icon: 'Truck', inSidebar: true },
  { id: 'dispatch-planning', label: 'Dispatch Planning', path: '/dispatch-planning', icon: 'ClipboardList', inSidebar: true },
  { id: 'arrange-logistics', label: 'Arrange Logistics', path: '/arrange-logistics', icon: 'Boxes', inSidebar: true },
  { id: 'load-material', label: 'Load Material', path: '/load-material', icon: 'Package', inSidebar: true },
  { id: 'weighment-entry', label: 'Weighment Entry', path: '/weighment-entry', icon: 'Scale', inSidebar: true },
  { id: 'make-invoice', label: 'Make Invoice', path: '/make-invoice', icon: 'FileText', inSidebar: true },
  { id: 'sales-form-3', label: 'Sales Form 3', path: '/sales-form-3', icon: 'ClipboardList', inSidebar: true },
  { id: 'entry-in-bilty', label: 'Entry In Bilty', path: '/entry-in-bilty', icon: 'FileSpreadsheet', inSidebar: true },
  { id: 'make-send-test-certificate', label: 'Send Test Certificate', path: '/make-send-test-certificate', icon: 'BadgeCheck', inSidebar: true },
  { id: 'party-get-report', label: 'Party Get Report', path: '/party-get-report', icon: 'Inbox', inSidebar: true },
  { id: 'full-kitting', label: 'Full Kitting', path: '/full-kitting', icon: 'PackageCheck', inSidebar: true },
  { id: 'order-cancel', label: 'Order Cancel', path: '/order-cancel', icon: 'Ban', inSidebar: true },
  { id: 'material-return', label: 'Material Return', path: '/material-return', icon: 'RotateCcw', inSidebar: true },
  { id: 'master-data', label: 'Master Data', path: '/master-data', icon: 'Database', inSidebar: true },
  { id: 'manage-users', label: 'Manage Users', path: '/manage-users', icon: 'Users', inSidebar: true },
];

export const getSidebarPages = () => navPages.filter((item) => item.inSidebar);
