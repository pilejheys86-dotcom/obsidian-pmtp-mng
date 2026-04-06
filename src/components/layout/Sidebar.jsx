import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { WelcomeModal, KycBanner } from '../ui';

import { useAuth } from '../../context';

const useMobile = () => {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
};
// Fixed-position tooltip rendered via portal (Claude style)
const SidebarTooltip = ({ label, triggerRef, show }) => {
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (show && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({
        top: rect.top + rect.height / 2,
        left: rect.right + 8,
      });
    }
  }, [show, triggerRef]);

  if (!show) return null;

  return createPortal(
    <div className="sidebar-tooltip" style={{ top: pos.top, left: pos.left }}>
      <span>{label}</span>
    </div>,
    document.body
  );
};

// Sidebar Link Component
const SidebarLink = ({ icon, label, path, active = false, badge, onClick, isCollapsed, disabled = false, isKycItem = false }) => {
  const linkRef = useRef(null);
  const [hovered, setHovered] = useState(false);

  const displayIcon = disabled ? 'lock' : icon;

  return (
    <>
      <a
        ref={linkRef}
        href={disabled ? undefined : (path || '#')}
        onClick={disabled ? (e) => e.preventDefault() : onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`sidebar-link group relative overflow-hidden ${active ? 'active' : ''} ${disabled ? 'opacity-40 pointer-events-auto cursor-not-allowed' : ''}`}
      >
        <div className="flex items-center gap-3 w-[208px]">
          <div className="flex items-center justify-center shrink-0 w-[20px] h-[20px]">
            <span className="material-symbols-outlined text-[20px]">{displayIcon}</span>
          </div>
          <span className="flex-1 whitespace-nowrap overflow-hidden text-ellipsis">{label}</span>
          {isKycItem && (
            <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 ml-auto" />
          )}
          {badge && !isKycItem && <span className="sidebar-badge shrink-0">{badge}</span>}
        </div>
      </a>
      {isCollapsed && (
        <SidebarTooltip label={label} triggerRef={linkRef} show={hovered} />
      )}
    </>
  );
};


const PAYWALL_EXEMPT = ['/admin/subscription', '/admin/profile', '/admin/kyc', '/admin/settings'];

