# Terms Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `TermsPage.jsx` so it always scrolls to top on load and provides a sticky left sidebar (desktop) / floating drawer (mobile) for section navigation, matching the Laravel Cloud legal page style.

**Architecture:** All changes are self-contained in `src/pages/public/TermsPage.jsx`. Two new state variables (`activeSection`, `drawerOpen`) drive the sidebar active indicator and mobile drawer. An `IntersectionObserver` watches all `h2[id]` headings to track the active section. No new files or components are created.

**Tech Stack:** React 18 (`useState`, `useEffect`), TailwindCSS 4, custom client-side routing

---

## File Map

| File | Change |
|------|--------|
| `src/pages/public/TermsPage.jsx` | All changes — imports, state, layout, sidebar, drawer |

---

### Task 1: Update imports

**Files:**
- Modify: `src/pages/public/TermsPage.jsx` lines 1–2

The `useScrollReveal` import is being removed (it was only used for the hero scroll animation, which is no longer needed since the page always opens at the top). `useState` and `useEffect` are added.

- [ ] **Replace lines 1–2** of `src/pages/public/TermsPage.jsx` from:

```jsx
import { Navbar, Footer } from '../../components'
import { useScrollReveal } from '../../lib/useScrollReveal'
```

to:

```jsx
import { useState, useEffect } from 'react'
import { Navbar, Footer } from '../../components'
```

- [ ] **Verify:** no import errors in the terminal running `npm run dev` (the `useScrollReveal` call inside `TermsContent` will cause a runtime error until Task 2 removes it — check after Task 2, not now).

---

### Task 2: Rewrite `TermsContent` — scroll-to-top, state, and hero cleanup

**Files:**
- Modify: `src/pages/public/TermsPage.jsx` — the `TermsContent` function (lines 50–311)

This step:
1. Adds `window.scrollTo(0, 0)` on mount.
2. Adds `activeSection` and `drawerOpen` state.
3. Adds the `IntersectionObserver` effect to track which section is in view.
4. Removes the `heroRef`/`useScrollReveal` usage from the hero div.

- [ ] **Replace the opening of the `TermsContent` function** — everything from `const TermsContent = () => {` up to (but not including) `return (` — with:

```jsx
const TermsContent = () => {
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  const [activeSection, setActiveSection] = useState(sections[0].id)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id)
          }
        })
      },
      { rootMargin: '-10% 0px -80% 0px' }
    )
    const headings = document.querySelectorAll('h2[id]')
    headings.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])
```

- [ ] **Inside the `return`, update the hero `<div>`** — remove `ref={heroRef}` and `reveal-fade-up` class. Change:

```jsx
<div ref={heroRef} className="max-w-3xl mx-auto text-center reveal-fade-up">
```

to:

```jsx
<div className="max-w-3xl mx-auto text-center">
```

- [ ] **Start dev server and navigate to `/terms`.** Confirm:
  - Page opens scrolled to the very top.
  - No console errors about `useScrollReveal` or missing `heroRef`.

- [ ] **Commit:**

```bash
git add src/pages/public/TermsPage.jsx
git commit -m "feat(terms): scroll to top on mount, add active section tracking"
```

---

### Task 3: Remove the inline Table of Contents block

**Files:**
- Modify: `src/pages/public/TermsPage.jsx` — the ToC `<section>` inside `TermsContent`'s return

The inline ToC block (currently between the hero and the sections) is replaced by the sidebar in the next task. Remove it now so there's no duplicate nav.

- [ ] **Delete the entire ToC `<section>` block** from the return statement. It starts with `{/* Table of Contents */}` and ends with `</section>`. The full block to remove:

```jsx
{/* Table of Contents */}
<section className="pb-12 px-6">
  <div className="max-w-3xl mx-auto">
    <div className="bg-stone-100 dark:bg-neutral-900 rounded-sm p-6 md:p-8">
      <h3 className="text-sm font-bold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-4">Table of Contents</h3>
      <nav className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {sections.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400 hover:text-primary transition-colors"
          >
            <span className="text-primary font-bold">{s.number}.</span>
            {s.title}
          </a>
        ))}
      </nav>
    </div>
  </div>
</section>
```

- [ ] **Verify:** navigate to `/terms` — the ToC grid no longer appears between the hero and the first section.

- [ ] **Commit:**

```bash
git add src/pages/public/TermsPage.jsx
git commit -m "feat(terms): remove inline table of contents block"
```

---

### Task 4: Replace the sections wrapper with the two-column layout + sticky sidebar

**Files:**
- Modify: `src/pages/public/TermsPage.jsx` — the sections `<section>` in `TermsContent`'s return

The current sections wrapper is:
```jsx
<section className="pb-24 px-6">
  <div className="max-w-3xl mx-auto space-y-12">
    {/* … 13 section divs … */}
  </div>
</section>
```

Replace it with a two-column flex layout. The 13 section `<div>` elements inside move into the right column unchanged.

- [ ] **Replace the opening wrapper tags** — change:

```jsx
<section className="pb-24 px-6">
  <div className="max-w-3xl mx-auto space-y-12">
```

to:

```jsx
<div className="max-w-6xl mx-auto px-6 pb-24 flex gap-0 lg:gap-12 relative">

  {/* Desktop sticky sidebar */}
  <aside className="hidden lg:block w-56 flex-shrink-0">
    <div className="sticky top-24">
      <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500 mb-4">
        On this page
      </p>
      <nav className="space-y-0.5">
        {sections.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className={`flex items-center gap-2 text-sm py-1.5 pl-3 border-l-2 transition-colors ${
              activeSection === s.id
                ? 'border-primary font-bold text-neutral-900 dark:text-white'
                : 'border-transparent text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
            }`}
          >
            <span className="text-primary text-xs font-bold">{s.number}.</span>
            {s.title}
          </a>
        ))}
      </nav>
    </div>
  </aside>

  {/* Content */}
  <div className="min-w-0 flex-1 space-y-12">
```

