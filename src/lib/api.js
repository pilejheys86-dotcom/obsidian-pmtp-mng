const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

/**
 * Get the current Supabase session token from localStorage.
 * Reads synchronously to avoid triggering auth state change loops.
 */
const getToken = () => {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
      try {
        const session = JSON.parse(localStorage.getItem(key));
        return session?.access_token || null;
      } catch { continue; }
    }
  }
  return null;
};

/**
 * Base fetch helper with auth headers and error handling.
 */
const apiFetch = async (endpoint, options = {}) => {
  const token = getToken();
  const isFormData = options.body instanceof FormData;
  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error: ${res.status}`);
  }

  if (options.rawResponse) return res;
  return res.json();
};

// ── Auth ────────────────────────────────────────────────
export const authApi = {
  login: (email, password) =>
    apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  register: (formData) =>
    apiFetch('/auth/register', { method: 'POST', body: JSON.stringify(formData) }),

  recover: (email) =>
    apiFetch('/auth/recover', { method: 'POST', body: JSON.stringify({ email }) }),

  verifyOtp: (email, otp) =>
    apiFetch('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ email, otp }) }),

  resetPassword: (resetToken, newPassword) =>
    apiFetch('/auth/reset-password', { method: 'POST', body: JSON.stringify({ resetToken, newPassword }) }),

  checkEmail: (email) =>
    apiFetch('/auth/check-email', { method: 'POST', body: JSON.stringify({ email }) }),

  signupInit: (data) =>
    apiFetch('/auth/signup-init', { method: 'POST', body: JSON.stringify(data) }),

  verifySignupOtp: (email, otp) =>
    apiFetch('/auth/verify-signup-otp', { method: 'POST', body: JSON.stringify({ email, otp }) }),

  resolveEmail: (email) =>
    apiFetch('/auth/resolve-email', { method: 'POST', body: JSON.stringify({ email }) }),

  completeKyc: (data) =>
    apiFetch('/auth/complete-kyc', { method: 'POST', body: JSON.stringify(data) }),

  updateProfile: (data) =>
    apiFetch('/auth/profile', { method: 'PATCH', body: JSON.stringify(data) }),

  forceChangePassword: (newPassword) =>
    apiFetch('/auth/force-change-password', { method: 'POST', body: JSON.stringify({ newPassword }) }),

  getProfile: () =>
    apiFetch('/auth/profile'),
};

// ── Dashboard ───────────────────────────────────────────
export const dashboardApi = {
  getStats: () => apiFetch('/dashboard'),
};

// ── Customers ───────────────────────────────────────────
export const customersApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/customers?${qs}`);
  },
  stats: () => apiFetch('/customers/stats'),
  get: (id) => apiFetch(`/customers/${id}`),
  create: (data) =>
    apiFetch('/customers', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) =>
    apiFetch(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id) =>
    apiFetch(`/customers/${id}`, { method: 'DELETE' }),
  archived: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/customers/archived?${qs}`);
  },
  restore: (id) =>
    apiFetch(`/customers/${id}/restore`, { method: 'POST' }),
  permanentDelete: (id) =>
    apiFetch(`/customers/${id}/permanent`, { method: 'DELETE' }),
};

// ── Employees ───────────────────────────────────────────
export const employeesApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/employees?${qs}`);
  },
  stats: () => apiFetch('/employees/stats'),
  get: (id) => apiFetch(`/employees/${id}`),
  create: (data) =>
    apiFetch('/employees', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) =>
    apiFetch(`/employees/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id) =>
    apiFetch(`/employees/${id}`, { method: 'DELETE' }),
  approveKyc: (id) =>
    apiFetch(`/employees/${id}/kyc-approve`, { method: 'POST' }),
  rejectKyc: (id) =>
    apiFetch(`/employees/${id}/kyc-reject`, { method: 'POST' }),
  resendInvite: (id) =>
    apiFetch(`/employees/${id}/resend-invite`, { method: 'POST' }),
};

// ── Pawn Items (Inventory) ──────────────────────────────
export const pawnItemsApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/pawn-items?${qs}`);
  },
  stats: () => apiFetch('/pawn-items/stats'),
  get: (id) => apiFetch(`/pawn-items/${id}`),
  create: (data) =>
    apiFetch('/pawn-items', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) =>
    apiFetch(`/pawn-items/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id) =>
    apiFetch(`/pawn-items/${id}`, { method: 'DELETE' }),
};

// ── Pawn Tickets (Active Loans) ────────────────────────
export const pawnTicketsApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/pawn-tickets?${qs}`);
  },
  stats: () => apiFetch('/pawn-tickets/stats'),
  get: (id) => apiFetch(`/pawn-tickets/${id}`),
  create: (data) =>
    apiFetch('/pawn-tickets', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) =>
    apiFetch(`/pawn-tickets/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  // Overdue endpoints
  overdueStats: () => apiFetch('/pawn-tickets/overdue/stats'),
  overdueList: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/pawn-tickets/overdue?${qs}`);
  },
  forfeit: (id, data) =>
    apiFetch(`/pawn-tickets/overdue/${id}/forfeit`, { method: 'POST', body: JSON.stringify(data) }),
};

