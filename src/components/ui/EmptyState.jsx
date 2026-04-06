const EmptyState = ({ icon = 'inbox', title = 'No data', description = '' }) => (
    <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-2xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mb-4">
            <span className="material-symbols-outlined text-3xl text-neutral-300 dark:text-neutral-600">{icon}</span>
        </div>
        <h3 className="text-base font-semibold text-neutral-600 dark:text-neutral-300 mb-1">{title}</h3>
        {description && <p className="text-sm text-neutral-400 dark:text-neutral-500 max-w-xs">{description}</p>}
    </div>
);

export default EmptyState;