- [ ] **Replace the closing wrapper tags** — change:

```jsx
  </div>
</section>
```

(the two closing tags at the very end of the sections block) to:

```jsx
  </div>
</div>
```

- [ ] **Verify on desktop (≥ 1024px viewport):**
  - A "On this page" sidebar appears on the left.
  - All 13 sections are listed with their numbers in lime-green.
  - The first section ("Definitions") has the active left-border indicator on load.
  - Scrolling through the page updates the active section in the sidebar.

- [ ] **Verify on mobile (< 1024px viewport):**
  - The sidebar is hidden — content is single-column as before.

- [ ] **Commit:**

```bash
git add src/pages/public/TermsPage.jsx
git commit -m "feat(terms): add sticky sidebar with active section tracking"
```

---

### Task 5: Add mobile floating button + slide-in drawer

**Files:**
- Modify: `src/pages/public/TermsPage.jsx` — add mobile elements inside `TermsContent`'s return, just before the closing `</>`

- [ ] **Add the following block** immediately before the closing `</>` of `TermsContent`'s return (after the two-column `</div>`):

```jsx
      {/* Mobile: floating Sections button + drawer */}
      <div className="lg:hidden">
        {/* Floating pill button */}
        <button
          onClick={() => setDrawerOpen(true)}
          className="fixed bottom-6 right-5 z-40 flex items-center gap-2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-bold px-4 py-2.5 rounded-full shadow-lg"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
          Sections
        </button>

        {/* Drawer overlay */}
        {drawerOpen && (
          <div
            className="fixed inset-0 z-50 bg-black/40"
            onClick={() => setDrawerOpen(false)}
          >
            <aside
              className="absolute inset-y-0 left-0 w-72 max-w-[80vw] bg-white dark:bg-neutral-900 shadow-2xl overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
              aria-label="Section navigation"
            >
              <div className="p-5 border-b border-neutral-200 dark:border-neutral-700">
                <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
                  On this page
                </p>
              </div>
              <nav className="py-3">
                {sections.map((s) => (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    onClick={() => setDrawerOpen(false)}
                    className={`flex items-center gap-2 text-sm py-2.5 pl-5 border-l-2 transition-colors ${
                      activeSection === s.id
                        ? 'border-primary font-bold text-neutral-900 dark:text-white'
                        : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200'
                    }`}
                  >
                    <span className="text-primary text-xs font-bold">{s.number}.</span>
                    {s.title}
                  </a>
                ))}
              </nav>
            </aside>
          </div>
        )}
      </div>
```

- [ ] **Verify on a mobile viewport (< 1024px, e.g. iPhone SE in DevTools):**
  - A dark rounded-pill "● Sections" button is fixed at the bottom-right of the screen.
  - Tapping it opens a left-side drawer listing all 13 sections with the active section highlighted.
  - Tapping any section link closes the drawer and scrolls to that section.
  - Tapping the semi-transparent backdrop (right of the drawer) closes the drawer without navigating.
  - The floating button does NOT appear on desktop (≥ 1024px).

- [ ] **Commit:**

```bash
git add src/pages/public/TermsPage.jsx
git commit -m "feat(terms): add mobile floating drawer for section navigation"
```

---

### Task 6: Final end-to-end verification

No code changes — validation only.

- [ ] **`/terms` (public route):**
  - [ ] Page opens scrolled to top.
  - [ ] Desktop: sidebar visible, active section updates on scroll.
  - [ ] Mobile: no sidebar, floating button visible, drawer opens/closes correctly.

- [ ] **`/admin/terms` (admin route, if logged in):**
  - [ ] Same behaviour — both routes render `TermsContent`, so all improvements apply.

- [ ] **Dark mode** (toggle via `ThemeToggle`):
  - [ ] Sidebar text, active border, and inactive link colours are correct in dark mode.
  - [ ] Mobile drawer has `dark:bg-neutral-900` background and correct text colours.
  - [ ] Floating button shows `dark:bg-white dark:text-neutral-900`.

- [ ] **Sidebar scroll edge case:**
  - [ ] Scroll to the very bottom of the page — the last section ("Amendments", id `amendments`) becomes active in the sidebar.
  - [ ] Scroll back to the top — "Definitions" becomes active again.

- [ ] **Commit (if no issues):** all prior commits cover the changes — no additional commit needed unless a fix was required during verification.

---

## Self-Review Checklist

| Spec requirement | Covered in task |
|-----------------|----------------|
| Scroll to top on mount | Task 2 |
| Remove `useScrollReveal` (no longer imported) | Task 1 |
| Remove hero `reveal-fade-up` / `ref` | Task 2 |
| IntersectionObserver active tracking | Task 2 |
| Remove inline ToC block | Task 3 |
| Widen layout to `max-w-6xl` | Task 4 |
| Desktop sticky sidebar with left-border active indicator | Task 4 |
| Lime-green section numbers in sidebar | Task 4 |
| Sidebar hidden on mobile (`hidden lg:block`) | Task 4 |
| Floating "Sections" pill button on mobile | Task 5 |
| Left slide-in drawer with active indicator | Task 5 |
| Drawer closes on backdrop tap | Task 5 |
| Drawer closes on section link tap | Task 5 |
| `aria-label` on drawer `<aside>` | Task 5 |
| Dark mode for all new elements | Task 6 (verification) |
| Works on `/admin/terms` | Task 6 (verification) |