// ── Transactions ────────────────────────────────────────
export const transactionsApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/transactions?${qs}`);
  },
  get: (id) => apiFetch(`/transactions/${id}`),
  create: (data) =>
    apiFetch('/transactions', { method: 'POST', body: JSON.stringify(data) }),
};

// ── Auctions ────────────────────────────────────────────
export const auctionsApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/auctions?${qs}`);
  },
  lots: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/auctions/lots?${qs}`);
  },
  stats: () => apiFetch('/auctions/stats'),
  create: (data) =>
    apiFetch('/auctions', { method: 'POST', body: JSON.stringify(data) }),
  addLot: (auctionId, data) =>
    apiFetch(`/auctions/${auctionId}/lots`, { method: 'POST', body: JSON.stringify(data) }),
  recordSale: (lotId, data) =>
    apiFetch(`/auctions/lots/${lotId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  update: (id, data) =>
    apiFetch(`/auctions/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
};

// ── Notices ─────────────────────────────────────────────
export const noticesApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/notices?${qs}`);
  },
  send: (data) =>
    apiFetch('/notices', { method: 'POST', body: JSON.stringify(data) }),
  autoCheck: () =>
    apiFetch('/notices/auto-check', { method: 'POST' }),
};

// ── Branches ────────────────────────────────────────────
export const branchesApi = {
  list: () => apiFetch('/branches'),
  get: (id) => apiFetch(`/branches/${id}`),
  create: (data) =>
    apiFetch('/branches', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) =>
    apiFetch(`/branches/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
};

// ── Tenants (Platform Admin) ─────────────────────────────
export const tenantsApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''))
    ).toString()
    return apiFetch(`/tenants?${qs}`)
  },
  stats: () => apiFetch('/tenants/stats'),
  analytics: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return apiFetch(`/tenants/analytics?${qs}`)
  },
  get: (id) => apiFetch(`/tenants/${id}`),
  block: (id, data) =>
    apiFetch(`/tenants/${id}/block`, { method: 'POST', body: JSON.stringify(data) }),
  reactivate: (id) =>
    apiFetch(`/tenants/${id}/reactivate`, { method: 'POST' }),
  approve: (id) =>
    apiFetch(`/tenants/${id}/approve`, { method: 'POST' }),
  reject: (id, data) =>
    apiFetch(`/tenants/${id}/reject`, { method: 'POST', body: JSON.stringify(data) }),
  deactivate: (id, data) =>
    apiFetch(`/tenants/${id}/deactivate`, { method: 'POST', body: JSON.stringify(data) }),
  updatePlan: (id, data) =>
    apiFetch(`/tenants/${id}/plan`, { method: 'PATCH', body: JSON.stringify(data) }),
  // Super admin modules
  admins: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return apiFetch(`/tenants/admins?${qs}`)
  },
  createAdmin: (data) =>
    apiFetch('/tenants/admins', { method: 'POST', body: JSON.stringify(data) }),
  toggleAdmin: (id) =>
    apiFetch(`/tenants/admins/${id}/toggle`, { method: 'PATCH' }),
  auditLogs: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return apiFetch(`/tenants/audit-logs?${qs}`)
  },
  reports: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return apiFetch(`/tenants/reports?${qs}`)
  },
  sales: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return apiFetch(`/tenants/sales?${qs}`)
  },
  health: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return apiFetch(`/tenants/health?${qs}`)
  },
  subscriptionAnalytics: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return apiFetch(`/tenants/subscription-analytics?${qs}`)
  },
  pawnVolume: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return apiFetch(`/tenants/pawn-volume?${qs}`)
  },
  rankings: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return apiFetch(`/tenants/rankings?${qs}`)
  },
  platformSettings: {
    get: () => apiFetch('/tenants/platform-settings'),
    update: (data) =>
      apiFetch('/tenants/platform-settings', { method: 'PUT', body: JSON.stringify(data) }),
  },
}

// ── Backup ─────────────────────────────────────────────
export const backupApi = {
  generate: (data) =>
    apiFetch('/backup/generate', {
      method: 'POST',
      body: JSON.stringify(data),
      rawResponse: true,
    }),
  preview: async (file) => {
    const text = await file.text()
    return apiFetch('/backup/restore', { method: 'POST', body: text })
  },
  restore: async (file) => {
    const text = await file.text()
    return apiFetch('/backup/restore?confirm=true', { method: 'POST', body: text })
  },
  history: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return apiFetch(`/backup/history?${qs}`)
  },
}

// ── Subscriptions ───────────────────────────────────────
export const subscriptionsApi = {
  get: () => apiFetch('/subscriptions'),
  create: (data) =>
    apiFetch('/subscriptions', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) =>
    apiFetch(`/subscriptions/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  checkout: (data) =>
    apiFetch('/subscriptions/checkout', { method: 'POST', body: JSON.stringify(data) }),
  verify: (id) => apiFetch('/subscriptions/verify', { method: 'POST', body: JSON.stringify({ subscription_id: id }) }),
};

// ── Reports ─────────────────────────────────────────────
export const reportsApi = {
  loans: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/reports/loans?${qs}`);
  },
  revenue: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/reports/revenue?${qs}`);
  },
  customers: () => apiFetch('/reports/customers'),
  inventory: () => apiFetch('/reports/inventory'),
  dailyTransactions: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/reports/daily-transactions?${qs}`);
  },
  overdueLoans: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/reports/overdue-loans?${qs}`);
  },
  branchComparison: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/reports/branch-comparison?${qs}`);
  },
  customerHistory: (customerId) => apiFetch(`/reports/customer-history/${customerId}`),
};

// ── Appraisals ────────────────────────────────────────
export const appraisalsApi = {
  queue: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/appraisals/queue?${qs}`);
  },
  get: (id) => apiFetch(`/appraisals/${id}`),
  stats: () => apiFetch('/appraisals/stats'),
  calculate: (data) =>
    apiFetch('/appraisals/calculate', { method: 'POST', body: JSON.stringify(data) }),
  submit: (data) =>
    apiFetch('/appraisals/submit', { method: 'POST', body: JSON.stringify(data) }),
  appraise: (itemId, data) =>
    apiFetch(`/appraisals/${itemId}/appraise`, { method: 'PATCH', body: JSON.stringify(data) }),
  approve: (itemId, data) =>
    apiFetch(`/appraisals/${itemId}/approve`, { method: 'POST', body: JSON.stringify(data) }),
  reject: (itemId, data) =>
    apiFetch(`/appraisals/${itemId}/reject`, { method: 'POST', body: JSON.stringify(data) }),
  myItems: () => apiFetch('/appraisals/my-items'),
  intake: (data) =>
    apiFetch('/appraisals/intake', { method: 'POST', body: JSON.stringify(data) }),
  issue: (itemId, data) =>
    apiFetch(`/appraisals/${itemId}/issue`, { method: 'POST', body: JSON.stringify(data) }),
  decline: (itemId, data) =>
    apiFetch(`/appraisals/${itemId}/decline`, { method: 'POST', body: JSON.stringify(data) }),
};

