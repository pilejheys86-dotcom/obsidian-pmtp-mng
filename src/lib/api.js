const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

/**
 * Get the current Supabase session token from localStorage.
 */
const getToken = () => {
  const raw = localStorage.getItem('sb-auth-token');
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      return parsed.access_token;
    } catch {
      return raw;
    }
  }

  // Fallback: try to get from supabase stored session
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
      try {
        const session = JSON.parse(localStorage.getItem(key));
        return session?.access_token;
      } catch {
        continue;
      }
    }
  }
  return null;
};

/**
 * Base fetch helper with auth headers and error handling.
 */
const apiFetch = async (endpoint, options = {}) => {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
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
  get: (id) => apiFetch(`/tenants/${id}`),
  block: (id, data) =>
    apiFetch(`/tenants/${id}/block`, { method: 'POST', body: JSON.stringify(data) }),
  reactivate: (id) =>
    apiFetch(`/tenants/${id}/reactivate`, { method: 'POST' }),
  updatePlan: (id, data) =>
    apiFetch(`/tenants/${id}/plan`, { method: 'PATCH', body: JSON.stringify(data) }),
}

// ── Subscriptions ───────────────────────────────────────
export const subscriptionsApi = {
  get: () => apiFetch('/subscriptions'),
  create: (data) =>
    apiFetch('/subscriptions', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) =>
    apiFetch(`/subscriptions/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
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
};

// ── Appraisals ────────────────────────────────────────
export const appraisalsApi = {
  queue: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/appraisals/queue?${qs}`);
  },
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

// ── Branding ───────────────────────────────────────────
export const brandingApi = {
  get: () => apiFetch('/branding'),
  update: (data) => apiFetch('/branding', { method: 'PUT', body: JSON.stringify(data) }),
  checkSubdomain: (slug) => apiFetch(`/branding/check-subdomain/${encodeURIComponent(slug)}`),
};

// ── Locations (PH provinces + cities) ──────────────────
export const locationsApi = {
  provinces: () => apiFetch('/locations/provinces'),
  cities: (province) => apiFetch(`/locations/cities/${encodeURIComponent(province)}`),
  barangays: (province, city) => apiFetch(`/locations/barangays/${encodeURIComponent(province)}/${encodeURIComponent(city)}`),
};
