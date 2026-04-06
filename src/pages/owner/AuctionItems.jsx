import { useEffect, useMemo, useState } from 'react';
import { Sidebar, Header } from '../../components/layout';
import { Pagination, StatsCard, StatusBadge, ActionMenu, Modal, EmptyState } from '../../components/ui';
import { getNavigationByRole } from '../../config';
import { useAuth } from '../../context';
import { auctionsApi } from '../../lib/api';

// Payment method options
const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'GCASH', label: 'GCash' },
  { value: 'PAYMAYA', label: 'PayMaya' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
];

// Category filter tabs
const CATEGORIES = ['All', 'Jewelry', 'Electronics', 'Watches', 'Other'];

// Auction status → badge type mapping
const AUCTION_STATUS_MAP = {
  SCHEDULED: 'neutral',
  COMPLETED: 'info',
  CANCELLED: 'danger',
  ACTIVE: 'success',
  SOLD: 'info',
};

// Gallery Card Component
const AuctionCard = ({ lot, onRecordSale }) => {
  const imageUrl = lot.pawn_items?.item_images?.[0]?.image_url;
  const status = lot.status || 'SCHEDULED';
  const statusType = AUCTION_STATUS_MAP[status] || 'neutral';
  const isSold = status === 'SOLD' || status === 'COMPLETED';

  return (
    <div className="auction-card group">
      {/* Image */}
      <div className="auction-card-image-wrapper">
        {imageUrl ? (
          <img
            alt={lot.pawn_items?.general_desc || 'Auction item'}
            className="auction-card-image"
            src={imageUrl}
          />
        ) : (
          <div className="w-full h-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
            <span className="material-symbols-outlined text-4xl text-neutral-300 dark:text-neutral-600">image</span>
          </div>
        )}
        <div className="absolute top-4 left-4">
          <StatusBadge status={status} type={statusType} />
        </div>
      </div>

      {/* Content */}
      <div className="p-5 flex flex-col gap-3">
        <div>
          <p className="text-xs font-bold text-neutral-400 dark:text-neutral-500 mb-1">
            #{lot.lot_number || lot.id?.slice(0, 8) || 'N/A'}
          </p>
          <h3 className="text-base font-bold text-neutral-900 dark:text-white line-clamp-1">
            {lot.pawn_items?.general_desc || 'Untitled Item'}
          </h3>
        </div>

        <div className="flex justify-between items-center py-3 border-y border-neutral-100 dark:border-neutral-800">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Base Price</span>
            <span className="text-xl font-black text-primary">
              {'\u20B1'}{Number(lot.base_price || 0).toLocaleString()}
            </span>
          </div>
          {lot.pawn_items?.category && (
            <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest bg-neutral-100 dark:bg-neutral-700 px-2 py-1 rounded">
              {lot.pawn_items.category}
            </span>
          )}
        </div>

        {!isSold ? (
          <button
            onClick={() => onRecordSale(lot)}
            className="auction-card-btn-primary"
          >
            RECORD SALE
          </button>
        ) : (
          <button className="auction-card-btn-secondary" disabled>
            SOLD
          </button>
        )}
      </div>
    </div>
  );
};