// ── Renewals ──────────────────────────────────────────
export const renewalsApi = {
  process: (data) =>
    apiFetch('/renewals', { method: 'POST', body: JSON.stringify(data) }),
  history: (ticketId) => apiFetch(`/renewals/history/${ticketId}`),
};

// ── Payments ──────────────────────────────────────────
export const paymentsApi = {
  process: (data) =>
    apiFetch('/payments', { method: 'POST', body: JSON.stringify(data) }),
  summary: (ticketId) => apiFetch(`/payments/summary/${ticketId}`),
};

// ── Dispositions ──────────────────────────────────────
export const dispositionsApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/dispositions?${qs}`);
  },
  approve: (data) =>
    apiFetch('/dispositions/approve', { method: 'POST', body: JSON.stringify(data) }),
};

// ── Loan Settings ─────────────────────────────────────
export const loanSettingsApi = {
  get: () => apiFetch('/loan-settings'),
  update: (data) =>
    apiFetch('/loan-settings', { method: 'PATCH', body: JSON.stringify(data) }),
  goldRates: () => apiFetch('/loan-settings/gold-rates'),
  updateGoldRate: (data) =>
    apiFetch('/loan-settings/gold-rates', { method: 'PUT', body: JSON.stringify(data) }),
};

// ── Branding ─────────────────────────────────────────────
export const brandingApi = {
  get: () => apiFetch('/branding'),
  update: (data) =>
    apiFetch('/branding', { method: 'PUT', body: JSON.stringify(data) }),
  checkSubdomain: (slug) => apiFetch(`/branding/check-subdomain/${encodeURIComponent(slug)}`),
};

// ── Access Requests ─────────────────────────────────────
export const accessRequestsApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/access-requests/admin${qs ? '?' + qs : ''}`);
  },
  get: (id) => apiFetch(`/access-requests/admin/${id}`),
  approve: (id) =>
    apiFetch(`/access-requests/admin/${id}/approve`, { method: 'PATCH' }),
  reject: (id, notes) =>
    apiFetch(`/access-requests/admin/${id}/reject`, { method: 'PATCH', body: JSON.stringify({ notes }) }),
};

