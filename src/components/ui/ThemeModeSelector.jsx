import { useTheme } from '../../context'

const options = [
  { mode: 'light', icon: 'light_mode', label: 'Light mode' },
  { mode: 'system', icon: 'desktop_windows', label: 'System theme' },
  { mode: 'dark', icon: 'dark_mode', label: 'Dark mode' },
]

const ThemeModeSelector = ({ className = '' }) => {
  const { themeMode, setThemeMode } = useTheme()

  return (
    <div
      role="radiogroup"
      aria-label="Theme mode"
      className={`inline-flex items-center gap-0.5 rounded-sm border border-neutral-200 dark:border-neutral-800 p-0.5 ${className}`}
    >
      {options.map(({ mode, icon, label }) => {
        const active = themeMode === mode
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            onClick={() => setThemeMode(mode)}
            className={[
              'flex items-center justify-center w-8 h-8 rounded-sm transition-colors',
              active
                ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white',
            ].join(' ')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
              {icon}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export default ThemeModeSelector
