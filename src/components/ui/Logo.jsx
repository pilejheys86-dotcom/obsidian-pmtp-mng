const ObsidianIcon = ({ className = '' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1333.33 1333.33" fill="currentColor" className={className}>
    <rect y="333.17" width="333.17" height="1000"/>
    <rect x="666.67" y="666.67" width="332.49" height="666.5"/>
    <rect x="666.42" y="1000.58" width="333.17" height="999" transform="translate(-1000.42 1999.75) rotate(-90)"/>
    <rect x="500.5" y="500.5" width="333.5" height="665.51" transform="translate(-499.33 1167.17) rotate(-90)"/>
    <rect x="1000" width="333.33" height="333.33"/>
  </svg>
)

const Logo = ({ size = 'default', weight = 'light', className = '' }) => {
  let textSize = 'text-2xl'
  let iconSize = 'w-6 h-6'
  let gap = 'gap-2'
  if (size === 'lg') { textSize = 'text-3xl'; iconSize = 'w-7 h-7'; gap = 'gap-2.5' }
  if (size === 'sm') { textSize = 'text-xl'; iconSize = 'w-5 h-5'; gap = 'gap-1.5' }

  const weightClass = {
    light: 'font-light',
    normal: 'font-normal',
    medium: 'font-medium',
    semibold: 'font-semibold',
    bold: 'font-bold',
  }[weight] || 'font-light'

  return (
    <a href="/" className={`flex items-center ${gap} ${className}`} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
      <ObsidianIcon className={`${iconSize} text-neutral-900 dark:text-white`} />
      <span className={`${textSize} font-display ${weightClass} tracking-tight text-neutral-900 dark:text-white`}>
        Obsidian
      </span>
    </a>
  )
}

export default Logo
