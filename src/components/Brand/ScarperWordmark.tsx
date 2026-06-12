import './ScarperWordmark.css'

interface ScarperWordmarkProps {
  size?: 'sm' | 'lg'
  className?: string
}

export function ScarperWordmark({
  size = 'sm',
  className = '',
}: ScarperWordmarkProps) {
  return (
    <span
      className={`scarper-wordmark scarper-wordmark--${size} ${className}`.trim()}
      aria-label="Scarper"
    >
      <span className="scarper-wordmark__text" aria-hidden>
        Scar<span className="scarper-wordmark__accent">per</span>
      </span>
    </span>
  )
}
