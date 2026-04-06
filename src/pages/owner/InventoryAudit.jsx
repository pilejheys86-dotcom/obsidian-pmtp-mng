import { useMemo } from 'react';
import { Sidebar, Header } from '../../components/layout';
import { EmptyState } from '../../components/ui';
import { getNavigationByRole } from '../../config';
import { useAuth } from '../../context';

const InventoryAudit = () => {
    const { profile } = useAuth();
    const navigation = getNavigationByRole(profile?.role);

    const currentUser = useMemo(() => ({
        name: profile?.full_name || 'User',
        role: profile?.role || 'Admin',
        initials: (profile?.full_name || 'U').split(' ').map((n) => n[0]).join('').slice(0, 2),
    }), [profile]);

    return (
        <div className="admin-layout">
            <Sidebar
                navigation={navigation}
                currentPath="/admin/inventory/audit"
                onNavigate={() => {}}
            />
            <main className="admin-main">
                <Header user={currentUser} />
                <div className="admin-content custom-scrollbar">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                        <div>
                            <nav className="flex mb-2" aria-label="Breadcrumb">
                                <ol className="flex items-center space-x-2">
                                    <li><span className="text-neutral-400 dark:text-neutral-500 text-sm font-medium">Operations</span></li>
                                    <li><span className="text-neutral-300 dark:text-neutral-600 text-sm">/</span></li>
                                    <li><span className="text-neutral-700 dark:text-white text-sm font-semibold">Inventory Audit</span></li>
                                </ol>
                            </nav>
                            <h1 className="text-2xl font-display font-bold text-neutral-800 dark:text-neutral-100">
                                Inventory Audit
                            </h1>
                        </div>
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                            <span className="material-symbols-outlined text-sm">construction</span>
                            Coming Soon
                        </span>
                    </div>

                    <div className="loans-table-container">
                        <EmptyState
                            icon="fact_check"
                            title="Inventory Audit — Coming Soon"
                            description="The audit module is under development. You'll be able to run full audits, spot checks, and reconciliation reports here."
                        />
                    </div>
                </div>
            </main>
        </div>
    );
};

export default InventoryAudit;
