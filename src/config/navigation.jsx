import React from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  BarChart3,
  Package,
  FileText,
  Settings,
  HelpCircle,
  ClipboardCheck,
  IndianRupee,
  Truck,
  Boxes,
  ClipboardList,
} from 'lucide-react';
import DashboardPage from '../pages/DashboardPage';
import OrdersPage from '../pages/OrdersPage';
import CheckPOPage from '../pages/CheckPOPage';
import ReceivedAccountsPage from '../pages/ReceivedAccountsPage';
import CheckForDeliveryPage from '../pages/CheckForDeliveryPage';
import DispatchPlanningPage from '../pages/DispatchPlanningPage';
import ArrangeLogisticsPage from '../pages/ArrangeLogisticsPage';
import LoadMaterialPage from '../pages/LoadMaterialPage';
import ManageUsersPage from '../pages/ManageUsersPage';

/**
 * ICON REGISTRY
 * Maps icon name strings to Lucide Icon components.
 * When adding a new page, use any icon key from here (or add new ones as needed).
 */
export const iconMap = {
  LayoutDashboard,
  ShoppingCart,
  ClipboardCheck,
  IndianRupee,
  Truck,
  Boxes,
  ClipboardList,
  Users,
  BarChart3,
  Package,
  FileText,
  Settings,
  HelpCircle,
};

/**
 * DYNAMIC NAVIGATION & ROUTING CONFIGURATION
 * -------------------------------------------------------------
 * Adding a new page to the app takes ONLY 1 entry here!
 * Both the Sidebar navigation links and the React Router routes
 * will automatically update based on this array.
 *
 * Fields:
 * - id: Unique identifier
 * - label: Text shown in the sidebar and page headers
 * - path: URL route path (e.g. '/dashboard', '/orders', '/customers', '/manage-users')
 * - icon: Name of the icon from iconMap
 * - component: React component to render
 * - inSidebar: Set to true to display in the fixed sidebar
 * - badge: (Optional) string or number to show a small badge
 */
export const navConfig = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    path: '/dashboard',
    icon: 'LayoutDashboard',
    component: DashboardPage,
    inSidebar: true,
  },
  {
    id: 'orders',
    label: 'Orders',
    path: '/orders',
    icon: 'ShoppingCart',
    component: OrdersPage,
    inSidebar: true,
  },
  {
    id: 'check-po',
    label: 'Check PO',
    path: '/check-po',
    icon: 'ClipboardCheck',
    component: CheckPOPage,
    inSidebar: true,
  },
  {
    id: 'received-accounts',
    label: 'Received Accounts',
    path: '/received-accounts',
    icon: 'IndianRupee',
    component: ReceivedAccountsPage,
    inSidebar: true,
  },
  {
    id: 'check-for-delivery',
    label: 'Check for Delivery',
    path: '/check-for-delivery',
    icon: 'Truck',
    component: CheckForDeliveryPage,
    inSidebar: true,
  },
  {
    id: 'dispatch-planning',
    label: 'Dispatch Planning',
    path: '/dispatch-planning',
    icon: 'ClipboardList',
    component: DispatchPlanningPage,
    inSidebar: true,
  },
  {
    id: 'arrange-logistics',
    label: 'Arrange Logistics',
    path: '/arrange-logistics',
    icon: 'Boxes',
    component: ArrangeLogisticsPage,
    inSidebar: true,
  },
  {
    id: 'load-material',
    label: 'Load Material',
    path: '/load-material',
    icon: 'Package',
    component: LoadMaterialPage,
    inSidebar: true,
  },
  {
    id: 'manage-users',
    label: 'Manage Users',
    path: '/manage-users',
    icon: 'Users',
    component: ManageUsersPage,
    inSidebar: true,
  },
  /* 
   * [TEMPLATE FOR FUTURE PAGES]
   * To add a new page (Customers, Inventory, Reports, etc.),
   * simply uncomment or add an item like below:
   *
   * {
   *   id: 'customers',
   *   label: 'Customers',
   *   path: '/customers',
   *   icon: 'Users',
   *   component: CustomersPage,
   *   inSidebar: true,
   * },
   * {
   *   id: 'reports',
   *   label: 'Reports',
   *   path: '/reports',
   *   icon: 'BarChart3',
   *   component: ReportsPage,
   *   inSidebar: true,
   * },
   */
];

/**
 * Returns only items meant for the sidebar
 */
export const getSidebarItems = () => {
  return navConfig.filter((item) => item.inSidebar);
};

/**
 * Helper to render the appropriate Lucide Icon by name
 */
export const renderNavIcon = (iconName, className = 'w-5 h-5') => {
  const IconComponent = iconMap[iconName] || LayoutDashboard;
  return <IconComponent className={className} />;
};
