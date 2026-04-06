import { useTheme } from '../../context'

const ThemeToggle = ({ className = '' }) => {
  const { isDarkMode, toggleTheme } = useTheme()

  return (
    <button
      onClick={toggleTheme}
      className={`dark-mode-toggle ${className}`}
      aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <span className="material-symbols-outlined text-xl">
        {isDarkMode ? 'light_mode' : 'dark_mode'}
      </span>
    </button>
  )
}

export default ThemeToggle
