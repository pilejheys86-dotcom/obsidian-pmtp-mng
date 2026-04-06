import { useEffect, useMemo, useState } from 'react';
import { Sidebar, Header } from '../../components/layout';
import { Pagination, StatsCard, StatusBadge, Modal, EmptyState } from '../../components/ui';
import { getNavigationByRole } from '../../config';
import { useAuth } from '../../context';
import { pawnItemsApi, dispositionsApi } from '../../lib/api';

// ── Detail view helpers ──

const CATEGORY_ICONS = {
  JEWELRY: 'diamond',
  VEHICLE: 'directions_car',
  GADGET: 'smartphone',
  APPLIANCE: 'kitchen',
  OTHER: 'category',
};

const TICKET_STATUS_STYLES = {
  ACTIVE: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
  REDEEMED: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400',
  EXPIRED: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
  FORFEITED: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
  RENEWED: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
};

const DetailCard = ({ icon, title, children }) => (
  <div className="dashboard-card p-5">
    <div className="flex items-center gap-2.5 mb-4">
      <span className="material-symbols-outlined text-lg text-neutral-400 dark:text-neutral-500">{icon}</span>
      <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">{title}</h3>
    </div>
    {children}
  </div>
);

const Field = ({ label, value, mono }) => (
  <div>
    <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-0.5">{label}</p>
    <p className={`text-sm font-medium text-neutral-800 dark:text-neutral-100 ${mono ? 'font-mono' : ''}`}>{value || '---'}</p>
  </div>
);

const CATEGORIES = ['All', 'JEWELRY', 'VEHICLE', 'GADGET', 'APPLIANCE', 'OTHER'];
const STATUSES = ['All', 'IN_VAULT', 'APPRAISED', 'REDEEMED', 'FORFEITED', 'FOR_AUCTION', 'AUCTIONED', 'MELTED'];

const STATUS_BADGE_MAP = {
  PENDING_APPRAISAL: { label: 'Pending Appraisal', type: 'warning' },
  UNDER_APPRAISAL: { label: 'Under Appraisal', type: 'warning' },
  APPRAISED: { label: 'Appraised', type: 'info' },
  IN_VAULT: { label: 'In Vault', type: 'success' },
  REDEEMED: { label: 'Redeemed', type: 'info' },
  FORFEITED: { label: 'Forfeited', type: 'danger' },
  FOR_AUCTION: { label: 'For Auction', type: 'warning' },
  AUCTIONED: { label: 'Auctioned', type: 'neutral' },
  MELTED: { label: 'Melted', type: 'neutral' },
  DECLINED: { label: 'Declined', type: 'neutral' },
};

