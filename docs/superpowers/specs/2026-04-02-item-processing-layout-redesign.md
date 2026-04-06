# Item Processing Layout Redesign

> **Date:** 2026-04-02
> **Status:** Approved
> **Scope:** UI layout change only — no backend/API/routing changes

---

## Problem

The Item Processing page (CashierWorkspace) uses horizontal tabs for its three sections (Accept Item, My Submissions, Ticket Issuance). This looks visually unpleasing and inconsistent with the rest of the app, where the Settings/Profile page uses a collapsible secondary sidebar for sub-navigation.

## Solution

Replace the horizontal tab bar with a secondary sidebar (`SettingsNav`), reusing the same pattern from ProfilePage. The secondary sidebar sits between the main Sidebar and the content area, providing a cleaner visual hierarchy.

---

## Design

### 1. Extract Shared SettingsNav Component

**Current state:** `SettingsNav` is defined inline in `src/pages/owner/ProfilePage.jsx` (lines 32-84) with hardcoded nav items.

**Change:** Extract to `src/components/layout/SettingsNav.jsx` as a shared component.

**Props:**

| Prop | Type | Purpose |
|------|------|---------|
| `items` | `Array<{id, label, icon}>` | Nav items to render |
| `activeId` | `string` | Currently active item |
| `onSelect` | `(id) => void` | Click handler |
| `title` | `string` | Header label (e.g. "Account Settings" or "Item Processing") |
| `badge` | `object` | Optional badge counts per item id (e.g. `{issuance: 3}`) |

- Collapsible: toggles between full width (w-52) and icon-only (w-[50px])
- Smooth transition animation (`transition-[width] duration-300 ease-in-out`)
- Hidden on mobile (`hidden md:flex`)
- ProfilePage imports this and passes Account/Security/Preferences items
- Scroll-sync logic stays in ProfilePage, not in the shared component

### 2. CashierWorkspace Layout Change

**Current layout:**
```
Sidebar -> admin-main -> [breadcrumb + page header + horizontal tabs + tab content]
```

**New layout:**
```
Sidebar -> SettingsNav -> admin-main -> [breadcrumb + page header + active section content]
```

**Details:**
- Remove the horizontal tab bar entirely
- Add `SettingsNav` between `Sidebar` and `admin-main`, same as ProfilePage
- `activeTab` state driven by `SettingsNav`'s `onSelect` callback
- Breadcrumb updates to show active section (e.g. "Transactions / Item Processing / Accept Item")
- Page header and subtitle remain above the content area
- Each section renders exclusively based on `activeTab` (no scroll-sync)
- Badge count on Ticket Issuance moves from tab badge to sidebar badge

**Icons (same as current tabs):**
- Accept Item: plus-circle
- My Submissions: clipboard/document list
- Ticket Issuance: document/receipt

**Mobile fallback:** On screens below `md` breakpoint where `SettingsNav` is hidden, show a compact horizontal pill selector at the top of the content area so cashiers on tablets/phones can still switch sections.

### 3. CSS Renaming

Rename semantically imprecise class names in `src/index.css`:

| Old Name | New Name |
|----------|----------|
| `.profile-settings-nav` | `.sub-nav` |
| `.profile-settings-link` | `.sub-nav-link` |

Update all references in ProfilePage and CashierWorkspace. No new CSS classes needed for the mobile pill fallback (use Tailwind utilities).

---

## Files Touched

| File | Change |
|------|--------|
| `src/components/layout/SettingsNav.jsx` | **New** — extracted shared component |
| `src/pages/owner/ProfilePage.jsx` | Remove inline SettingsNav, import shared, pass props |
| `src/pages/owner/appraisals/CashierWorkspace.jsx` | Replace horizontal tabs with SettingsNav, add mobile fallback |
| `src/index.css` | Rename `.profile-settings-*` to `.sub-nav-*` |

## Not Changing

- No backend or API changes
- No new dependencies
- No routing changes
- No changes to form logic, modals, or print views
- No changes to the main Sidebar component
