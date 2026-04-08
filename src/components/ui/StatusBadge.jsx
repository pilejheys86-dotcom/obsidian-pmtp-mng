const STATUS_STYLES = {
    success: {
        badge: 'bg-primary/10 text-primary border-primary/20',
        dot: 'bg-primary',
    },
    warning: {
        badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
        dot: 'bg-amber-500',
    },
    danger: {
        badge: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
        dot: 'bg-red-500',
    },
    info: {
        badge: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
        dot: 'bg-blue-500',
    },
    neutral: {
        badge: 'bg-neutral-500/10 text-neutral-500 dark:text-neutral-400 border-neutral-500/20',
        dot: 'bg-neutral-400',
    },
};

const StatusBadge = ({ status, type = 'neutral' }) => {
    const style = STATUS_STYLES[type] || STATUS_STYLES.neutral;

    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-sm text-xs font-bold uppercase border ${style.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
            {status}
        </span>
    );
};

export default StatusBadge;
