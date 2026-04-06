# Item Processing Layout Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the horizontal tab bar in CashierWorkspace with a collapsible secondary sidebar (matching ProfilePage's SettingsNav pattern) for a cleaner visual hierarchy.

**Architecture:** Extract the inline `SettingsNav` component from `ProfilePage.jsx` into a shared layout component. CashierWorkspace adopts the same three-column layout (`Sidebar → SettingsNav → admin-main`). The shared component accepts configurable nav items, title, active state, and optional badge counts. No backend changes.

**Tech Stack:** React 18, TailwindCSS 4, Material Symbols icons

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/components/layout/SettingsNav.jsx` | **Create** | Shared collapsible secondary sidebar component |
| `src/components/layout/index.js` | **Modify** | Add SettingsNav export |
| `src/pages/owner/ProfilePage.jsx` | **Modify** | Remove inline SettingsNav, import shared one |
| `src/pages/owner/appraisals/CashierWorkspace.jsx` | **Modify** | Replace horizontal tabs with SettingsNav, add mobile fallback |
| `src/index.css` | **Modify** | Rename `.profile-settings-nav` → `.sub-nav`, `.profile-settings-link` → `.sub-nav-link`, `.profile-settings-link.active` → `.sub-nav-link.active` |
| `src/pages/owner/SettingsPage.jsx` | **Modify** | Update CSS class names to match rename |

---

### Task 1: Create shared SettingsNav component

**Files:**
- Create: `src/components/layout/SettingsNav.jsx`

- [ ] **Step 1: Create `src/components/layout/SettingsNav.jsx`**

```jsx
import { useState } from 'react';

