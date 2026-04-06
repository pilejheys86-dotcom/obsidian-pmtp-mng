const StepNav = ({ steps, active, completedSteps = {} }) => {
    const scroll = (id) => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    return (
        <nav className="flex items-center gap-1 p-1 bg-neutral-200/60 dark:bg-neutral-800 rounded-sm w-full">
            {steps.map((s, i) => {
                const isCompleted = !!completedSteps[s.id];
                const isActive = s.id === active;

                return (
                    <button
                        key={s.id}
                        type="button"
                        onClick={() => scroll(s.id)}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-sm text-xs font-semibold transition-all cursor-pointer ${
                            isCompleted
                                ? 'bg-primary text-white dark:text-neutral-900 shadow-sm shadow-primary/25'
                                : isActive
                                    ? 'bg-white dark:bg-neutral-700 text-neutral-800 dark:text-white shadow-sm'
                                    : 'text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300'
                        }`}
                    >
                        <span className={`material-symbols-outlined text-[16px] ${isActive ? 'text-primary' : ''}`}>
                            {isCompleted ? 'check_circle' : s.icon}
                        </span>
                        <span className="hidden sm:inline">{s.label}</span>
                    </button>
                );
            })}
        </nav>
    );
};

export default StepNav;
