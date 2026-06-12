import { ScarperWordmark } from './ScarperWordmark'
import './BrandMark.css'

interface BrandMarkProps {
  /** sm：导航栏；lg：登录页 */
  size?: 'sm' | 'lg'
  tagline?: string
  className?: string
}

export function BrandMark({
  size = 'sm',
  tagline,
  className = '',
}: BrandMarkProps) {
  return (
    <div
      className={`brand-mark brand-mark--${size}${tagline ? ' brand-mark--stacked' : ''} ${className}`.trim()}
    >
      <div className="brand-mark__row">
        <img
          className="brand-mark__logo"
          src="/assets/logo.svg"
          alt=""
          width={size === 'lg' ? 48 : 32}
          height={size === 'lg' ? 48 : 32}
          decoding="async"
        />
        <ScarperWordmark size={size} />
      </div>
      {tagline && <p className="brand-mark__tagline">{tagline}</p>}
    </div>
  )
}