const formatCurrency = (val) =>
  `\u20B1${Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── Item Detail View (matching CustomerProfile layout) ──────────────

const ItemDetail = ({ item, canApproveDisposition, onBack, onDisposition }) => {
  const [fullItem, setFullItem] = useState(null);
  const [detailLoading, setDetailLoading] = useState(true);

  useEffect(() => {
    if (!item?.id) return;
    setDetailLoading(true);
    pawnItemsApi.get(item.id)
      .then((data) => setFullItem(data))
      .catch(() => setFullItem(item))
      .finally(() => setDetailLoading(false));
  }, [item]);

  const data = fullItem || item;
  const customerName = data.customers
    ? `${data.customers.first_name || ''} ${data.customers.last_name || ''}`.trim()
    : 'N/A';
  const branchName = data.branches?.branch_name || '---';
  const tickets = data.pawn_tickets || [];
  const images = data.item_images || [];
  const attrs = data.specific_attrs || {};
  const categoryIcon = CATEGORY_ICONS[data.category] || 'category';

  // Collect spec fields that exist
  const specFields = [
    data.weight_grams && ['Weight', `${data.weight_grams}g`],
    data.karat && ['Karat', `${data.karat}K`],
    data.brand && ['Brand', data.brand],
    data.model && ['Model', data.model],
    data.serial_number && ['Serial #', data.serial_number, true],
  ].filter(Boolean);

  // Build readable fields from specific_attrs
  const HIDDEN_ATTRS = ['loan_terms', 'appraised_by', 'submitted_by', 'issued_by', 'assessment_id',
    'appraised_by_name', 'submitted_by_name', 'issued_by_name'];
  const fmtDate = (iso) => {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  // Human-readable mapped fields
  const processedFields = [];
  if (attrs.appraised_at) processedFields.push(['Appraised At', fmtDate(attrs.appraised_at)]);
  if (attrs.appraised_by_name) processedFields.push(['Appraised By', attrs.appraised_by_name]);
  if (attrs.submitted_at) processedFields.push(['Submitted At', fmtDate(attrs.submitted_at)]);
  if (attrs.submitted_by_name) processedFields.push(['Submitted By', attrs.submitted_by_name]);
  if (attrs.issued_by_name) processedFields.push(['Issued By', attrs.issued_by_name]);

  // Other user-facing attrs (not internal, not objects, not UUIDs)
  const attrFields = [
    ...processedFields,
    ...Object.entries(attrs)
      .filter(([key, val]) => !HIDDEN_ATTRS.includes(key) && val != null && val !== '' && typeof val !== 'object')
      .filter(([key]) => !['appraised_at', 'submitted_at'].includes(key))
      .filter(([, val]) => !/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(String(val)))
      .filter(([, val]) => !/^\d{4}-\d{2}-\d{2}T/.test(String(val)))
      .map(([key, val]) => [
        key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        String(val),
      ]),
  ];

  return (
    <div>
      {/* Back + breadcrumb */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={onBack}
          className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
        >
          <span className="material-symbols-outlined text-xl">arrow_back</span>
        </button>
        <div>
          <nav className="flex mb-1" aria-label="Breadcrumb">
            <ol className="flex items-center space-x-2">
              <li><span className="text-neutral-400 dark:text-neutral-500 text-xs font-medium">Operations</span></li>
              <li><span className="text-neutral-300 dark:text-neutral-600 text-xs">/</span></li>
              <li><button onClick={onBack} className="text-neutral-400 dark:text-neutral-500 text-xs font-medium hover:text-primary transition-colors cursor-pointer">Inventory</button></li>
              <li><span className="text-neutral-300 dark:text-neutral-600 text-xs">/</span></li>
              <li><span className="text-neutral-700 dark:text-white text-xs font-semibold">Item Details</span></li>
            </ol>
          </nav>
          <h1 className="text-xl font-display font-bold text-neutral-800 dark:text-neutral-100">Item Details</h1>
        </div>
      </div>

      {detailLoading ? (
        <div className="flex items-center justify-center py-20">
          <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
        </div>
      ) : (
        <>
          {/* ── Hero header card ───────────────── */}
          <div className="dashboard-card p-6 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className="w-12 h-12 rounded-lg bg-neutral-100 dark:bg-neutral-700 flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-2xl text-neutral-500 dark:text-neutral-300">{categoryIcon}</span>
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-display font-bold text-neutral-900 dark:text-white truncate">
                    {data.general_desc || data.description || 'Unnamed Item'}
                  </h2>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <span className="text-xs text-neutral-400 dark:text-neutral-500 font-mono">ITM-{String(data.id).slice(0, 8).toUpperCase()}</span>
                    <span className="w-1 h-1 rounded-full bg-neutral-300 dark:bg-neutral-600" />
                    <span className="text-xs text-neutral-400 dark:text-neutral-500">
                      {data.category ? data.category.charAt(0) + data.category.slice(1).toLowerCase() : '---'}
                    </span>
                    {data.created_at && (
                      <>
                        <span className="w-1 h-1 rounded-full bg-neutral-300 dark:bg-neutral-600" />
                        <span className="text-xs text-neutral-400 dark:text-neutral-500">
                          Added {new Date(data.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 flex-shrink-0">
                <StatusBadge
                  status={STATUS_BADGE_MAP[data.inventory_status]?.label || data.inventory_status || 'N/A'}
                  type={STATUS_BADGE_MAP[data.inventory_status]?.type || 'neutral'}
                />
                <div className="pl-4 border-l border-neutral-200/60 dark:border-neutral-700/50 text-right">
                  <p className="text-2xl font-extrabold text-primary leading-tight">{formatCurrency(data.appraised_value)}</p>
                  <p className="text-[10px] text-neutral-400 dark:text-neutral-500 font-medium uppercase tracking-wider">Appraised Value</p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Disposition banner (forfeited items) ── */}
          {data.inventory_status === 'FORFEITED' && canApproveDisposition && (
            <div className="flex items-center justify-between gap-4 p-4 mb-6 rounded-sm border border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-900/10">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-amber-500">warning</span>
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400">This item has been forfeited and requires a disposition decision.</p>
              </div>
              <button
                onClick={() => onDisposition(data)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-sm transition-colors cursor-pointer flex-shrink-0"
              >
                <span className="material-symbols-outlined text-sm">gavel</span>
                Approve Disposition
              </button>
            </div>
          )}

          {/* ── Photos strip ─────────────────── */}
          {images.length > 0 && (
            <div className="flex gap-3 mb-6 overflow-x-auto pb-2 custom-scrollbar">
              {images.map((img, i) => (
                <div key={img.id || i} className="relative w-28 h-28 rounded-lg overflow-hidden bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 flex-shrink-0">
                  <img
                    src={img.image_url}
                    alt={`Item photo ${i + 1}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {img.is_primary && (
                    <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-primary/90 text-[9px] font-bold text-neutral-900 uppercase">
                      Primary
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── Detail cards ───────────────────── */}
          <div className="space-y-6">

            {/* Overview + Specs combined */}
            <DetailCard icon="info" title="Details">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-4">
                <Field label="Customer" value={customerName} />
                <Field label="Condition" value={data.item_condition} />
                <Field label="Branch" value={branchName} />
                {specFields.map(([label, value, mono]) => (
                  <Field key={label} label={label} value={value} mono={mono} />
                ))}
                {attrFields.map(([label, value]) => (
                  <Field key={label} label={label} value={value} />
                ))}
              </div>
              {data.condition_notes && (
                <p className="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800 text-xs text-neutral-500 dark:text-neutral-400">
                  {data.condition_notes}
                </p>
              )}
            </DetailCard>

            {/* Loan history (only if tickets exist) */}
            {tickets.length > 0 && (
              <DetailCard icon="receipt_long" title="Loan History">
                <div className="overflow-x-auto -mx-5 px-5">
                  <table className="min-w-full text-left">
                    <thead>
                      <tr className="border-b border-neutral-200/60 dark:border-neutral-700/50">
                        <th className="pr-4 pb-2 text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Ticket #</th>
                        <th className="px-4 pb-2 text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Principal</th>
                        <th className="px-4 pb-2 text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Maturity</th>
                        <th className="pl-4 pb-2 text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700/30">
                      {tickets.map((t) => (
                        <tr key={t.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                          <td className="pr-4 py-2.5 text-sm font-mono font-medium text-neutral-700 dark:text-neutral-300">
                            {t.ticket_number || `TKT-${String(t.id).slice(0, 8).toUpperCase()}`}
                          </td>
                          <td className="px-4 py-2.5 text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                            {Number(t.principal_loan || 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })}
                          </td>
                          <td className="px-4 py-2.5 text-sm text-neutral-500 dark:text-neutral-400">
                            {t.maturity_date
                              ? new Date(t.maturity_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
                              : '---'}
                          </td>
                          <td className="pl-4 py-2.5">
                            <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${TICKET_STATUS_STYLES[t.status] || ''}`}>
                              {t.status || 'N/A'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </DetailCard>
            )}
          </div>
        </>
      )}
    </div>
  );
};

const Inventory = () => {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({ totalItems: 0, inVault: 0, totalValue: 0, forfeitedThisMonth: 0 });
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [view, setView] = useState('list'); // 'list' | 'detail'
  const [selectedItem, setSelectedItem] = useState(null);
  const [dispositionModal, setDispositionModal] = useState(null);
  const [dispositionPath, setDispositionPath] = useState('FOR_AUCTION');
  const [releaseModal, setReleaseModal] = useState(null);
  const [releasing, setReleasing] = useState(false);
  const [auctionBasePrice, setAuctionBasePrice] = useState('');
  const [meltingValue, setMeltingValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [currentPath, setCurrentPath] = useState('/admin/inventory');

  const { profile } = useAuth();
  const navigation = getNavigationByRole(profile?.role);
  const itemsPerPage = 10;

  const currentUser = useMemo(() => ({
    name: profile?.full_name || 'User',
    role: profile?.role || 'Admin',
    initials: (profile?.full_name || 'U').split(' ').map((n) => n[0]).join('').slice(0, 2),
  }), [profile]);

  const canApproveDisposition = useMemo(() => {
    const role = profile?.role?.toUpperCase();
    return role === 'OWNER' || role === 'MANAGER';
  }, [profile]);

  // Debounce search input (400ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch data whenever filters or page change
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const params = {
          page: currentPage,
          limit: itemsPerPage,
        };
        if (debouncedSearch) params.search = debouncedSearch;
        if (categoryFilter !== 'All') params.category = categoryFilter;
        if (statusFilter !== 'All') params.status = statusFilter;

        const [statsRes, listRes] = await Promise.all([
          pawnItemsApi.stats(),
          pawnItemsApi.list(params),
        ]);

        setStats(statsRes);
        setItems(listRes.data || []);
        setTotalItems(listRes.total || 0);
      } catch (err) {
        console.error('Inventory fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [currentPage, debouncedSearch, categoryFilter, statusFilter]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [categoryFilter, statusFilter]);

  const statsData = [
    {
      icon: 'inventory_2',
      iconBg: 'bg-primary',
      iconColor: 'text-white',
      label: 'Total Items',
      value: String(stats.totalItems || 0),
    },
    {
      icon: 'lock',
      iconBg: 'bg-blue-500',
      iconColor: 'text-white',
      label: 'In Vault',
      value: String(stats.inVault || 0),
    },
    {
      icon: 'payments',
      iconBg: 'bg-purple-500',
      iconColor: 'text-white',
      label: 'Total Value',
      value: formatCurrency(stats.totalValue),
    },
    {
      icon: 'warning',
      iconBg: 'bg-amber-500',
      iconColor: 'text-white',
      label: 'Forfeited This Month',
      value: String(stats.forfeitedThisMonth || 0),
    },
  ];

  const handleViewDetail = (item) => {
    setSelectedItem(item);
    setView('detail');
  };

  const handleReleaseItem = async () => {
    if (!releaseModal) return;
    try {
      setReleasing(true);
      // Mark as released by adding a note in specific_attrs
      const attrs = releaseModal.specific_attrs || {};
      await pawnItemsApi.update(releaseModal.id, {
        specific_attrs: { ...attrs, released: true, released_at: new Date().toISOString(), released_by: profile?.id },
      });
      setReleaseModal(null);
      // Refresh
      const [statsRes, listRes] = await Promise.all([
        pawnItemsApi.stats(),
        pawnItemsApi.list({ page: currentPage, limit: itemsPerPage }),
      ]);
      setStats(statsRes);
      setItems(listRes.data || []);
      setTotalItems(listRes.pagination?.total || 0);
    } catch (err) {
      console.error('Release error:', err);
    } finally {
      setReleasing(false);
    }
  };

  const handleDispositionSubmit = async () => {
    if (!dispositionModal) return;
    try {
      setSubmitting(true);
      const payload = {
        item_id: dispositionModal.id,
        disposition_path: dispositionPath,
      };
      if (dispositionPath === 'FOR_AUCTION' && auctionBasePrice) {
        payload.auction_base_price = Number(auctionBasePrice);
      }
      if (dispositionPath === 'FOR_MELTING' && meltingValue) {
        payload.melting_value = Number(meltingValue);
      }
      await dispositionsApi.approve(payload);
      setDispositionModal(null);
      // Refresh data
      const [statsRes, listRes] = await Promise.all([
        pawnItemsApi.stats(),
        pawnItemsApi.list({
          page: currentPage,
          limit: itemsPerPage,
          ...(searchQuery ? { search: searchQuery } : {}),
          ...(categoryFilter !== 'All' ? { category: categoryFilter } : {}),
          ...(statusFilter !== 'All' ? { status: statusFilter } : {}),
        }),
      ]);
      setStats(statsRes);
      setItems(listRes.data || []);
      setTotalItems(listRes.total || 0);
    } catch (err) {
      console.error('Disposition error:', err);
      alert(err.message || 'Failed to approve disposition.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleNavigate = (path) => {
    setCurrentPath(path);
  };

  const getCustomerName = (item) => {
    if (item.customer_name) return item.customer_name;
    if (item.customers) return `${item.customers.first_name || ''} ${item.customers.last_name || ''}`.trim();
    return '---';
  };

  return (
    <div className="admin-layout">
      <Sidebar
        navigation={navigation}
        currentPath={currentPath}
        onNavigate={handleNavigate}
      />

      <main className="admin-main">
        <Header user={currentUser} />
        <div className="admin-content custom-scrollbar">

          {/* ── Detail View ──────────────────────────────── */}
          {view === 'detail' && selectedItem && (
            <ItemDetail
              item={selectedItem}
              canApproveDisposition={canApproveDisposition}
              onBack={() => { setView('list'); setSelectedItem(null); }}
              onDisposition={(item) => {
                setDispositionPath('FOR_AUCTION');
                setAuctionBasePrice('');
                setMeltingValue('');
                setDispositionModal(item);
              }}
            />
          )}

          {view === 'list' && (
          <>
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <nav className="flex mb-2" aria-label="Breadcrumb">
                <ol className="flex items-center space-x-2">
                  <li>
                    <span className="text-neutral-400 dark:text-neutral-500 text-sm font-medium">Operations</span>
                  </li>
                  <li>
                    <span className="text-neutral-300 dark:text-neutral-600 text-sm">/</span>
                  </li>
                  <li>
                    <span className="text-neutral-700 dark:text-white text-sm font-semibold">Inventory</span>
                  </li>
                </ol>
              </nav>
              <h1 className="text-2xl font-display font-bold text-neutral-800 dark:text-neutral-100">
                Inventory Management
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <button className="header-icon-btn">
                <span className="material-symbols-outlined">notifications</span>
                <span className="notification-dot" />
              </button>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {statsData.map((stat, index) => (
              <StatsCard key={index} {...stat} />
            ))}
          </div>

          {/* Filters Row */}
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between mb-6">
            <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto items-center">
              {/* Search */}
              <div className="relative w-full sm:w-96 group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="material-symbols-outlined text-neutral-400 dark:text-neutral-500 group-focus-within:text-primary transition-colors">
                    search
                  </span>
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="loans-search"
                  placeholder="Search items, ID or description..."
                />
              </div>
            </div>
            <div className="flex items-center gap-3 w-full lg:w-auto justify-end">
              <div className="relative">
                <select
                  className="loans-select"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat === 'All' ? 'All Categories' : cat.charAt(0) + cat.slice(1).toLowerCase()}
                    </option>
                  ))}
                </select>
              </div>
              <div className="relative">
                <select
                  className="loans-select"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  {STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {st === 'All' ? 'All Statuses' : st.charAt(0) + st.slice(1).toLowerCase().replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </div>
              <button className="filter-btn">
                <span className="material-symbols-outlined text-xl">filter_list</span>
              </button>
            </div>
          </div>

          {/* Data Table */}
          <div className="loans-table-container">
            <div className="overflow-x-auto custom-scrollbar flex-1">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                </div>
              ) : items.length === 0 ? (
                <EmptyState
                  icon="inventory_2"
                  title="No items found"
                  description="Try adjusting your search or filters to find what you're looking for."
                />
              ) : (
                <table className="min-w-full text-center text-sm whitespace-nowrap">
                  <thead className="loans-table-header">
                    <tr>
                      <th scope="col" className="table-th text-center">Item ID</th>
                      <th scope="col" className="table-th text-center">Customer Name</th>
                      <th scope="col" className="table-th text-center">Category</th>
                      <th scope="col" className="table-th text-center">Description</th>
                      <th scope="col" className="table-th text-center">Condition</th>
                      <th scope="col" className="table-th text-center">Appraised Value</th>
                      <th scope="col" className="table-th text-center">Status</th>
                      <th scope="col" className="table-th text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {items.map((item) => (
                      <tr key={item.id} className="loan-row" onClick={() => handleViewDetail(item)}>
                        <td className="px-6 py-4 text-center font-mono text-primary text-sm">
                          {(item.id || '').slice(0, 8).toUpperCase()}
                        </td>
                        <td className="px-4 py-4 text-center text-sm font-semibold text-neutral-800 dark:text-white">
                          {getCustomerName(item)}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="px-3 py-1 rounded-full bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 text-xs font-semibold">
                            {item.category || 'N/A'}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center text-sm text-neutral-600 dark:text-neutral-400 max-w-xs truncate">
                          {item.general_desc || item.description || 'N/A'}
                        </td>
                        <td className="px-4 py-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
                          {item.item_condition || 'N/A'}
                        </td>
                        <td className="px-6 py-4 text-center text-sm font-bold text-neutral-800 dark:text-white">
                          {formatCurrency(item.appraised_value)}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <StatusBadge
                            status={STATUS_BADGE_MAP[item.inventory_status]?.label || item.inventory_status || 'N/A'}
                            type={STATUS_BADGE_MAP[item.inventory_status]?.type || 'neutral'}
                          />
                        </td>
                        <td className="px-4 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {item.inventory_status === 'REDEEMED' && !item.specific_attrs?.released && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setReleaseModal(item); }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-sm text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                              >
                                <span className="material-symbols-outlined text-sm">inventory_2</span>Release
                              </button>
                            )}
                            {item.inventory_status === 'REDEEMED' && item.specific_attrs?.released && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-sm text-xs font-semibold text-neutral-400 dark:text-neutral-500">
                                <span className="material-symbols-outlined text-sm">check_circle</span>Released
                              </span>
                            )}
                            <span className="material-symbols-outlined text-neutral-400 dark:text-neutral-500 text-lg">chevron_right</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {!loading && items.length > 0 && (
              <Pagination
                currentPage={currentPage}
                totalPages={Math.max(1, Math.ceil(totalItems / itemsPerPage))}
                totalItems={totalItems}
                itemsPerPage={itemsPerPage}
                itemLabel="items"
                onPageChange={setCurrentPage}
              />
            )}
          </div>
          </>
          )}
        </div>
      </main>

      {/* Disposition Modal */}
      <Modal
        open={!!dispositionModal}
        onClose={() => setDispositionModal(null)}
        title="Approve Disposition"
        size="md"
      >
        {dispositionModal && (
          <div className="space-y-5">
            <div className="bg-neutral-50 dark:bg-neutral-700/30 rounded-lg p-4">
              <p className="text-xs font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider mb-1">Item</p>
              <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                {dispositionModal.general_desc || dispositionModal.description || 'N/A'}
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                ID: {(dispositionModal.id || '').slice(0, 8).toUpperCase()} &bull; Appraised: {formatCurrency(dispositionModal.appraised_value)}
              </p>
            </div>

            <div>
              <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-200 mb-3">Disposition Path</p>
              <div className="space-y-3">
                <label className="flex items-center gap-3 p-3 rounded-lg border border-neutral-200 dark:border-neutral-700 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-700/30 transition-colors">
                  <input
                    type="radio"
                    name="disposition"
                    value="FOR_AUCTION"
                    checked={dispositionPath === 'FOR_AUCTION'}
                    onChange={(e) => setDispositionPath(e.target.value)}
                    className="w-4 h-4 text-primary accent-primary"
                  />
                  <div>
                    <span className="text-sm font-medium text-neutral-800 dark:text-neutral-100">For Auction</span>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">Send item to public auction</p>
                  </div>
                </label>
                {dispositionPath === 'FOR_AUCTION' && (
                  <div className="pl-10">
                    <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                      Auction Base Price
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-neutral-400 text-sm pointer-events-none">\u20B1</span>
                      <input
                        type="number"
                        value={auctionBasePrice}
                        onChange={(e) => setAuctionBasePrice(e.target.value)}
                        placeholder="0.00"
                        min="0"
                        step="0.01"
                        className="w-full pl-8 pr-4 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-800 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                      />
                    </div>
                  </div>
                )}

                <label className="flex items-center gap-3 p-3 rounded-lg border border-neutral-200 dark:border-neutral-700 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-700/30 transition-colors">
                  <input
                    type="radio"
                    name="disposition"
                    value="FOR_MELTING"
                    checked={dispositionPath === 'FOR_MELTING'}
                    onChange={(e) => setDispositionPath(e.target.value)}
                    className="w-4 h-4 text-primary accent-primary"
                  />
                  <div>
                    <span className="text-sm font-medium text-neutral-800 dark:text-neutral-100">For Melting</span>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">Melt item for raw material value</p>
                  </div>
                </label>
                {dispositionPath === 'FOR_MELTING' && (
                  <div className="pl-10">
                    <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                      Melting Value
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-neutral-400 text-sm pointer-events-none">\u20B1</span>
                      <input
                        type="number"
                        value={meltingValue}
                        onChange={(e) => setMeltingValue(e.target.value)}
                        placeholder="0.00"
                        min="0"
                        step="0.01"
                        className="w-full pl-8 pr-4 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-800 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-100 dark:border-neutral-700/50">
              <button
                onClick={() => setDispositionModal(null)}
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-600 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDispositionSubmit}
                disabled={submitting}
                className="btn-primary disabled:opacity-50"
              >
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Processing...
                  </span>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-lg">check_circle</span>
                    Approve Disposition
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Release Item Modal */}
      <Modal
        open={!!releaseModal}
        onClose={() => setReleaseModal(null)}
        title="Release Item to Customer"
        size="sm"
      >
        {releaseModal && (
          <div className="space-y-5">
            <div className="flex flex-col items-center py-3">
              <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center mb-3">
                <span className="material-symbols-outlined text-3xl text-emerald-500">inventory_2</span>
              </div>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center">
                Confirm that the following item has been physically handed back to the customer.
              </p>
            </div>
            <div className="bg-neutral-50 dark:bg-neutral-900/50 rounded-lg p-4 space-y-2.5">
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500">Item</span>
                <span className="font-semibold text-neutral-800 dark:text-white">{releaseModal.general_desc || '---'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500">Category</span>
                <span className="text-neutral-700 dark:text-neutral-300">{releaseModal.category}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500">Customer</span>
                <span className="font-semibold text-neutral-800 dark:text-white">{getCustomerName(releaseModal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500">Appraised Value</span>
                <span className="font-bold text-primary">{formatCurrency(releaseModal.appraised_value)}</span>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setReleaseModal(null)} className="btn-outline">Cancel</button>
              <button
                onClick={handleReleaseItem}
                disabled={releasing}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm rounded-sm transition-colors disabled:opacity-50"
              >
                {releasing ? (
                  <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Releasing...</>
                ) : (
                  <><span className="material-symbols-outlined text-lg">assignment_turned_in</span>Confirm Item Released</>
                )}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Inventory;