const SettingsNav = ({ items, activeId, onSelect, title, badge = {} }) => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`hidden md:flex flex-col flex-shrink-0 h-full border-r border-neutral-200 dark:border-neutral-800 bg-background-light dark:bg-background-dark transition-[width] duration-300 ease-in-out overflow-hidden ${collapsed ? 'w-[50px]' : 'w-52'}`}
    >
      {/* Header */}
      <div className={`flex items-center h-12 border-b border-neutral-200 dark:border-neutral-800 px-3 shrink-0 ${collapsed ? 'justify-center' : 'justify-between'}`}>
        {!collapsed && (
          <span className="text-xs font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500 truncate">
            {title}
          </span>
        )}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700/50 p-1.5 rounded-md transition-all flex items-center justify-center shrink-0"
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          <span className="material-symbols-outlined text-[20px]">
            {collapsed ? 'dock_to_right' : 'dock_to_left'}
          </span>
        </button>
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
              className={`flex items-center gap-2.5 rounded-md text-[13px] font-medium transition-all duration-150
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
                <span className="ml-auto px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-primary text-neutral-900 leading-none">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </aside>
  );
};

export default SettingsNav;
```

- [ ] **Step 2: Verify file created**

Run: `cat src/components/layout/SettingsNav.jsx | head -5`
Expected: Shows the import line and component declaration.

- [ ] **Step 3: Add export to `src/components/layout/index.js`**

Find the existing exports in `src/components/layout/index.js` and add:

```js
export { default as SettingsNav } from './SettingsNav';
```

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/SettingsNav.jsx src/components/layout/index.js
git commit -m "feat(layout): extract shared SettingsNav component from ProfilePage"
```

---

### Task 2: Update ProfilePage to use shared SettingsNav

**Files:**
- Modify: `src/pages/owner/ProfilePage.jsx`

- [ ] **Step 1: Replace the import line to include SettingsNav**

Change:

```jsx
import { Sidebar, Header } from '../../components/layout';
```

To:

```jsx
import { Sidebar, Header, SettingsNav } from '../../components/layout';
```

- [ ] **Step 2: Remove the inline SettingsNav component (lines 32-84)**

Delete the entire `const SettingsNav = ({ activeId, onItemClick }) => { ... };` block (lines 32-84 in the current file).

- [ ] **Step 3: Update SettingsNav usage in the JSX**

Change:

```jsx
<SettingsNav activeId={activeSection} onItemClick={scrollTo} />
```

To:

```jsx
<SettingsNav
  items={SECTIONS}
  activeId={activeSection}
  onSelect={scrollTo}
  title="Account Settings"
/>
```

- [ ] **Step 4: Verify the app builds**

Run: `npx vite build --mode development 2>&1 | tail -5`
Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/owner/ProfilePage.jsx
git commit -m "refactor(profile): use shared SettingsNav component"
```

---

### Task 3: Update CashierWorkspace to use SettingsNav

**Files:**
- Modify: `src/pages/owner/appraisals/CashierWorkspace.jsx`

- [ ] **Step 1: Add SettingsNav to the import**

Change:

```jsx
import { Sidebar, Header } from '../../../components/layout'
```

To:

```jsx
import { Sidebar, Header, SettingsNav } from '../../../components/layout'
```

- [ ] **Step 2: Define the nav items array**

The existing `tabs` array (lines 148-152) is defined inside the component after hooks. Keep it but rename to `NAV_ITEMS` and move it outside the component (above `CashierWorkspace`), removing the dynamic `badge` property:

```jsx
const NAV_ITEMS = [
  { id: 'intake', label: 'Accept Item', icon: 'add_circle' },
  { id: 'my-items', label: 'My Submissions', icon: 'inventory_2' },
  { id: 'issuance', label: 'Ticket Issuance', icon: 'receipt_long' },
]
```

Delete the old `tabs` array (lines 148-152).

- [ ] **Step 3: Update the print view layout to include SettingsNav**

In the print view return block (lines 155-175), add `SettingsNav` between `Sidebar` and `main`:

```jsx
if (view === 'print' && printData) {
  return (
    <div className="admin-layout">
      <Sidebar navigation={navItems} currentPath={currentPath} onNavigate={setCurrentPath} />
      <SettingsNav
        items={NAV_ITEMS}
        activeId={activeTab}
        onSelect={setActiveTab}
        title="Item Processing"
        badge={{ issuance: stats.readyForRelease }}
      />
      <main className="admin-main">
        <Header user={currentUser} />
        <div className="admin-content custom-scrollbar">
          <div className="flex items-center gap-3 mb-6 print:hidden">
            <button onClick={() => { setView('list'); setPrintData(null) }} className="text-sm text-neutral-400 hover:text-primary transition-colors flex items-center gap-1">
              <span className="material-symbols-outlined text-lg">arrow_back</span> Back to queue
            </button>
            <button onClick={() => window.print()} className="btn-primary text-sm ml-auto">
              <span className="material-symbols-outlined text-sm mr-1.5">print</span> Print Ticket
            </button>
          </div>
          <PawnTicketPrint ticket={printData.ticket} item={printData.item} profile={profile} />
        </div>
      </main>
    </div>
  )
}
```

- [ ] **Step 4: Update the main return layout**

Replace the main return block. Add `SettingsNav` between `Sidebar` and `main`. Remove the horizontal tab bar (lines 200-218). Add a mobile fallback pill selector. Keep all tab content sections unchanged.

The main return becomes:

```jsx
return (
  <div className="admin-layout">
    <Sidebar navigation={navItems} currentPath={currentPath} onNavigate={setCurrentPath} />
    <SettingsNav
      items={NAV_ITEMS}
      activeId={activeTab}
      onSelect={setActiveTab}
      title="Item Processing"
      badge={{ issuance: stats.readyForRelease }}
    />
    <main className="admin-main">
      <Header user={currentUser} />
      <div className="admin-content custom-scrollbar">

        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <nav className="flex mb-2" aria-label="Breadcrumb">
              <ol className="flex items-center space-x-2">
                <li><span className="text-neutral-400 dark:text-neutral-500 text-sm font-medium">Transactions</span></li>
                <li><span className="text-neutral-300 dark:text-neutral-600 text-sm">/</span></li>
                <li><span className="text-neutral-400 dark:text-neutral-500 text-sm font-medium">Item Processing</span></li>
                <li><span className="text-neutral-300 dark:text-neutral-600 text-sm">/</span></li>
                <li><span className="text-neutral-700 dark:text-white text-sm font-semibold">{NAV_ITEMS.find(n => n.id === activeTab)?.label}</span></li>
              </ol>
            </nav>
            <h1 className="text-2xl font-display font-bold text-neutral-800 dark:text-neutral-100">Item Processing</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Accept items, track progress, and issue pawn tickets</p>
          </div>
        </div>

        {/* Mobile tab selector (visible only below md) */}
        <div className="flex md:hidden gap-1 mb-6 overflow-x-auto">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                activeTab === item.id
                  ? 'bg-primary text-neutral-900'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400'
              }`}
            >
              <span className="material-symbols-outlined text-sm">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>

        {/* ═══ ACCEPT ITEM TAB ═══ */}
        {activeTab === 'intake' && (
          /* ... existing intake content unchanged ... */
        )}

        {/* ═══ MY SUBMISSIONS TAB ═══ */}
        {activeTab === 'my-items' && (
          /* ... existing my-items content unchanged ... */
        )}

        {/* ═══ TICKET ISSUANCE TAB ═══ */}
        {activeTab === 'issuance' && (
          /* ... existing issuance content unchanged ... */
        )}

        {/* Issue Ticket Modal — unchanged */}
        {/* Decline Modal — unchanged */}

      </div>
    </main>
  </div>
)
```

**Important:** The three tab content sections (`{activeTab === 'intake' && (...)}`, `{activeTab === 'my-items' && (...)}`, `{activeTab === 'issuance' && (...)}`) and both modals at the bottom remain exactly as they are today. Only the wrapper layout and tab bar change.

- [ ] **Step 5: Verify the app builds**

Run: `npx vite build --mode development 2>&1 | tail -5`
Expected: Build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add src/pages/owner/appraisals/CashierWorkspace.jsx
git commit -m "refactor(cashier): replace horizontal tabs with SettingsNav secondary sidebar"
```

