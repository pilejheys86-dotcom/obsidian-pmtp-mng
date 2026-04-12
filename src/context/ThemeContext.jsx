import { createContext, useCallback, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext(undefined)

const STORAGE_KEY = 'theme-mode'
const VALID_MODES = ['light', 'dark', 'system']

const readStoredMode = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return VALID_MODES.includes(stored) ? stored : 'system'
  } catch {
    return 'system'
  }
}

const systemPrefersDark = () =>
  window.matchMedia('(prefers-color-scheme: dark)').matches

export const ThemeProvider = ({ children }) => {
  const [themeMode, setThemeModeState] = useState(readStoredMode)
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const mode = readStoredMode()
    return mode === 'dark' || (mode === 'system' && systemPrefersDark())
  })

  useEffect(() => {
    const root = window.document.documentElement
    if (isDarkMode) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }, [isDarkMode])

  useEffect(() => {
    if (themeMode !== 'system') {
      setIsDarkMode(themeMode === 'dark')
      return
    }
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    setIsDarkMode(mediaQuery.matches)
    const handleChange = (e) => setIsDarkMode(e.matches)
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [themeMode])

  const setThemeMode = useCallback((mode) => {
    if (!VALID_MODES.includes(mode)) return
    setThemeModeState(mode)
    try {
      localStorage.setItem(STORAGE_KEY, mode)
    } catch {
      // ignore storage errors (private mode, quota)
    }
  }, [])

  const toggleTheme = useCallback(() => {
    setThemeMode(isDarkMode ? 'light' : 'dark')
  }, [isDarkMode, setThemeMode])

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleTheme, themeMode, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
