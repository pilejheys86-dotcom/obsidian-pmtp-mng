# Sidebar & Header Redesign — Supabase-Style Layout

**Date:** 2026-03-31
**Approach:** A — Refactor Sidebar + Add Shared Header

---

## Summary

Redesign the admin layout to match Supabase's sidebar/header pattern:
1. Move user profile from sidebar footer to a persistent header bar (top-right)
2. Pin Settings link to the bottom of the sidebar with a horizontal divider
3. Fix sidebar collapse animation to smooth right-to-left / left-to-right clipping (no jank)

---

## Section 1: Sidebar Restructure

### Structure (top to bottom)
- **Header**: Logo + collapse toggle (unchanged)
- **Main nav**: All categories except Settings link — scrollable, `overflow: hidden`
- **Divider**: Horizontal line, pinned above bottom section
- **Bottom section**: Settings link only, pinned to bottom. When collapsed, shows icon-only (same behavior as other sidebar links)
- **Footer**: Removed (user avatar/menu moves to Header)

### Collapse Animation Fix
- Remove all individual element animations on text/categories (`opacity`, `translate`, `hidden` classes)
- Set `overflow: hidden` on the sidebar container
- Animate only `width` via CSS transition (`w-64` → `w-[50px]`)
- Text clips naturally as sidebar narrows — no separate text animations needed
- Smooth right-to-left (collapse) and left-to-right (expand) motion

### Navigation Config
- Filter the Settings item (`path: '/admin/settings'` or `path: '/superadmin/settings'`) out of the main nav loop
- Render it separately in the pinned bottom section

---

## Section 2: Header Component

### File
`src/components/layout/Header.jsx` (new file)

### Structure
- Persistent bar at the top of `admin-main` (inside main content area, does not span the sidebar)
- **Left side**: "Obsidian" text in display font (Plus Jakarta Sans)
- **Right side**: User avatar circle (initials) — click opens `UserMenu` dropdown

### Styling
- Height: `h-16`
- Background: same as content area (`bg-background-light dark:bg-background-dark`)
- Bottom border: `border-b border-neutral-200 dark:border-neutral-700`
- Sticky at top so it stays visible when scrolling

### UserMenu Repositioning
- Move `UserMenu` component from `Sidebar.jsx` to `Header.jsx`
- Change positioning from `absolute bottom-full left-2` to `absolute top-full right-0`
- Dropdown anchors from top-right (drops down from avatar)
- Same menu items: user info header, Account link, divider, Logout
- `LogoutConfirmModal` also moves to `Header.jsx`

---

## Section 3: Page Integration

### Change Pattern (all admin/owner pages)

**Before:**
```jsx
<div className="admin-layout">
  <Sidebar navigation={...} user={...} currentPath={...} />
  <main className="admin-main">
    <div className="admin-content">...</div>
  </main>
</div>
```

**After:**
```jsx
<div className="admin-layout">
  <Sidebar navigation={...} currentPath={...} />
  <main className="admin-main">
    <Header user={...} />
    <div className="admin-content">...</div>
  </main>
</div>
```

### Changes per page
- Remove `user` prop from `<Sidebar>`
- Add `<Header user={...} />` inside `admin-main`, above `admin-content`
- Add `Header` to imports from `../../components/layout`

### Affected pages
- AdminDash, ProfilePage, SettingsPage, ActiveLoans, Inventory, Appraisals, AuctionItems, Customers, Employee, InventoryAudit, OverdueItems, Reports, SubscriptionPage, KycPage
- SuperAdmin pages (SuperAdminDash, SuperAdminTenants, SuperAdminReports, SuperAdminSalesReport, SuperAdminAuditLogs, SuperAdminBackup, SuperAdminSettings, SuperAdminAdmins)

### CSS Adjustments
- `admin-content`: reduce `pt-16` since header is now a separate element
- `admin-header`: repurpose for the new Header component

---

## Section 4: Mobile Behavior

- **Sidebar**: Keeps current drawer behavior (slide in/out from left with backdrop). Always expanded when open.
- **Header**: Same persistent bar with reduced padding. "Obsidian" left, avatar right.
- **Hamburger**: Remains, overlaps header area.
- Animation fix only affects desktop icon-rail transition — no mobile changes.

---

## Files Modified

| File | Change |
|------|--------|
| `src/components/layout/Sidebar.jsx` | Remove UserMenu/footer, fix collapse animation, pin Settings to bottom |
| `src/components/layout/Header.jsx` | New — persistent header with avatar + UserMenu |
| `src/components/layout/index.js` | Export Header |
| `src/index.css` | Update sidebar animation classes, add header styles, adjust admin-content padding |
| `src/pages/owner/*.jsx` (14 files) | Add Header import + usage, remove user prop from Sidebar |
| `src/pages/superadmin/*.jsx` (8 files, if applicable) | Same pattern |