const Sidebar = ({
  navigation = [],
  currentPath = '/',
  onNavigate,
}) => {
  const { subscriptionActive, kycStatus, profile } = useAuth();
  const isOwner = profile?.role === 'OWNER';
  const isMobile = useMobile();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [hideOperations, setHideOperations] = useState(() => localStorage.getItem('pref_hide_operations') === 'true');

  useEffect(() => {
    const handler = () => setHideOperations(localStorage.getItem('pref_hide_operations') === 'true');
    window.addEventListener('pref_change', handler);
    return () => window.removeEventListener('pref_change', handler);
  }, []);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  // Tooltip state for toggle button
  const toggleRef = useRef(null);
  const [toggleHovered, setToggleHovered] = useState(false);
  const [navHovered, setNavHovered] = useState(false);

  // Close mobile drawer when resizing to desktop
  useEffect(() => {
    if (!isMobile) setIsMobileOpen(false);
  }, [isMobile]);

  // Lock body scroll when mobile sidebar is open
  useEffect(() => {
    if (isMobile && isMobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isMobile, isMobileOpen]);

  useEffect(() => {
    try {
      localStorage.setItem('sidebar_collapsed', isCollapsed);
    } catch { }
  }, [isCollapsed]);

  const handleLinkClick = (e, item) => {
    if (onNavigate) {
      e.preventDefault();
      onNavigate(item.path, item);
    }
  };

  const isActive = (itemPath) => {
    if (!itemPath) return false;
    // Exact match always wins
    if (currentPath === itemPath) return true;
    // Only allow prefix matching for deeper paths (e.g. /admin/loans matches /admin/loans/123)
    // but NOT for short root paths like /admin (which would match everything)
    const segments = itemPath.replace(/^\//, '').split('/');
    if (segments.length >= 2) {
      return currentPath.startsWith(itemPath + '/');
    }
    return false;
  };

  // On mobile treat sidebar as always expanded
  const collapsed = isMobile ? false : isCollapsed;

  return (
    <>
      {/* KYC Banner — fixed below the header bar */}
      {isOwner && kycStatus === 'PENDING' && createPortal(
        <div id="kyc-banner-portal" style={{ position: 'fixed', top: '3.5rem', left: 0, right: 0, zIndex: 29 }}>
          <KycBanner />
        </div>,
        document.body
      )}

      {/* Welcome Modal */}
      {isOwner && <WelcomeModal kycStatus={kycStatus} />}

      {/* Mobile overlay backdrop */}
      {isMobile && isMobileOpen && createPortal(
        <div
          className="fixed inset-0 bg-black/60 z-40 transition-opacity duration-300"
          onClick={() => setIsMobileOpen(false)}
        />,
        document.body
      )}

      {/* Mobile hamburger trigger (fixed, shown when drawer is closed) */}
      {isMobile && !isMobileOpen && createPortal(
        <button
          onClick={() => setIsMobileOpen(true)}
          className="mobile-hamburger-btn"
          aria-label="Open menu"
        >
          <span className="material-symbols-outlined text-[22px]">menu</span>
        </button>,
        document.body
      )}

      <aside
        className={`sidebar ${
          isMobile
            ? `fixed inset-y-0 left-0 w-64 z-50 shadow-2xl transition-transform duration-300 ease-in-out ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}`
            : `${isCollapsed ? 'w-[50px]' : 'w-64'}`
        }`}
        data-collapsed={collapsed}
      >
        {/* Navigation — main items (excludes Settings) */}
        <nav
          className={`sidebar-nav overflow-x-hidden ${navHovered ? 'custom-scrollbar' : 'hover-scrollbar'}`}
          onMouseEnter={() => setNavHovered(true)}
          onMouseLeave={() => setNavHovered(false)}
        >
          {navigation.filter(section => !(isOwner && hideOperations && section.category === 'Operations')).map((section, idx) => {
            // Filter out Settings from the section items
            const filteredItems = section.items.filter(
              (item) => item.path !== '/admin/settings' && item.path !== '/superadmin/settings'
            );
            if (filteredItems.length === 0) return null;
            return (
              <div key={section.category}>
                {idx > 0 && (
                  <div className="mx-3 my-3 border-t border-neutral-200/80 dark:border-neutral-800" />
                )}
                <div className="sidebar-category whitespace-nowrap">
                  {section.category}
                </div>
                {filteredItems.filter((item) => !item.ownerOnly || isOwner).map((item) => {
                  const isPaywallLocked = subscriptionActive === false && !PAYWALL_EXEMPT.includes(item.path) && !item.kycItem;
                  const isKycLocked = isOwner && item.requiresKyc === true && kycStatus === 'PENDING';
                  const isLocked = isPaywallLocked || isKycLocked;
                  const isKycItem = isOwner && item.kycItem === true && kycStatus === 'PENDING';
                  return (
                    <SidebarLink
                      key={item.label}
                      icon={item.icon}
                      label={item.label}
                      path={item.path}
                      badge={item.badge}
                      active={isActive(item.path)}
                      disabled={isLocked}
                      isKycItem={isKycItem}
                      onClick={(e) => {
                        handleLinkClick(e, item);
                        if (isMobile) setIsMobileOpen(false);
                      }}
                      isCollapsed={collapsed}
                    />
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Bottom section — collapse toggle (lower right) */}
        <div className="sidebar-bottom-section flex justify-end">
          <button
            ref={toggleRef}
            onClick={() => isMobile ? setIsMobileOpen(false) : setIsCollapsed(!isCollapsed)}
            onMouseEnter={() => setToggleHovered(true)}
            onMouseLeave={() => setToggleHovered(false)}
            className="text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700/50 p-1.5 mx-2 rounded-sm transition-colors flex items-center justify-center shrink-0"
          >
            <span className="material-symbols-outlined text-[22px]">
              {isMobile ? 'close' : (isCollapsed ? 'dock_to_right' : 'dock_to_left')}
            </span>
          </button>
          {!isMobile && isCollapsed && (
            <SidebarTooltip label="Expand" triggerRef={toggleRef} show={toggleHovered} />
          )}
        </div>

      </aside>
    </>
  );
};

export default Sidebar;
