import { useEffect } from 'react';

const SIZES = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
};

const Modal = ({ open, onClose, title, size = 'md', children }) => {
    useEffect(() => {
        const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
        if (open) {
            document.addEventListener('keydown', handleEsc);
            document.body.style.overflow = 'hidden';
        }
        return () => {
            document.removeEventListener('keydown', handleEsc);
            document.body.style.overflow = '';
        };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Overlay */}
            <div className="absolute inset-0 bg-black/40 dark:bg-black/60" onClick={onClose} />

            {/* Panel */}
            <div className={`relative w-full ${SIZES[size]} bg-white dark:bg-neutral-800 rounded-xl shadow-2xl border border-neutral-200/60 dark:border-neutral-700/50 flex flex-col max-h-[90vh]`}>
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 dark:border-neutral-700/50 flex-shrink-0">
                    <h2 className="text-lg font-display font-bold text-neutral-800 dark:text-neutral-100">{title}</h2>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700/50 transition-colors"
                    >
                        <span className="material-symbols-outlined text-xl">close</span>
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-6 py-5 custom-scrollbar">
                    {children}
                </div>
            </div>
        </div>
    );
};

export default Modal;