// ── Cron ──────────────────────────────────────────────
export const cronApi = {
  checkOverdue: () => apiFetch('/cron/check-overdue', { method: 'POST' }),
  autoExpire: () => apiFetch('/cron/auto-expire', { method: 'POST' }),
  runAll: () => apiFetch('/cron/run-all', { method: 'POST' }),
};

// ── Upload ────────────────────────────────────────────
export const uploadApi = {
  imagekitAuth: () => apiFetch('/upload/imagekit-auth'),
};

// ── Exports (CSV downloads) ──────────────────────────────
export const exportsApi = {
  download: async (reportType, params = {}) => {
    const token = getToken();
    const qs = new URLSearchParams(params).toString();
    const url = `${API_BASE}/exports/${reportType}${qs ? '?' + qs : ''}`;
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = res.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || `${reportType}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  },
};

// ── Pricing ───────────────────────────────────────────
export const pricingApi = {
  // Gold
  getGoldRates: () => apiFetch('/loan-settings/gold-rates'),
  updateGoldRates: (rates) =>
    apiFetch('/loan-settings/gold-rates/bulk', { method: 'PUT', body: JSON.stringify({ rates }) }),
  getGoldHistory: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/loan-settings/gold-rates/history?${qs}`);
  },
  // Silver
  getSilverRates: () => apiFetch('/pricing/silver-rates'),
  updateSilverRates: (rates) =>
    apiFetch('/pricing/silver-rates/bulk', { method: 'PUT', body: JSON.stringify({ rates }) }),
  getSilverHistory: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/pricing/silver-rates/history?${qs}`);
  },
  // Item Conditions
  getItemConditions: () => apiFetch('/pricing/item-conditions'),
  updateItemConditions: (conditions) =>
    apiFetch('/pricing/item-conditions', { method: 'PUT', body: JSON.stringify({ conditions }) }),
};

// ── Audit Logs ───────────────────────────────────────────
export const auditLogApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/audit-logs?${qs}`);
  },
};

// ── Locations (PH provinces + cities) ──────────────────
export const locationsApi = {
  provinces: () => apiFetch('/locations/provinces'),
  cities: (province) => apiFetch(`/locations/cities/${encodeURIComponent(province)}`),
  barangays: (province, city) => apiFetch(`/locations/barangays/${encodeURIComponent(province)}/${encodeURIComponent(city)}`),
};
