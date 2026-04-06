import { useState } from 'react'
import { Logo } from './ui'

const Navbar = () => {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <nav className="fixed top-0 w-full z-50 bg-white/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-neutral-200 dark:border-neutral-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between">
        <Logo />
        <div className="hidden md:flex items-center gap-8">
          <a className="text-sm font-semibold hover:text-neutral-900 dark:hover:text-white transition-colors" href="/#features">Features</a>
          <a className="text-sm font-semibold hover:text-neutral-900 dark:hover:text-white transition-colors" href="/process">Process</a>
          <a className="text-sm font-semibold hover:text-neutral-900 dark:hover:text-white transition-colors" href="/pricing">Pricing</a>
          <a className="text-sm font-semibold hover:text-neutral-900 dark:hover:text-white transition-colors" href="/about">About</a>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <a className="hidden md:inline-flex text-sm font-semibold min-h-[44px] items-center px-2" href="/login">Log In</a>
          <a className="hidden md:inline-flex bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 px-5 sm:px-6 py-2.5 rounded-full font-bold transition-all transform hover:scale-105 min-h-[44px] items-center text-sm" href="/register">
            Sign Up
          </a>
          {/* Mobile hamburger */}
          <button
            className="md:hidden flex items-center justify-center w-11 h-11 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            <span className="material-symbols-outlined text-xl">{mobileOpen ? 'close' : 'menu'}</span>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-neutral-200 dark:border-neutral-800 bg-white/95 dark:bg-background-dark/95 backdrop-blur-md px-4 pb-4 pt-2">
          <div className="flex flex-col gap-1">
            <a className="text-sm font-semibold py-3 px-3 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors" href="/#features" onClick={() => setMobileOpen(false)}>Features</a>
            <a className="text-sm font-semibold py-3 px-3 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors" href="/process" onClick={() => setMobileOpen(false)}>Process</a>
            <a className="text-sm font-semibold py-3 px-3 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors" href="/pricing" onClick={() => setMobileOpen(false)}>Pricing</a>
            <a className="text-sm font-semibold py-3 px-3 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors" href="/about" onClick={() => setMobileOpen(false)}>About</a>
          </div>
          <div className="flex gap-3 mt-3 pt-3 border-t border-neutral-200 dark:border-neutral-800">
            <a className="flex-1 text-center text-sm font-bold py-3 rounded-md border border-neutral-300 dark:border-neutral-700 min-h-[44px] flex items-center justify-center" href="/login">Log In</a>
            <a className="flex-1 text-center bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-bold py-3 rounded-md min-h-[44px] flex items-center justify-center" href="/register">Sign Up</a>
          </div>
        </div>
      )}
    </nav>
  )
}

export default Navbar
