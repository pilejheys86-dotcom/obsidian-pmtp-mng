import { useState, useRef, useEffect } from 'react';

const ActionMenu = ({ actions = [] }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        if (open) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open]);

    const visible = actions.filter((a) => !a.hidden);
    if (visible.length === 0) return null;

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen((p) => !p)}
                className="p-1.5 rounded-sm text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700/50 transition-colors"
            >
                <span className="material-symbols-outlined text-xl">more_horiz</span>
            </button>

            {open && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-neutral-800 rounded-sm shadow-lg border border-neutral-200/60 dark:border-neutral-700/50 py-1 z-30">
                    {visible.map((action, i) => (
                        <button
                            key={i}
                            onClick={() => { setOpen(false); action.onClick?.(); }}
                            disabled={action.disabled}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-left"
                        >
                            {action.icon && (
                                <span className="material-symbols-outlined text-base text-neutral-400">{action.icon}</span>
                            )}
                            {action.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ActionMenu;
