# Sidebar & Header Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the admin layout to Supabase-style: smooth sidebar collapse animation, pinned Settings link with divider, and persistent header bar with profile avatar in the top-right.

**Architecture:** Refactor Sidebar.jsx to remove UserMenu/footer and fix collapse to overflow-clip only. Create new Header.jsx with "Obsidian" branding + user avatar dropdown. Update all 24 page files to add Header and remove user prop from Sidebar.

**Tech Stack:** React 18, TailwindCSS 4, CSS @apply classes in index.css

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/index.css` | Modify | Update sidebar animation classes, add header styles, adjust admin-content padding |
| `src/components/layout/Sidebar.jsx` | Modify | Remove UserMenu/LogoutConfirmModal/footer, fix collapse animation, pin Settings to bottom with divider |
| `src/components/layout/Header.jsx` | Create | Persistent header bar with "Obsidian" branding + user avatar + UserMenu dropdown |
| `src/components/layout/index.js` | Modify | Export Header |
| `src/pages/owner/AdminDash.jsx` | Modify | Add Header, remove user from Sidebar |
| `src/pages/owner/SettingsPage.jsx` | Modify | Add Header, remove user from Sidebar, remove inline admin-header |
| `src/pages/owner/ProfilePage.jsx` | Modify | Add Header, remove user from Sidebar |
| `src/pages/owner/Customers.jsx` | Modify | Add Header, remove user from Sidebar |
| `src/pages/owner/Employee.jsx` | Modify | Add Header, remove user from Sidebar |
| `src/pages/owner/ActiveLoans.jsx` | Modify | Add Header, remove user from Sidebar |
| `src/pages/owner/Inventory.jsx` | Modify | Add Header, remove user from Sidebar |
| `src/pages/owner/InventoryAudit.jsx` | Modify | Add Header, remove user from Sidebar |
| `src/pages/owner/AuctionItems.jsx` | Modify | Add Header, remove user from Sidebar |
| `src/pages/owner/OverdueItems.jsx` | Modify | Add Header, remove user from Sidebar |
| `src/pages/owner/Reports.jsx` | Modify | Add Header, remove user from Sidebar |
| `src/pages/owner/SubscriptionPage.jsx` | Modify | Add Header, remove user from Sidebar |
| `src/pages/owner/KycPage.jsx` | Modify | Add Header, remove user from Sidebar |
| `src/pages/owner/appraisals/AppraiserWorkspace.jsx` | Modify | Add Header, remove user from Sidebar |
| `src/pages/owner/appraisals/ManagerWorkspace.jsx` | Modify | Add Header, remove user from Sidebar |
| `src/pages/owner/appraisals/OwnerWorkspace.jsx` | Modify | Add Header, remove user from Sidebar |
| `src/pages/superadmin/SuperAdminDash.jsx` | Modify | Add Header, remove user from Sidebar |
| `src/pages/superadmin/Tenants.jsx` | Modify | Add Header, remove user from Sidebar |
| `src/pages/superadmin/Reports.jsx` | Modify | Add Header, remove user from Sidebar |
| `src/pages/superadmin/SalesReport.jsx` | Modify | Add Header, remove user from Sidebar |
| `src/pages/superadmin/AuditLogs.jsx` | Modify | Add Header, remove user from Sidebar |
| `src/pages/superadmin/Backup.jsx` | Modify | Add Header, remove user from Sidebar |
| `src/pages/superadmin/SuperAdminSettings.jsx` | Modify | Add Header, remove user from Sidebar |
| `src/pages/superadmin/Admins.jsx` | Modify | Add Header, remove user from Sidebar |

---

### Task 1: Update CSS — Sidebar Animation + Header Styles

**Files:**
- Modify: `src/index.css` (lines 473-659)

- [ ] **Step 1: Update `.sidebar` class to use overflow-hidden for clipping**

Replace the existing `.sidebar` class:

```css
  .sidebar {
    @apply w-64 bg-background-light dark:bg-background-dark text-neutral-700 dark:text-white flex flex-col flex-shrink-0 z-20 border-r border-neutral-200 dark:border-neutral-800 overflow-hidden;
    transition: width 200ms ease-in-out;
  }
```

Key changes: removed `transition-all duration-300`, added explicit `transition: width 200ms ease-in-out` and `overflow-hidden`. This makes text clip naturally as width shrinks.

- [ ] **Step 2: Simplify collapsed sidebar-header**

Replace:

```css
  [data-collapsed="true"] .sidebar-header {
    @apply h-12 px-0 pt-3 pb-1;
  }
