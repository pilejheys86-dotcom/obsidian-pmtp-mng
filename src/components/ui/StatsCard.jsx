const StatsCard = ({ icon, iconBg, iconColor, badge, badgeType, label, value }) => {
    const isPositive = badgeType === 'success';
    const isWarning = badgeType === 'warning';

    return (
        <div className="kpi-card">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className={`kpi-icon ${iconBg}`}>
                        <span className={`material-symbols-outlined text-xl ${iconColor}`}>{icon}</span>
                    </div>
                    <span className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">{label}</span>
                </div>
            </div>
            <h3 className="kpi-value">{value}</h3>
            {badge && (
                <div className="flex items-center gap-2 mt-3">
                    <span className={`kpi-badge ${isPositive ? 'kpi-badge-success' : isWarning ? 'kpi-badge-warning' : 'kpi-badge-neutral'}`}>
                        {isPositive && <span className="material-symbols-outlined text-xs">trending_up</span>}
                        {isWarning && <span className="material-symbols-outlined text-xs">trending_down</span>}
                        {badge}
                    </span>
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">from last month</span>
                </div>
            )}
        </div>
    );
};

export default StatsCard;