// Compact Card Component
const AuctionCompactCard = ({ lot, onRecordSale }) => {
  const status = lot.status || 'SCHEDULED';
  const statusType = AUCTION_STATUS_MAP[status] || 'neutral';
  const isSold = status === 'SOLD' || status === 'COMPLETED';

  const statusColors = {
    success: 'text-primary bg-primary/10',
    neutral: 'text-neutral-400 bg-neutral-500/10',
    info: 'text-blue-400 bg-blue-500/10',
    danger: 'text-red-400 bg-red-500/10',
    warning: 'text-amber-400 bg-amber-500/10',
  };

  return (
    <div className="auction-compact-card">
      {/* Header row: ID + Status */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400">
          #{lot.lot_number || lot.id?.slice(0, 8) || 'N/A'}
        </span>
        <span className={`auction-compact-status ${statusColors[statusType] || statusColors.neutral}`}>
          {status}
        </span>
      </div>

      {/* Item Name */}
      <h3 className="text-sm font-bold text-neutral-900 dark:text-white mb-3 line-clamp-1">
        {lot.pawn_items?.general_desc || 'Untitled Item'}
      </h3>

      {/* Price row */}
      <div className="flex items-end justify-between mb-4">
        <div className="flex flex-col">
          <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Base Price</span>
          <span className="text-xl font-black text-primary">
            {'\u20B1'}{Number(lot.base_price || 0).toLocaleString()}
          </span>
        </div>
        {lot.pawn_items?.category && (
          <span className="text-[10px] font-bold text-neutral-500 uppercase">
            {lot.pawn_items.category}
          </span>
        )}
      </div>

      {/* Action */}
      <div className="flex gap-2">
        {!isSold ? (
          <button
            onClick={() => onRecordSale(lot)}
            className="auction-compact-btn-primary flex-1"
          >
            Record Sale
          </button>
        ) : (
          <button className="auction-compact-btn-outline flex-1" disabled>
            Sold
          </button>
        )}
      </div>
    </div>
  );
};

// ── Sale Recording Modal ──────────────────────────────────
const SaleModal = ({ open, onClose, lot, onSuccess }) => {
  const [soldPrice, setSoldPrice] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [buyerContact, setBuyerContact] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (open) {
      setSoldPrice('');
      setBuyerName('');
      setBuyerContact('');
      setPaymentMethod('CASH');
    }
  }, [open]);

  if (!lot) return null;

  const basePrice = Number(lot.base_price || 0);
  const numericSoldPrice = Number(soldPrice) || 0;
  const profitLoss = numericSoldPrice - basePrice;
  const isProfit = profitLoss >= 0;

  const handleSubmit = async () => {
    if (!numericSoldPrice || numericSoldPrice <= 0) return;
    setProcessing(true);
    try {
      await auctionsApi.recordSale(lot.id, {
        sold_price: numericSoldPrice,
        buyer_name: buyerName || undefined,
        buyer_contact: buyerContact || undefined,
        payment_method: paymentMethod,
      });
      onSuccess();
    } catch (err) {
      console.error('Record sale error:', err);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Record Sale" size="sm">
      <div className="space-y-5">
        {/* Lot Info */}
        <div className="text-sm text-neutral-600 dark:text-neutral-300">
          <p className="font-semibold text-neutral-800 dark:text-neutral-100 mb-1">
            {lot.pawn_items?.general_desc || 'Auction Lot'}
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Base Price: {'\u20B1'}{basePrice.toLocaleString()}
          </p>
        </div>

        {/* Sold Price */}
        <div>
          <label className="block text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-2">
            Sold Price *
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">{'\u20B1'}</span>
            <input
              type="number"
              value={soldPrice}
              onChange={(e) => setSoldPrice(e.target.value)}
              min={0}
              step={0.01}
              placeholder="0.00"
              className="w-full pl-8 pr-3 py-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </div>

        {/* Profit/Loss Indicator */}
        {numericSoldPrice > 0 && (
          <div className={`rounded-lg p-3 text-sm font-bold ${isProfit ? 'bg-primary/10 text-primary' : 'bg-red-500/10 text-red-500'}`}>
            {isProfit ? 'Profit' : 'Loss'}: {'\u20B1'}{Math.abs(profitLoss).toLocaleString()}
          </div>
        )}

        {/* Buyer Name */}
        <div>
          <label className="block text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-2">
            Buyer Name
          </label>
          <input
            type="text"
            value={buyerName}
            onChange={(e) => setBuyerName(e.target.value)}
            placeholder="Optional"
            className="w-full px-3 py-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {/* Buyer Contact */}
        <div>
          <label className="block text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-2">
            Buyer Contact
          </label>
          <input
            type="text"
            value={buyerContact}
            onChange={(e) => setBuyerContact(e.target.value)}
            placeholder="Optional"
            className="w-full px-3 py-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {/* Payment Method */}
        <div>
          <label className="block text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-2">
            Payment Method
          </label>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={processing || numericSoldPrice <= 0}
          className="w-full btn-primary py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {processing ? 'Processing...' : 'Record Sale'}
        </button>
      </div>
    </Modal>
  );
};