```

With:

```css
  [data-collapsed="true"] .sidebar-header {
    @apply h-12 justify-center px-2 pt-3 pb-1;
  }
```

- [ ] **Step 3: Remove the collapsed sidebar-nav override**

Delete this block entirely:

```css
  [data-collapsed="true"] .sidebar-nav {
    @apply py-2 space-y-1;
  }
```

The overflow-hidden on the sidebar container handles the collapsed state now.

- [ ] **Step 4: Remove sidebar-footer and sidebar-user styles**

Delete these blocks entirely:

```css
  .sidebar-footer {
    @apply p-4 relative;
  }

  [data-collapsed="true"] .sidebar-footer {
    @apply p-1.5;
  }
```

```css
  .sidebar-user {
    @apply flex items-center gap-3 px-2;
  }

  .sidebar-user-btn {
    @apply flex items-center gap-3 w-full px-2 py-2 rounded-sm hover:bg-neutral-100 dark:hover:bg-neutral-700/50 transition-colors text-left min-w-0;
  }

  .sidebar-avatar {
    @apply w-8 h-8 rounded-full bg-neutral-200 dark:bg-neutral-600 flex items-center justify-center text-xs font-bold text-neutral-700 dark:text-white;
  }
```

- [ ] **Step 5: Update user-menu positioning for header dropdown**

Replace the `.user-menu` class:

```css
  .user-menu {
    @apply absolute top-full right-0 mt-2 bg-white dark:bg-neutral-900 rounded-sm shadow-xl border border-neutral-200 dark:border-neutral-800 py-2 z-50;
    width: 240px;
    animation: slideDown 0.15s ease-out;
  }
```

Replace the `@keyframes slideUp` with `slideDown`:

```css
  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }

    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
```

- [ ] **Step 6: Add new `.admin-header` style for persistent header**

Replace the existing `.admin-header` class:

```css
  .admin-header {
    @apply h-14 bg-background-light dark:bg-background-dark flex items-center justify-between px-4 md:px-6 flex-shrink-0 z-10 border-b border-neutral-200 dark:border-neutral-800;
  }
```

- [ ] **Step 7: Update `.admin-content` padding**

Replace the existing `.admin-content` class:

```css
  .admin-content {
    @apply flex-1 overflow-y-auto py-6 px-4 md:py-8 md:px-12;
  }
```

Removed `pt-16` since the header is now a separate element above.

- [ ] **Step 8: Add sidebar-bottom-section style**

Add this new class after the `.sidebar-badge` block:

```css
  .sidebar-bottom-section {
    @apply flex-shrink-0 border-t border-neutral-200 dark:border-neutral-800 pt-2 pb-2;
  }
```

- [ ] **Step 9: Remove `.sidebar-user-link` style**

Delete this block:

```css
  .sidebar-user-link {
    @apply flex items-center gap-3 flex-1 cursor-pointer hover:opacity-80 transition-opacity;
  }
