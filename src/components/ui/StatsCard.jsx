const StatsCard = ({ badge, badgeType, label, value }) => {
    const isPositive = badgeType === 'success';
    const isWarning = badgeType === 'warning';

    return (
        <div className="kpi-card">
            {/* Label */}
            <p className="text-xs sm:text-sm font-bold text-neutral-700 dark:text-neutral-200">{label}</p>

            {/* Divider — extends to card edges */}
            <div className="-mx-4 sm:-mx-5 my-2 sm:my-3 border-t border-neutral-100 dark:border-neutral-800" />

            {/* Value */}
            <h3 className="kpi-value">{value}</h3>

            {/* Badge Row */}
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