// ── Main Component ────────────────────────────────────────
const AuctionItems = () => {
  const [lots, setLots] = useState([]);
  const [stats, setStats] = useState({ totalAuctions: 0, scheduledAuctions: 0, totalLots: 0, soldThisMonth: 0, totalValue: 0 });
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeCategory, setActiveCategory] = useState('All');
  const [displayMode, setDisplayMode] = useState('gallery');
  const [currentPath, setCurrentPath] = useState('/admin/auction');
  const [saleModal, setSaleModal] = useState({ open: false, lot: null });

  const { profile } = useAuth();
  const navigation = getNavigationByRole(profile?.role);
  const itemsPerPage = 12;

  const currentUser = useMemo(() => ({
    name: profile?.full_name || 'User',
    role: profile?.role || 'Admin',
    initials: (profile?.full_name || 'U').split(' ').map((n) => n[0]).join('').slice(0, 2),
  }), [profile]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const params = {
        page: currentPage,
        limit: itemsPerPage,
        ...(activeCategory !== 'All' ? { category: activeCategory } : {}),
      };

      const [statsRes, lotsRes] = await Promise.all([
        auctionsApi.stats(),
        auctionsApi.lots(params),
      ]);

      setStats(statsRes || {});
      setLots(lotsRes.data || lotsRes || []);
      setTotalItems(lotsRes.total || 0);
    } catch (err) {
      console.error('Auctions fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentPage, activeCategory]);

  // Reset page when category changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeCategory]);

  const handleRecordSale = (lot) => {
    setSaleModal({ open: true, lot });
  };

  const handleSaleSuccess = () => {
    setSaleModal({ open: false, lot: null });
    fetchData();
  };

  const handleNavigate = (path) => {
    setCurrentPath(path);
  };

  const totalValue = stats.totalValue || 0;

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
                    <span className="text-neutral-700 dark:text-white text-sm font-semibold">Auctioned Items</span>
                  </li>
                </ol>
              </nav>
              <h1 className="text-2xl font-display font-bold text-neutral-800 dark:text-neutral-100">
                Auction Hub
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <button className="header-icon-btn">
                <span className="material-symbols-outlined">notifications</span>
                <span className="notification-dot" />
              </button>
              <button className="btn-primary">
                <span className="material-symbols-outlined text-lg">add</span>
                List Item
              </button>
            </div>
          </div>

          {/* Stats & Filters Bar */}
          <div className="auction-stats-bar mb-6">
            <div className="flex items-center gap-8">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Auctions</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-black text-primary">{stats.totalAuctions || 0}</span>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                  </span>
                </div>
              </div>
              <div className="h-8 w-px bg-neutral-200 dark:bg-neutral-800" />
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Total Value</span>
                <span className="text-xl font-black text-neutral-900 dark:text-white">
                  {'\u20B1'}{Number(totalValue).toLocaleString()}
                </span>
              </div>
              <div className="h-8 w-px bg-neutral-200 dark:bg-neutral-800" />
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Volume</span>
                <span className="text-xl font-black text-neutral-900 dark:text-white">
                  {stats.totalLots || 0} <span className="text-xs font-normal text-neutral-400">lots</span>
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Display Mode Toggle */}
              <div className="auction-tab-group">
                <button
                  className={`auction-tab ${displayMode === 'gallery' ? 'auction-tab-active' : 'auction-tab-inactive'}`}
                  onClick={() => setDisplayMode('gallery')}
                  title="Gallery View"
                >
                  <span className="material-symbols-outlined text-base">grid_view</span>
                </button>
                <button
                  className={`auction-tab ${displayMode === 'compact' ? 'auction-tab-active' : 'auction-tab-inactive'}`}
                  onClick={() => setDisplayMode('compact')}
                  title="Compact View"
                >
                  <span className="material-symbols-outlined text-base">view_module</span>
                </button>
              </div>

              <div className="h-6 w-px bg-neutral-200 dark:bg-neutral-700" />

              {/* Category Tabs */}
              <div className="auction-tab-group">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    className={`auction-tab ${activeCategory === cat ? 'auction-tab-active' : 'auction-tab-inactive'}`}
                    onClick={() => setActiveCategory(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <button className="filter-btn">
                <span className="material-symbols-outlined text-xl">tune</span>
              </button>
            </div>
          </div>

          {/* Content */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <span className="material-symbols-outlined text-3xl text-neutral-300 dark:text-neutral-600 animate-spin">progress_activity</span>
            </div>
          ) : lots.length === 0 ? (
            <EmptyState
              icon="gavel"
              title="No auction lots found"
              description="No items match the selected category. Try a different filter."
            />
          ) : displayMode === 'gallery' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {lots.map((lot) => (
                <AuctionCard key={lot.id} lot={lot} onRecordSale={handleRecordSale} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {lots.map((lot) => (
                <AuctionCompactCard key={lot.id} lot={lot} onRecordSale={handleRecordSale} />
              ))}
            </div>
          )}

          {/* Pagination */}
          <div className="mt-8 pt-8 border-t border-neutral-200 dark:border-neutral-800">
            <Pagination
              currentPage={currentPage}
              totalPages={Math.max(1, Math.ceil(totalItems / itemsPerPage))}
              totalItems={totalItems}
              itemsPerPage={itemsPerPage}
              itemLabel="lots"
              onPageChange={setCurrentPage}
            />
          </div>
        </div>
      </main>

      {/* Sale Modal */}
      <SaleModal
        open={saleModal.open}
        onClose={() => setSaleModal({ open: false, lot: null })}
        lot={saleModal.lot}
        onSuccess={handleSaleSuccess}
      />
    </div>
  );
};

export default AuctionItems;
