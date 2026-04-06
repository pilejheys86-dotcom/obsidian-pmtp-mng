/**
 * Navigation configurations for different user roles
 * Each role has its own set of navigation items
 */

// ── OWNER / ADMIN — Full access ─────────────────────────────────────────────
export const adminNavigation = [
  {
    category: 'Main',
    items: [
      { icon: 'dashboard', label: 'Dashboard', path: '/admin' },
      { icon: 'price_change', label: 'Pricing', path: '/admin/pricing', requiresKyc: true },
    ],
  },
  {
    category: 'Operations',
    items: [
      { icon: 'diamond', label: 'Item Processing', path: '/admin/appraisals', requiresKyc: true },
      { icon: 'monetization_on', label: 'Active Loans', path: '/admin/loans', requiresKyc: true },
      { icon: 'schedule', label: 'Overdue Items', path: '/admin/overdue', requiresKyc: true },
      { icon: 'inventory_2', label: 'Inventory', path: '/admin/inventory', requiresKyc: true },
      { icon: 'gavel', label: 'Auctions', path: '/admin/auction', requiresKyc: true },
      { icon: 'fact_check', label: 'Inventory Audit', path: '/admin/inventory/audit', requiresKyc: true },
    ],
  },
  {
    category: 'Management',
    items: [
      { icon: 'group', label: 'Customers', path: '/admin/customers', requiresKyc: true },
      { icon: 'badge', label: 'Employees', path: '/admin/employees', requiresKyc: true },
      { icon: 'web', label: 'Branding', path: '/admin/branding', requiresKyc: true },
    ],
  },
  {
    category: 'Reports',
    items: [
      { icon: 'bar_chart', label: 'Reports', path: '/admin/reports', requiresKyc: true },
    ],
  },
  {
    category: 'System',
    items: [
      { icon: 'credit_card', label: 'Subscription', path: '/admin/subscription', requiresKyc: true, ownerOnly: true },
      { icon: 'verified_user', label: 'Business Verification', path: '/admin/kyc', kycItem: true, ownerOnly: true },
      { icon: 'history', label: 'Audit Log', path: '/admin/audit-log', requiresKyc: true, ownerOnly: true },
      { icon: 'settings', label: 'Settings', path: '/admin/settings' },
    ],
  },
];

// ── SUPER ADMIN — Platform-level ────────────────────────────────────────────
export const superadminNavigation = [
  {
    category: 'Main',
    items: [
      { icon: 'dashboard', label: 'Overview', path: '/superadmin' },
    ],
  },
  {
    category: 'Tenants',
    items: [
      { icon: 'domain', label: 'All Tenants', path: '/superadmin/tenants' },
    ],
  },
  {
    category: 'Analytics',
    items: [
      { icon: 'summarize', label: 'Reports', path: '/superadmin/reports' },
      { icon: 'point_of_sale', label: 'Sales Report', path: '/superadmin/sales' },
    ],
  },
  {
    category: 'System',
    items: [
      { icon: 'shield_person', label: 'Admin Management', path: '/superadmin/admins' },
      { icon: 'history', label: 'Audit Logs', path: '/superadmin/audit-logs' },
      { icon: 'backup', label: 'Backup', path: '/superadmin/backup' },
      { icon: 'settings', label: 'Settings', path: '/superadmin/settings' },
    ],
  },
];

// ── MANAGER — Branch operations + staff oversight ───────────────────────────
export const managerNavigation = [
  {
    category: 'Main',
    items: [
      { icon: 'dashboard', label: 'Dashboard', path: '/admin' },
      { icon: 'price_change', label: 'Pricing', path: '/admin/pricing' },
    ],
  },
  {
    category: 'Operations',
    items: [
      { icon: 'diamond', label: 'Item Processing', path: '/admin/appraisals' },
      { icon: 'monetization_on', label: 'Active Loans', path: '/admin/loans' },
      { icon: 'schedule', label: 'Overdue Items', path: '/admin/overdue' },
      { icon: 'inventory_2', label: 'Inventory', path: '/admin/inventory' },
      { icon: 'gavel', label: 'Auctions', path: '/admin/auction' },
    ],
  },
  {
    category: 'Management',
    items: [
      { icon: 'group', label: 'Customers', path: '/admin/customers' },
      { icon: 'badge', label: 'Employees', path: '/admin/employees' },
      { icon: 'web', label: 'Branding', path: '/admin/branding' },
    ],
  },
  {
    category: 'Reports',
    items: [
      { icon: 'bar_chart', label: 'Reports', path: '/admin/reports' },
    ],
  },
  {
    category: 'System',
    items: [
      { icon: 'settings', label: 'Settings', path: '/admin/settings' },
    ],
  },
];