---

### Task 4: Rename CSS classes from profile-specific to generic

**Files:**
- Modify: `src/index.css`
- Modify: `src/pages/owner/SettingsPage.jsx`

- [ ] **Step 1: Rename classes in `src/index.css`**

Find and replace these three class definitions:

`.profile-settings-nav` → `.sub-nav`
`.profile-settings-link` → `.sub-nav-link`
`.profile-settings-link.active` → `.sub-nav-link.active`

- [ ] **Step 2: Update references in `src/pages/owner/SettingsPage.jsx`**

Find and replace:

`profile-settings-nav` → `sub-nav`
`profile-settings-link` → `sub-nav-link`

- [ ] **Step 3: Verify no remaining references to old class names**

Run: `grep -r "profile-settings-nav\|profile-settings-link" src/`
Expected: No output (no matches).

- [ ] **Step 4: Verify the app builds**

Run: `npx vite build --mode development 2>&1 | tail -5`
Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/index.css src/pages/owner/SettingsPage.jsx
git commit -m "refactor(css): rename profile-settings-* classes to sub-nav-*"
```

---

### Task 5: Final verification

- [ ] **Step 1: Run full build**

Run: `npx vite build 2>&1 | tail -10`
Expected: Build succeeds, no warnings about missing imports or unused variables.

- [ ] **Step 2: Verify no leftover horizontal tab references in CashierWorkspace**

Run: `grep -n "border-b-2\|tab\.badge\|tabs\.map" src/pages/owner/appraisals/CashierWorkspace.jsx`
Expected: No output (old tab bar code fully removed).

- [ ] **Step 3: Verify SettingsNav is imported in both pages**

Run: `grep -n "SettingsNav" src/pages/owner/ProfilePage.jsx src/pages/owner/appraisals/CashierWorkspace.jsx`
Expected: Both files show `import { ... SettingsNav }` and `<SettingsNav` usage.
