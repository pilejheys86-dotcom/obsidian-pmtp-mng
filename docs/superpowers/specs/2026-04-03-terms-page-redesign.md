# Terms Page Redesign — Spec

**Date:** 2026-04-03
**File:** `src/pages/public/TermsPage.jsx`
**Routes:** `/terms` (public), `/admin/terms` (admin layout)

---

## Goal

Improve the Terms and Conditions page so that:
1. The page always opens at the top, regardless of prior scroll position.
2. Users can navigate between the 13 sections at any time via a persistent sidebar (desktop) or a slide-in drawer (mobile) — styled after the Laravel Cloud legal page.

---

## Layout — Desktop (≥ 768px)

The page shifts from a single narrow column (`max-w-3xl`) to a two-column layout inside a wider container (`max-w-6xl`).

### Structure

```
[ Navbar ]
[ Hero: "Legal" badge · "Terms and Conditions" heading · effective date ]
┌─────────────────────────────────────────────────────────────┐
│  Sidebar (sticky, 220px)  │  Content (flex-1)               │
│  ─────────────────────    │  ────────────────────────────── │
│  On this page             │  1. Definitions                  │
│  > 1. Definitions ←active │     bullet list…                 │
│    2. Acceptance          │  2. Acceptance of Terms          │
│    3. Registration        │     paragraph + bullets…         │
│    …                      │  …                               │
└─────────────────────────────────────────────────────────────┘
[ Footer ]
```

### Sidebar behaviour

- `position: sticky; top: <navbar height>` — stays in view as the content scrolls.
- Active section item: `border-left: 2px solid #A3E635` + `font-weight: 700` + `color: neutral-900 / neutral-100`.
- Inactive items: `color: neutral-400`, no border.
- Section numbers rendered in lime-green (`#A3E635`), slightly smaller than the label.
- No item hover background — only color shift on hover (`neutral-600` → `neutral-900`).
- Clicking a link smooth-scrolls to the section anchor and closes the mobile drawer.
- The existing inline **Table of Contents block is removed** (replaced entirely by the sidebar).

### Active section tracking

Use a single `IntersectionObserver` watching all section heading elements (`h2[id]`). When a heading enters the viewport, set that section as active. Observer options: `rootMargin: '-10% 0px -80% 0px'` so the active section changes near the top of the viewport, not the middle.

---

## Layout — Mobile (< 768px)

Single-column, same as today. The sidebar is hidden.

### Floating "Sections" button

- Fixed position: `bottom: 24px; right: 20px`.
- Pill-shaped dark button: `bg-neutral-900 dark:bg-white`, rounded-full, with a small lime-green dot and the label "Sections".
- Always visible while on the page (no hide-on-scroll logic needed).
- Tapping opens the sections drawer.

### Sections drawer

- Slides in from the left: `transform: translateX(-100%)` → `translateX(0)`, `transition: 300ms ease`.
- Covers ~75% of the viewport width, max 280px.
- Semi-transparent dark backdrop (`bg-black/40`) covers the remainder.
- Contains the same "On this page" list with the same active-section indicator.
- Tapping any section link: navigates to anchor + closes drawer.
- Tapping the backdrop: closes drawer.
- `aria-label="Section navigation"` on the drawer element for accessibility.

---

## Scroll-to-top on mount

Add `useEffect(() => { window.scrollTo(0, 0) }, [])` inside `TermsContent`. This fires for both `/terms` and `/admin/terms` routes because both render `TermsContent`.

---

## Component structure (within TermsPage.jsx)

No new files. All changes stay in `src/pages/public/TermsPage.jsx`.

New local state (inside `TermsContent`):
- `activeSection` (string) — id of the currently-visible section.
- `drawerOpen` (boolean) — mobile drawer open state.

New hooks used:
- `useEffect` (already imported via React) — for scroll-to-top and IntersectionObserver setup.
- `useState` — for `activeSection` and `drawerOpen`.

Removed:
- The `useScrollReveal` call on `heroRef` in `TermsContent` (the hero no longer needs reveal animation — it's visible on load by definition since we scroll to top).
- The entire `<section>` containing the inline Table of Contents block.

---

## Styling notes

- Follow the existing CSS-first approach: add any new component classes to `src/index.css` using `@apply` if they're multi-property; otherwise use Tailwind utility classes inline.
- Sidebar width: `w-56` (224px) on `lg:` breakpoint and up. Hidden (`hidden lg:block`) below that.
- Content column: `min-w-0 flex-1` to prevent overflow.
- `scroll-mt-24` on `SectionHeading` already handles offset for the sticky navbar — no change needed there.
- Drawer z-index: `z-50` (above everything except modals).

---

## What is NOT changing

- All section content (text, bullets, category blocks) — unchanged.
- `SectionHeading`, `Paragraph`, `BulletList`, `CategoryBlock` components — unchanged.
- `TermsPage` outer shell (public vs. admin layout switch) — unchanged.
- Navbar and Footer — unchanged.
- `/admin/terms` route — gets the same improvements automatically since it renders `TermsContent`.

---

## Acceptance criteria

1. Navigating to `/terms` or `/admin/terms` always opens the page scrolled to the very top.
2. On desktop (≥ 1024px), a sticky left sidebar shows all 13 sections; the active section has a lime-green left border and bold text.
3. Active section updates automatically as the user scrolls through the content.
4. On mobile (< 1024px), no sidebar is visible; a floating "Sections" pill button appears at bottom-right.
5. Tapping "Sections" slides in a left drawer with the full section list and active indicator.
6. Tapping a section in the drawer navigates to that section and closes the drawer.
7. Tapping the backdrop closes the drawer without navigating.
8. The inline Table of Contents block no longer appears on the page.
9. Dark mode works correctly for all new elements.
