import { useState, useEffect, useRef } from 'react';
import { useSecondaryNav } from '../../context';

const SettingsNav = ({ items, activeId, onSelect, title, badge = {} }) => {
  const [collapsed, setCollapsed] = useState(false);
  const { register, unregister } = useSecondaryNav();

  // Keep latest callback in a ref so we don't re-register when it changes identity
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Stable key derived from item IDs + title — only re-register on real shape changes
  const itemsKey = items.map(i => i.id).join('|');
  const badgeKey = items.map(i => `${i.id}:${badge[i.id] || 0}`).join('|');

  useEffect(() => {
    register({
      items,
      activeId,
      title,
      badge,
      onSelect: (id) => onSelectRef.current?.(id),
    });
    return () => unregister();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey, activeId, title, badgeKey]);

  return (
    <aside
      className={`hidden lg:flex flex-col flex-shrink-0 h-full border-r border-neutral-200 dark:border-neutral-800 bg-background-light dark:bg-background-dark transition-[width] duration-300 ease-in-out overflow-hidden ${collapsed ? 'w-[50px]' : 'w-52'}`}
    >
      {/* Header */}
      <div className={`flex items-center h-12 border-b border-neutral-200 dark:border-neutral-800 px-3 shrink-0 ${collapsed ? 'justify-center' : 'justify-start'}`}>
        {!collapsed && (
          <span className="text-xs font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500 truncate">
            {title}
          </span>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-3 flex flex-col gap-0.5 px-2">
        {items.map(({ id, label, icon }) => {
          const isActive = activeId === id;
          const count = badge[id];
          return (
            <button
              key={id}
              onClick={() => onSelect(id)}
              title={collapsed ? label : undefined}
              className={`flex items-center gap-2.5 rounded-sm text-[13px] font-medium transition-all duration-150
                ${collapsed ? 'justify-center px-0 py-2 w-full' : 'px-2.5 py-2 w-full'}
                ${isActive
                  ? 'bg-neutral-100 dark:bg-neutral-800/80 text-neutral-900 dark:text-white shadow-sm'
                  : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800/60 hover:text-neutral-800 dark:hover:text-neutral-200'
                }`}
            >
              <span className={`material-symbols-outlined text-[18px] shrink-0 ${isActive ? 'text-primary' : ''}`}>
                {icon}
              </span>
              {!collapsed && <span className="truncate">{label}</span>}
              {!collapsed && count > 0 && (
                <span className="ml-auto px-1.5 py-0.5 text-[10px] font-bold rounded-sm bg-primary text-neutral-900 leading-none">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom section — collapse toggle */}
      <div className="flex-shrink-0 border-t border-neutral-200 dark:border-neutral-800 pt-2 pb-2 flex justify-end">
        <button
          onClick={() => setCollapsed(c => !c)}
          className="text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700/50 p-1.5 mx-2 rounded-sm transition-colors flex items-center justify-center shrink-0"
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          <span className="material-symbols-outlined text-[22px]">
            {collapsed ? 'dock_to_right' : 'dock_to_left'}
          </span>
        </button>
      </div>
    </aside>
  );
};

export default SettingsNav;
