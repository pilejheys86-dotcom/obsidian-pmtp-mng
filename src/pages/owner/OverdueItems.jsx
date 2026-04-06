import { useEffect, useMemo, useState } from 'react';
import { Sidebar, Header } from '../../components/layout';
import { Pagination, StatsCard, StatusBadge, ActionMenu, Modal, EmptyState } from '../../components/ui';
import { getNavigationByRole } from '../../config';
import { useAuth } from '../../context';
import { pawnTicketsApi } from '../../lib/api';

// ── Helpers ──
const formatCurrency = (val) =>
  `\u20B1${Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (dateStr) => {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const OverdueItems = () => {
  const [tickets, setTickets] = useState([]);
  const [stats, setStats] = useState({
    totalOverdue: 0,
    inGracePeriod: 0,
    readyToForfeit: 0,
    valueAtRisk: 0,
    gracePeriodDays: 30,
  });
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [confirmModal, setConfirmModal] = useState(null);
  const [forfeitReason, setForfeitReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [currentPath, setCurrentPath] = useState('/admin/overdue');

  const { profile } = useAuth();
  const navigation = getNavigationByRole(profile?.role);
  const itemsPerPage = 10;

  const currentUser = useMemo(
    () => ({
      name: profile?.full_name || 'User',
      role: profile?.role || 'Admin',
      initials: (profile?.full_name || 'U')
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2),
    }),
    [profile],
  );

  const canForfeit = useMemo(() => {
    const role = profile?.role?.toUpperCase();
    return role === 'OWNER' || role === 'MANAGER';
  }, [profile]);

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [statsRes, listRes] = await Promise.all([
          pawnTicketsApi.overdueStats(),
          pawnTicketsApi.overdueList({ page: currentPage, limit: itemsPerPage }),
        ]);

        setStats(statsRes);
        setTickets(listRes.data || []);
        setTotalItems(listRes.total || 0);
      } catch (err) {
        console.error('Overdue items fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [currentPage]);

  const statsData = [
    {
      icon: 'schedule',
      iconBg: 'bg-red-500',
      iconColor: 'text-white',
      label: 'Total Overdue',
      value: String(stats.totalOverdue || 0),
    },
    {
      icon: 'hourglass_top',
      iconBg: 'bg-amber-500',
      iconColor: 'text-white',
      label: 'In Grace Period',
      value: String(stats.inGracePeriod || 0),
    },
    {
      icon: 'gavel',
      iconBg: 'bg-red-600',
      iconColor: 'text-white',
      label: 'Ready to Forfeit',
      value: String(stats.readyToForfeit || 0),
    },
    {
      icon: 'attach_money',
      iconBg: 'bg-purple-500',
      iconColor: 'text-white',
      label: 'Value at Risk',
      value: formatCurrency(stats.valueAtRisk),
    },
  ];

  const getCustomerName = (ticket) => {
    if (ticket.customers) {
      return `${ticket.customers.first_name || ''} ${ticket.customers.last_name || ''}`.trim();
    }
    return 'N/A';
  };

  const getItemDescription = (ticket) => {
    return ticket.pawn_items?.general_desc || 'N/A';
  };

  const getRowActions = (ticket) => {
    const actions = [
      {
        label: 'View Ticket',
        icon: 'visibility',
        onClick: () => alert(`Ticket: ${ticket.ticket_number}`),
      },
    ];

    actions.push({
      label: 'Forfeit',
      icon: 'gavel',
      onClick: () => {
        setForfeitReason('');
        setConfirmModal(ticket);
      },
      disabled: !ticket.can_forfeit || !canForfeit,
    });

    return actions;
  };

  const handleForfeitSubmit = async () => {
    if (!confirmModal) return;
    try {
      setSubmitting(true);
      await pawnTicketsApi.forfeit(confirmModal.id, { reason: forfeitReason });
      setConfirmModal(null);
      setForfeitReason('');
      // Refresh data
      const [statsRes, listRes] = await Promise.all([
        pawnTicketsApi.overdueStats(),
        pawnTicketsApi.overdueList({ page: currentPage, limit: itemsPerPage }),
      ]);
      setStats(statsRes);
      setTickets(listRes.data || []);
      setTotalItems(listRes.total || 0);
    } catch (err) {
      console.error('Forfeit error:', err);
      alert(err.message || 'Failed to forfeit ticket.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleNavigate = (path) => {
    setCurrentPath(path);
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
                    <span className="text-neutral-700 dark:text-white text-sm font-semibold">Overdue Items</span>
                  </li>
                </ol>
              </nav>
              <h1 className="text-2xl font-display font-bold text-neutral-800 dark:text-neutral-100">
                Overdue Items
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <button className="header-icon-btn">
                <span className="material-symbols-outlined">notifications</span>
                <span className="notification-dot" />
              </button>
            </div>
          </div>

          {/* Grace Period Info Banner */}
          <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-sm text-amber-700 dark:text-amber-300 mb-8 flex items-center gap-3">
            <span className="material-symbols-outlined text-xl flex-shrink-0">info</span>
            <span>
              Items must be overdue for <strong>{stats.gracePeriodDays || 30} days</strong> before they can be forfeited.
            </span>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {statsData.map((stat, index) => (
              <StatsCard key={index} {...stat} />
            ))}
          </div>

          {/* Data Table */}
          <div className="loans-table-container">
            <div className="overflow-x-auto custom-scrollbar flex-1">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                </div>
              ) : tickets.length === 0 ? (
                <EmptyState
                  icon="check_circle"
                  title="No overdue items"
                  description="There are no overdue pawn tickets at this time."
                />
              ) : (
                <table className="min-w-full text-center text-sm whitespace-nowrap">
                  <thead className="loans-table-header">
                    <tr>
                      <th scope="col" className="table-th text-center">Ticket #</th>
                      <th scope="col" className="table-th text-center">Customer Name</th>
                      <th scope="col" className="table-th text-center">Item</th>
                      <th scope="col" className="table-th text-center">Loan Amount</th>
                      <th scope="col" className="table-th text-center">Due Date</th>
                      <th scope="col" className="table-th text-center">Days Overdue</th>
                      <th scope="col" className="table-th text-center">Maturity Status</th>
                      <th scope="col" className="table-th text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {tickets.map((ticket) => (
                      <tr key={ticket.id} className="loan-row">
                        <td className="px-6 py-4 text-center font-mono text-primary text-sm">
                          {ticket.ticket_number || 'N/A'}
                        </td>
                        <td className="px-4 py-4 text-center text-sm font-semibold text-neutral-800 dark:text-white">
                          {getCustomerName(ticket)}
                        </td>
                        <td className="px-4 py-4 text-center text-sm text-neutral-600 dark:text-neutral-400 max-w-xs truncate">
                          {getItemDescription(ticket)}
                        </td>
                        <td className="px-4 py-4 text-center text-sm font-bold text-neutral-800 dark:text-white">
                          {formatCurrency(ticket.principal_loan)}
                        </td>
                        <td className="px-4 py-4 text-center text-sm text-red-500 dark:text-red-400 font-medium">
                          {formatDate(ticket.maturity_date)}
                        </td>
                        <td className="px-4 py-4 text-center text-sm font-bold text-red-600 dark:text-red-400">
                          {ticket.days_overdue || 0}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {ticket.can_forfeit ? (
                            <StatusBadge status="Ready to Forfeit" type="danger" />
                          ) : (
                            <StatusBadge
                              status={`${ticket.days_until_forfeit || 0} days left`}
                              type="warning"
                            />
                          )}
                        </td>
                        <td className="px-4 py-4 text-center">
                          <ActionMenu actions={getRowActions(ticket)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {!loading && tickets.length > 0 && (
              <Pagination
                currentPage={currentPage}
                totalPages={Math.max(1, Math.ceil(totalItems / itemsPerPage))}
                totalItems={totalItems}
                itemsPerPage={itemsPerPage}
                itemLabel="overdue items"
                onPageChange={setCurrentPage}
              />
            )}
          </div>
        </div>
      </main>

      {/* Forfeit Confirmation Modal */}
      <Modal
        open={!!confirmModal}
        onClose={() => setConfirmModal(null)}
        title="Confirm Forfeiture"
        size="md"
      >
        {confirmModal && (
          <div className="space-y-5">
            <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg p-4 text-sm text-red-700 dark:text-red-300 flex items-start gap-3">
              <span className="material-symbols-outlined text-xl flex-shrink-0 mt-0.5">warning</span>
              <span>
                This action is <strong>irreversible</strong>. The pawn ticket will be marked as forfeited and the item will be available for disposition.
              </span>
            </div>

            <div className="bg-neutral-50 dark:bg-neutral-700/30 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Ticket</span>
                <span className="text-sm font-mono font-semibold text-neutral-800 dark:text-neutral-100">
                  {confirmModal.ticket_number}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Customer</span>
                <span className="text-sm text-neutral-800 dark:text-neutral-100">{getCustomerName(confirmModal)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Item</span>
                <span className="text-sm text-neutral-800 dark:text-neutral-100">{getItemDescription(confirmModal)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Loan Amount</span>
                <span className="text-sm font-bold text-neutral-800 dark:text-neutral-100">{formatCurrency(confirmModal.principal_loan)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Days Overdue</span>
                <span className="text-sm font-bold text-red-600 dark:text-red-400">{confirmModal.days_overdue || 0}</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-2">
                Reason for Forfeiture
              </label>
              <textarea
                value={forfeitReason}
                onChange={(e) => setForfeitReason(e.target.value)}
                rows={3}
                placeholder="Enter the reason for forfeiture..."
                className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-800 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-100 dark:border-neutral-700/50">
              <button
                onClick={() => setConfirmModal(null)}
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-600 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleForfeitSubmit}
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {submitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-lg">gavel</span>
                    Confirm Forfeit
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default OverdueItems;