```

- [ ] **Step 10: Commit**

```bash
git add src/index.css
git commit -m "style: update CSS for Supabase-style sidebar animation and header layout"
```

---

### Task 2: Create Header Component

**Files:**
- Create: `src/components/layout/Header.jsx`

- [ ] **Step 1: Create Header.jsx with UserMenu and LogoutConfirmModal**

Create `src/components/layout/Header.jsx` with the following content:

```jsx
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
  const { logout } = useAuth();
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
              <span className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{user.email || `${user.name.toLowerCase().replace(' ', '.')}@obsidian.com`}</span>
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
      <span className="text-lg font-display font-bold text-neutral-800 dark:text-neutral-100">
        Obsidian
      </span>

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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/layout/Header.jsx
git commit -m "feat: create Header component with profile avatar and user menu"
```

---

### Task 3: Refactor Sidebar — Remove Footer, Fix Animation, Pin Settings

**Files:**
- Modify: `src/components/layout/Sidebar.jsx`

- [ ] **Step 1: Remove UserMenu, LogoutConfirmModal, and related imports from Sidebar**

Delete the `LogoutConfirmModal` component (lines 98-142).

Delete the `UserMenu` component (lines 144-218).

Remove `useAuth` from the import on line 4:

Change:
```jsx
import { Logo, WelcomeModal, KycBanner } from '../ui';
import { useAuth } from '../../context';
```

To:
```jsx
import { Logo, WelcomeModal, KycBanner } from '../ui';
import { useAuth } from '../../context';
```

Keep the `useAuth` import since it's still used for `subscriptionActive`, `kycStatus`, `profile` in the Sidebar component itself.

- [ ] **Step 2: Remove user-related state and refs from Sidebar component**

In the `Sidebar` component, remove the `user` prop from the destructured props:

Change:
```jsx
const Sidebar = ({
  navigation = [],
  user = { name: 'User', role: 'Guest', initials: 'U', email: '' },
  currentPath = '/',
  onNavigate,
}) => {
```

To:
```jsx
const Sidebar = ({
  navigation = [],
  currentPath = '/',
  onNavigate,
}) => {
```

Remove these state/ref lines:
```jsx
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userRef = useRef(null);
  const [userHovered, setUserHovered] = useState(false);
```

- [ ] **Step 3: Fix the collapse animation — remove individual element animations in SidebarLink**

In the `SidebarLink` component, replace the return JSX. Change the conditional rendering that switches between collapsed (icon-only) and expanded layout:

Replace:
```jsx
        {isCollapsed ? (
          <span className="material-symbols-outlined text-[18px]">{displayIcon}</span>
        ) : (
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
        )}
```

With:
```jsx
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
```

This always renders the full layout — the sidebar's `overflow: hidden` + width transition handles the clipping. No more conditional icon-only rendering.

- [ ] **Step 4: Fix the collapse animation — remove individual element animations in category labels**

In the nav section, replace the category label div:

Change:
```jsx
              <div className={`sidebar-category w-64 transition-all duration-300 ease-in-out ${collapsed ? 'opacity-0 -translate-x-4 h-0 mb-0 text-[0px] overflow-hidden' : 'opacity-100 translate-x-0'}`}>
                {section.category}
              </div>
```

To:
```jsx
              <div className="sidebar-category whitespace-nowrap">
                {section.category}
              </div>
```

All animation classes removed — the sidebar overflow-hidden clips it naturally.

- [ ] **Step 5: Fix the collapse animation — simplify sidebar header**

Replace the sidebar header section:

Change:
```jsx
        <div className={`sidebar-header flex items-center ${collapsed ? '!justify-center !px-0' : 'justify-between'}`}>
          <div className={`transition-all duration-300 ${collapsed ? 'opacity-0 w-0 overflow-hidden m-0 p-0 hidden' : 'opacity-100'}`}>
            <Logo size="sm" />
          </div>
          <button
            ref={toggleRef}
            onClick={() => isMobile ? setIsMobileOpen(false) : setIsCollapsed(!isCollapsed)}
            onMouseEnter={() => setToggleHovered(true)}
            onMouseLeave={() => setToggleHovered(false)}
            className={`text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700/50 p-1.5 rounded-sm transition-all flex items-center justify-center shrink-0 ${collapsed ? 'mx-auto' : ''}`}
          >
            <span className="material-symbols-outlined text-[22px]">
              {isMobile ? 'close' : (isCollapsed ? 'dock_to_right' : 'dock_to_left')}
            </span>
          </button>
          {!isMobile && isCollapsed && (
            <SidebarTooltip label="Expand" triggerRef={toggleRef} show={toggleHovered} />
          )}
        </div>
```

To:
```jsx
        <div className="sidebar-header">
          <div className="shrink-0">
            <Logo size="sm" />
          </div>
          <button
            ref={toggleRef}
            onClick={() => isMobile ? setIsMobileOpen(false) : setIsCollapsed(!isCollapsed)}
            onMouseEnter={() => setToggleHovered(true)}
            onMouseLeave={() => setToggleHovered(false)}
            className="text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700/50 p-1.5 rounded-sm transition-colors flex items-center justify-center shrink-0"
          >
            <span className="material-symbols-outlined text-[22px]">
              {isMobile ? 'close' : (isCollapsed ? 'dock_to_right' : 'dock_to_left')}
            </span>
          </button>
          {!isMobile && isCollapsed && (
            <SidebarTooltip label="Expand" triggerRef={toggleRef} show={toggleHovered} />
          )}
        </div>
```

Logo is always rendered — overflow-hidden clips it when collapsed. No opacity/hidden transitions.

- [ ] **Step 6: Split navigation — filter Settings out and pin it to bottom**

Replace the `{/* Navigation */}` and `{/* Footer */}` sections (everything from `<nav` to the closing `</aside>`):

Change the nav and footer to:

```jsx
        {/* Navigation — main items (excludes Settings) */}
        <nav
          className={`sidebar-nav overflow-x-hidden ${navHovered ? 'custom-scrollbar' : 'hover-scrollbar'}`}
          onMouseEnter={() => setNavHovered(true)}
          onMouseLeave={() => setNavHovered(false)}
        >
          {navigation.map((section, idx) => {
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

        {/* Bottom section — Settings link with divider */}
        <div className="sidebar-bottom-section">
          <SidebarLink
            icon="settings"
            label="Settings"
            path={currentPath.startsWith('/superadmin') ? '/superadmin/settings' : '/admin/settings'}
            active={isActive(currentPath.startsWith('/superadmin') ? '/superadmin/settings' : '/admin/settings')}
            onClick={(e) => {
              const settingsPath = currentPath.startsWith('/superadmin') ? '/superadmin/settings' : '/admin/settings';
              handleLinkClick(e, { path: settingsPath });
              if (isMobile) setIsMobileOpen(false);
            }}
            isCollapsed={collapsed}
          />
        </div>
```

- [ ] **Step 7: Remove the old footer section entirely**

Delete the entire `{/* Footer */}` block that contains the UserMenu and user avatar button (lines ~397-434).

- [ ] **Step 8: Remove `isCollapsed` prop from SidebarLink since clipping handles it**

The `isCollapsed` prop on `SidebarLink` is no longer needed for conditional rendering, but we still need it for the tooltip. Keep the prop but remove the conditional rendering logic from Step 3 (already done). The tooltip still uses `isCollapsed`:

```jsx
      {isCollapsed && (
        <SidebarTooltip label={label} triggerRef={linkRef} show={hovered} />
      )}
```

This stays as-is — tooltips only show when collapsed.

- [ ] **Step 9: Verify the sidebar aside tag uses proper width classes**

Ensure the aside tag still has the correct width transition:

Change:
```jsx
        className={`sidebar ${
          isMobile
            ? `fixed inset-y-0 left-0 w-64 z-50 shadow-2xl transition-transform duration-300 ease-in-out ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}`
            : `transition-[width] duration-300 ease-in-out z-30 ${isCollapsed ? 'w-[50px]' : 'w-64'}`
        }`}
```

To:
```jsx
        className={`sidebar ${
          isMobile
            ? `fixed inset-y-0 left-0 w-64 z-50 shadow-2xl transition-transform duration-300 ease-in-out ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}`
            : `${isCollapsed ? 'w-[50px]' : 'w-64'}`
        }`}
```

Remove the inline `transition-[width]` since it's now in the `.sidebar` CSS class.

- [ ] **Step 10: Commit**

```bash
git add src/components/layout/Sidebar.jsx
git commit -m "refactor: sidebar — remove footer/user menu, fix collapse animation, pin Settings to bottom"
```

---

### Task 4: Export Header from Layout Index

**Files:**
- Modify: `src/components/layout/index.js`

- [ ] **Step 1: Add Header export**

Change:
```js
export { default as Sidebar } from './Sidebar'
```

To:
```js
export { default as Sidebar } from './Sidebar'
export { default as Header } from './Header'
```

- [ ] **Step 2: Commit**

```bash
git add src/components/layout/index.js
git commit -m "feat: export Header from layout index"
```

---

### Task 5: Update Owner Pages (Part 1) — AdminDash, SettingsPage, ProfilePage, Customers, Employee

**Files:**
- Modify: `src/pages/owner/AdminDash.jsx`
- Modify: `src/pages/owner/SettingsPage.jsx`
- Modify: `src/pages/owner/ProfilePage.jsx`
- Modify: `src/pages/owner/Customers.jsx`
- Modify: `src/pages/owner/Employee.jsx`

For each page, the pattern is:

1. Change `import { Sidebar } from '../../components/layout'` to `import { Sidebar, Header } from '../../components/layout'`
2. Remove `user={currentUser}` from `<Sidebar>` props
3. Add `<Header user={currentUser} />` as the first child inside `<main className="admin-main">`

- [ ] **Step 1: Update AdminDash.jsx**

Change import:
```jsx
import { Sidebar } from '../../components/layout';
```
To:
```jsx
import { Sidebar, Header } from '../../components/layout';
```

In the JSX, change:
```jsx
      <Sidebar
        navigation={navigation}
        user={currentUser}
        currentPath={currentPath}
        onNavigate={handleNavigate}
      />
      <main className="admin-main">
```
To:
```jsx
      <Sidebar
        navigation={navigation}
        currentPath={currentPath}
        onNavigate={handleNavigate}
      />
      <main className="admin-main">
        <Header user={currentUser} />
```

- [ ] **Step 2: Update SettingsPage.jsx**

Change import:
```jsx
import { Sidebar } from '../../components/layout';
```
To:
```jsx
import { Sidebar, Header } from '../../components/layout';
```

Remove `user={currentUser}` from `<Sidebar>`.

Replace the inline `<header className="admin-header">` block (which contains the page title and search bar) — remove the `<header>` wrapper entirely. The `<Header>` component now handles the header bar. Move the page title and search into the `admin-content` div instead:

Change:
```jsx
      <main className="admin-main">
        {/* Header */}
        <header className="admin-header">
          <h1 className="text-2xl font-display font-bold text-neutral-800 dark:text-neutral-100">
            Settings
          </h1>
          <div className="flex items-center gap-6">
            {/* Search */}
            ...
          </div>
        </header>
        <div className="admin-content custom-scrollbar !pt-6 md:!pt-10">
```

To:
```jsx
      <main className="admin-main">
        <Header user={currentUser} />
        <div className="admin-content custom-scrollbar">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-display font-bold text-neutral-800 dark:text-neutral-100">
              Settings
            </h1>
          </div>
```

Note: Remove the `!pt-6 md:!pt-10` overrides since `admin-content` padding is now correct by default.

- [ ] **Step 3: Update ProfilePage.jsx**

Same pattern: add `Header` import, remove `user` from Sidebar, add `<Header user={currentUser} />` inside `admin-main`.

- [ ] **Step 4: Update Customers.jsx**

Same pattern.

- [ ] **Step 5: Update Employee.jsx**

Same pattern.

- [ ] **Step 6: Commit**

```bash
git add src/pages/owner/AdminDash.jsx src/pages/owner/SettingsPage.jsx src/pages/owner/ProfilePage.jsx src/pages/owner/Customers.jsx src/pages/owner/Employee.jsx
git commit -m "feat: add Header component to AdminDash, Settings, Profile, Customers, Employee pages"
```

---

### Task 6: Update Owner Pages (Part 2) — ActiveLoans, Inventory, InventoryAudit, AuctionItems, OverdueItems

**Files:**
- Modify: `src/pages/owner/ActiveLoans.jsx`
- Modify: `src/pages/owner/Inventory.jsx`
- Modify: `src/pages/owner/InventoryAudit.jsx`
- Modify: `src/pages/owner/AuctionItems.jsx`
- Modify: `src/pages/owner/OverdueItems.jsx`

- [ ] **Step 1: Update ActiveLoans.jsx**

Change import to `import { Sidebar, Header } from '../../components/layout';`
Remove `user={currentUser}` from Sidebar. Add `<Header user={currentUser} />` inside `admin-main`.

- [ ] **Step 2: Update Inventory.jsx**

Same pattern.

- [ ] **Step 3: Update InventoryAudit.jsx**

Same pattern.

- [ ] **Step 4: Update AuctionItems.jsx**

Same pattern.

- [ ] **Step 5: Update OverdueItems.jsx**

Same pattern.

- [ ] **Step 6: Commit**

```bash
git add src/pages/owner/ActiveLoans.jsx src/pages/owner/Inventory.jsx src/pages/owner/InventoryAudit.jsx src/pages/owner/AuctionItems.jsx src/pages/owner/OverdueItems.jsx
git commit -m "feat: add Header component to ActiveLoans, Inventory, InventoryAudit, AuctionItems, OverdueItems"
```

---

### Task 7: Update Owner Pages (Part 3) — Reports, SubscriptionPage, KycPage, Appraisal Workspaces

**Files:**
- Modify: `src/pages/owner/Reports.jsx`
- Modify: `src/pages/owner/SubscriptionPage.jsx`
- Modify: `src/pages/owner/KycPage.jsx`
- Modify: `src/pages/owner/appraisals/AppraiserWorkspace.jsx`
- Modify: `src/pages/owner/appraisals/ManagerWorkspace.jsx`
- Modify: `src/pages/owner/appraisals/OwnerWorkspace.jsx`

- [ ] **Step 1: Update Reports.jsx**

Change import to `import { Sidebar, Header } from '../../components/layout';`
Remove `user={currentUser}` from Sidebar. Add `<Header user={currentUser} />` inside `admin-main`.

- [ ] **Step 2: Update SubscriptionPage.jsx**

Same pattern.

- [ ] **Step 3: Update KycPage.jsx**

Same pattern.

- [ ] **Step 4: Update AppraiserWorkspace.jsx**

Change import to `import { Sidebar, Header } from '../../../components/layout'` (note: 3 levels up).
Remove `user={currentUser}` from Sidebar. Add `<Header user={currentUser} />` inside `admin-main`.

- [ ] **Step 5: Update ManagerWorkspace.jsx**

Same pattern (3 levels up import path).

- [ ] **Step 6: Update OwnerWorkspace.jsx**

Same pattern (3 levels up import path). Note: OwnerWorkspace has TWO `admin-layout` blocks (conditional rendering). Update BOTH.

- [ ] **Step 7: Commit**

```bash
git add src/pages/owner/Reports.jsx src/pages/owner/SubscriptionPage.jsx src/pages/owner/KycPage.jsx src/pages/owner/appraisals/AppraiserWorkspace.jsx src/pages/owner/appraisals/ManagerWorkspace.jsx src/pages/owner/appraisals/OwnerWorkspace.jsx
git commit -m "feat: add Header component to Reports, Subscription, KYC, and Appraisal workspaces"
```

---

### Task 8: Update SuperAdmin Pages

**Files:**
- Modify: `src/pages/superadmin/SuperAdminDash.jsx`
- Modify: `src/pages/superadmin/Tenants.jsx`
- Modify: `src/pages/superadmin/Reports.jsx`
- Modify: `src/pages/superadmin/SalesReport.jsx`
- Modify: `src/pages/superadmin/AuditLogs.jsx`
- Modify: `src/pages/superadmin/Backup.jsx`
- Modify: `src/pages/superadmin/SuperAdminSettings.jsx`
- Modify: `src/pages/superadmin/Admins.jsx`

- [ ] **Step 1: Update SuperAdminDash.jsx**

Change import to `import { Sidebar, Header } from '../../components/layout'`
Remove `user={currentUser}` from Sidebar. Add `<Header user={currentUser} />` inside `admin-main`.

- [ ] **Step 2: Update Tenants.jsx**

Same pattern.

- [ ] **Step 3: Update Reports.jsx (superadmin)**

Same pattern.

- [ ] **Step 4: Update SalesReport.jsx**

Same pattern.

- [ ] **Step 5: Update AuditLogs.jsx**

Same pattern.

- [ ] **Step 6: Update Backup.jsx**

Same pattern.

- [ ] **Step 7: Update SuperAdminSettings.jsx**

Same pattern.

- [ ] **Step 8: Update Admins.jsx**

Same pattern.

- [ ] **Step 9: Commit**

```bash
git add src/pages/superadmin/SuperAdminDash.jsx src/pages/superadmin/Tenants.jsx src/pages/superadmin/Reports.jsx src/pages/superadmin/SalesReport.jsx src/pages/superadmin/AuditLogs.jsx src/pages/superadmin/Backup.jsx src/pages/superadmin/SuperAdminSettings.jsx src/pages/superadmin/Admins.jsx
git commit -m "feat: add Header component to all SuperAdmin pages"
```

---

### Task 9: Smoke Test — Build Verification

**Files:** None (verification only)

- [ ] **Step 1: Run the dev build to check for compilation errors**

```bash
cd "c:/Users/Jefferson B. Pile/Documents/VS Code/obsidian-pmtp-mng" && npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 2: Fix any compilation errors found**

If the build reports errors (unused imports, missing references, etc.), fix them in the relevant files.

- [ ] **Step 3: Run dev server and verify visually**

```bash
npm run dev
```

Open the app, verify:
- Sidebar collapses smoothly (right-to-left, no jank)
- Sidebar expands smoothly (left-to-right)
- Settings link is pinned at the bottom with a horizontal divider
- Header bar shows "Obsidian" on left, avatar on right
- Clicking avatar opens user menu dropdown (drops down from top-right)
- Account link and Logout work correctly
- Mobile drawer still functions correctly

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve build issues from sidebar/header redesign"
```
