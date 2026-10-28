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
  Scale,
  FileSpreadsheet,
  BadgeCheck,
  Inbox,
  PackageCheck,
  Ban,
  RotateCcw,
  Database,
  Timer,
} from 'lucide-react';
import DashboardPage from '../pages/DashboardPage';
import OrdersPage from '../pages/OrdersPage';
import CheckPOPage from '../pages/CheckPOPage';
import ReceivedAccountsPage from '../pages/ReceivedAccountsPage';
import CheckForDeliveryPage from '../pages/CheckForDeliveryPage';
import DispatchPlanningPage from '../pages/DispatchPlanningPage';
import ArrangeLogisticsPage from '../pages/ArrangeLogisticsPage';
import LoadMaterialPage from '../pages/LoadMaterialPage';
import WeighmentEntryPage from '../pages/WeighmentEntryPage';
import MakeInvoicePage from '../pages/MakeInvoicePage';
import SalesForm3Page from '../pages/SalesForm3Page';
import EntryInBiltyPage from '../pages/EntryInBiltyPage';
import MakeSendTestCertificatePage from '../pages/MakeSendTestCertificatePage';
import PartyGetReportPage from '../pages/PartyGetReportPage';
import FullKittingPage from '../pages/FullKittingPage';
import OrderCancelPage from '../pages/OrderCancelPage';
import MaterialReturnPage from '../pages/MaterialReturnPage';
import ManageUsersPage from '../pages/ManageUsersPage';
import MasterDataPage from '../pages/MasterDataPage';
import MisReportingPage from '../pages/MisReportingPage';
import { navPages } from './navPages';

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
  Scale,
  FileSpreadsheet,
  BadgeCheck,
  Inbox,
  PackageCheck,
  Ban,
  RotateCcw,
  Database,
  Timer,
};

// Maps each navPages id to the component that renders it. The id/label/path/
// icon list itself lives in navPages.js (no component imports there) so
// pages like Manage Users can read the full step list without a circular
// import back into this file.
const componentMap = {
  dashboard: DashboardPage,
  orders: OrdersPage,
  'check-po': CheckPOPage,
  'received-accounts': ReceivedAccountsPage,
  'check-for-delivery': CheckForDeliveryPage,
  'dispatch-planning': DispatchPlanningPage,
  'arrange-logistics': ArrangeLogisticsPage,
  'load-material': LoadMaterialPage,
  'weighment-entry': WeighmentEntryPage,
  'make-invoice': MakeInvoicePage,
  'sales-form-3': SalesForm3Page,
  'entry-in-bilty': EntryInBiltyPage,
  'make-send-test-certificate': MakeSendTestCertificatePage,
  'party-get-report': PartyGetReportPage,
  'full-kitting': FullKittingPage,
  'order-cancel': OrderCancelPage,
  'material-return': MaterialReturnPage,
  'mis-reporting': MisReportingPage,
  'master-data': MasterDataPage,
  'manage-users': ManageUsersPage,
};

/**
 * DYNAMIC NAVIGATION & ROUTING CONFIGURATION
 * -------------------------------------------------------------
 * Adding a new page to the app takes 2 steps:
 *   1. Add its id/label/path/icon to navPages.js
 *   2. Import its component above and add it to componentMap here
 * Both the Sidebar navigation links and the React Router routes
 * will automatically update based on this array.
 */
export const navConfig = navPages.map((page) => ({
  ...page,
  component: componentMap[page.id],
}));

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
