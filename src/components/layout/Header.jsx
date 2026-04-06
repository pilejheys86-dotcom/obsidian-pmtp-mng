import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../context';

// Logout Confirmation Modal
const LogoutConfirmModal = ({ onConfirm, onCancel, isLoading }) => createPortal(
  <div className="fixed inset-0 z-[9999] flex items-center justify-center">
    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={isLoading ? undefined : onCancel} />
    <div className="relative bg-white dark:bg-neutral-800 rounded-sm shadow-xl w-full max-w-xs mx-4 overflow-hidden">
      <div className="px-6 pt-6 pb-4 text-center">
        <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-3">
          <span className="material-symbols-outlined text-red-500 text-2xl">logout</span>
        </div>
        <h3 className="text-lg font-display font-bold text-neutral-900 dark:text-white">Logout?</h3>
      </div>
      <div className="border-t border-neutral-200 dark:border-neutral-700" />
      <div className="px-6 py-4 text-center">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">You will be signed out of your account and returned to the login page.</p>
      </div>
      <div className="border-t border-neutral-200 dark:border-neutral-700" />
      <div className="px-6 py-4 space-y-2.5">
        <button
          onClick={onConfirm}
          disabled={isLoading}
          className="w-full inline-flex items-center justify-center px-4 py-2.5 text-sm font-bold rounded-sm bg-red-500 hover:bg-red-600 text-white transition-all disabled:opacity-70"
        >
          <span className={`material-symbols-outlined mr-2 text-lg ${isLoading ? 'animate-spin' : ''}`}>
            {isLoading ? 'progress_activity' : 'logout'}
          </span>
          {isLoading ? 'Logging out...' : 'Logout'}
        </button>
        <button
          onClick={onCancel}
          disabled={isLoading}
          className="w-full inline-flex items-center justify-center px-4 py-2.5 text-sm font-bold rounded-sm border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 bg-transparent hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-all disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>,
  document.body
);

// User Menu Dropdown (anchored top-right, drops down)
const UserMenu = ({ user, isOpen, onClose }) => {
  const menuRef = useRef(null);
  const { logout, user: authUser } = useAuth();
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  const handleLogoutConfirm = async () => {
    setIsLoggingOut(true);
    try { await logout() } catch (_) {}
    setIsLoggingOut(false);
    setShowConfirm(false);
    window.history.pushState({}, '', '/login');
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <>
      {isOpen && (
        <div ref={menuRef} className="user-menu">
          <div className="user-menu-header">
            <span className="material-symbols-outlined text-lg text-neutral-400">person</span>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold text-neutral-800 dark:text-white truncate">{user.name}</span>
              <span className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{authUser?.email || user.email || 'No email'}</span>
            </div>
          </div>
          <div className="user-menu-section">
            <a href="/admin/profile" className="user-menu-item" onClick={onClose}>
              <span className="material-symbols-outlined text-lg">account_circle</span>
              <span>Account</span>
            </a>
          </div>
          <div className="user-menu-divider" />
          <div className="user-menu-section">
            <button
              onClick={() => { setShowConfirm(true); onClose(); }}
              className="user-menu-item w-full text-left text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              <span className="material-symbols-outlined text-lg">logout</span>
              <span>Log out</span>
            </button>
          </div>
        </div>
      )}
      {showConfirm && (
        <LogoutConfirmModal
          onConfirm={handleLogoutConfirm}
          onCancel={() => setShowConfirm(false)}
          isLoading={isLoggingOut}
        />
      )}
    </>
  );
};

const Header = ({ user = { name: 'User', initials: 'U', email: '' } }) => {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const avatarRef = useRef(null);

  return (
    <header className="admin-header">
      {/* Left: System name */}
      <div className="flex items-center gap-1.5">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1333.33 1333.33" fill="currentColor" className="w-5 h-5 text-neutral-800 dark:text-neutral-100">
          <rect y="333.17" width="333.17" height="1000"/>
          <rect x="666.67" y="666.67" width="332.49" height="666.5"/>
          <rect x="666.42" y="1000.58" width="333.17" height="999" transform="translate(-1000.42 1999.75) rotate(-90)"/>
          <rect x="500.5" y="500.5" width="333.5" height="665.51" transform="translate(-499.33 1167.17) rotate(-90)"/>
          <rect x="1000" width="333.33" height="333.33"/>
        </svg>
        <span className="text-lg font-display font-light text-neutral-800 dark:text-neutral-100">
          Obsidian
        </span>
      </div>

      {/* Right: User avatar */}
      <div className="relative">
        <button
          ref={avatarRef}
          onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
          className="w-8 h-8 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-xs font-bold text-neutral-700 dark:text-white hover:ring-2 hover:ring-neutral-300 dark:hover:ring-neutral-600 transition-all"
        >
          {user.initials}
        </button>
        <UserMenu
          user={user}
          isOpen={isUserMenuOpen}
          onClose={() => setIsUserMenuOpen(false)}
        />
      </div>
    </header>
  );
};

export default Header;