// ── APPRAISER — Appraisal + inventory focus ─────────────────────────────────
export const appraiserNavigation = [
  {
    category: 'Main',
    items: [
      { icon: 'dashboard', label: 'Dashboard', path: '/admin' },
    ],
  },
  {
    category: 'Operations',
    items: [
      { icon: 'diamond', label: 'Item Processing', path: '/admin/appraisals' },
      { icon: 'monetization_on', label: 'Active Loans', path: '/admin/loans' },
      { icon: 'inventory_2', label: 'Inventory', path: '/admin/inventory' },
      { icon: 'gavel', label: 'Auctions', path: '/admin/auction' },
    ],
  },
  {
    category: 'Management',
    items: [
      { icon: 'group', label: 'Customers', path: '/admin/customers' },
    ],
  },
  {
    category: 'System',
    items: [
      { icon: 'settings', label: 'Settings', path: '/admin/settings' },
    ],
  },
];

// ── AUDITOR — Audit + read-only oversight ───────────────────────────────────
export const auditorNavigation = [
  {
    category: 'Main',
    items: [
      { icon: 'dashboard', label: 'Dashboard', path: '/admin' },
    ],
  },
  {
    category: 'Operations',
    items: [
      { icon: 'monetization_on', label: 'Active Loans', path: '/admin/loans' },
      { icon: 'schedule', label: 'Overdue Items', path: '/admin/overdue' },
      { icon: 'inventory_2', label: 'Inventory', path: '/admin/inventory' },
      { icon: 'fact_check', label: 'Inventory Audit', path: '/admin/inventory/audit' },
    ],
  },
  {
    category: 'Management',
    items: [
      { icon: 'group', label: 'Customers', path: '/admin/customers' },
    ],
  },
  {
    category: 'Reports',
    items: [
      { icon: 'bar_chart', label: 'Audit Reports', path: '/admin/reports' },
    ],
  },
  {
    category: 'System',
    items: [
      { icon: 'settings', label: 'Settings', path: '/admin/settings' },
    ],
  },
];

// ── CASHIER — Transaction-focused ───────────────────────────────────────────
export const cashierNavigation = [
  {
    category: 'Main',
    items: [
      { icon: 'dashboard', label: 'Dashboard', path: '/admin' },
    ],
  },
  {
    category: 'Transactions',
    items: [
      { icon: 'diamond', label: 'Item Processing', path: '/admin/appraisals' },
      { icon: 'monetization_on', label: 'Active Loans', path: '/admin/loans' },
    ],
  },
  {
    category: 'Customers',
    items: [
      { icon: 'group', label: 'Customers', path: '/admin/customers' },
    ],
  },
  {
    category: 'System',
    items: [
      { icon: 'settings', label: 'Settings', path: '/admin/settings' },
    ],
  },
];

// ── Role → Navigation resolver ──────────────────────────────────────────────
export const getNavigationByRole = (role) => {
  switch (role?.toUpperCase()) {
    case 'OWNER':
    case 'ADMIN':
      return adminNavigation;
    case 'SUPERADMIN':
      return superadminNavigation;
    case 'MANAGER':
      return managerNavigation;
    case 'APPRAISER':
      return appraiserNavigation;
    case 'AUDITOR':
      return auditorNavigation;
    case 'CASHIER':
      return cashierNavigation;
    default:
      return [];
  }
};
